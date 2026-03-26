import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";
const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const CONTRACT_PROMPT = `You are an expert OCR system specialized in reading contracts and legal documents.
Carefully read ALL text visible in the document image/PDF.
Extract key contract information as structured data.

Return ONLY valid JSON with this structure:
{
  "title": "<document title or contract name>",
  "contractType": "<contract | receipt | report | other>",
  "parties": ["<party name 1>", "<party name 2>"],
  "effectiveDate": "<YYYY-MM-DD or null>",
  "expiryDate": "<YYYY-MM-DD or null>",
  "amount": <contract value as number or null>,
  "currency": "<currency code, default JPY>",
  "summary": "<brief 1-2 sentence summary of the document>",
  "tags": ["<suggested tags based on content>"],
  "rawText": "<all readable text from the document>"
}

IMPORTANT:
- For Japanese documents: keep original Japanese text, use standard date format.
- Extract monetary amounts accurately including tax.
- Identify all parties/signatories mentioned.
- Suggest relevant tags based on document content (e.g., "NDA", "業務委託", "賃貸", etc.).
Return ONLY valid JSON, no markdown fences or extra text.`;

const INVOICE_PROMPT = `You are an expert OCR system specialized in reading invoices and billing documents.
Carefully read ALL text visible in the invoice image/PDF.
Extract billing information as structured data.

Return ONLY valid JSON with this structure:
{
  "invoiceNumber": "<invoice number/ID>",
  "amount": <total amount as number, 0 if not found>,
  "currency": "<currency code, default JPY>",
  "issueDate": "<YYYY-MM-DD or null>",
  "dueDate": "<YYYY-MM-DD or null>",
  "issuer": "<company/person issuing the invoice>",
  "recipient": "<company/person receiving the invoice>",
  "items": [{"name": "<line item>", "amount": <amount as number>}],
  "taxAmount": <tax amount as number or null>,
  "category": "<freelance | salary | dividend | other>",
  "rawText": "<all readable text>"
}

IMPORTANT:
- For Japanese invoices (請求書): read 請求番号, 合計金額, 発行日, 支払期限 carefully.
- Extract each line item with its amount.
- Identify tax (消費税/VAT) separately if visible.
- Amount should be the total including tax.
Return ONLY valid JSON, no markdown fences or extra text.`;

const CERTIFICATION_PROMPT = `You are an expert OCR system specialized in reading certificates, licenses, and credential documents.
Carefully read ALL text visible on the certificate image.
Extract credential information as structured data.

Return ONLY valid JSON with this structure:
{
  "name": "<certification/license name>",
  "issuingOrganization": "<issuing body/authority>",
  "issueDate": "<YYYY-MM-DD or null>",
  "expiryDate": "<YYYY-MM-DD or null>",
  "credentialId": "<certificate number/ID or null>",
  "holderName": "<name of the certified person>",
  "rawText": "<all readable text>"
}

IMPORTANT:
- For Japanese certificates: read 資格名, 発行機関, 取得日, 有効期限, 登録番号 carefully.
- Keep the official certification name exactly as printed.
- Extract dates in YYYY-MM-DD format (convert 令和/平成 era dates).
- Include any registration or credential numbers.
Return ONLY valid JSON, no markdown fences or extra text.`;

const BUSINESS_CARD_PROMPT = `You are an expert OCR system specialized in reading business cards (名刺).
Carefully read ALL text visible on the business card image.
Extract contact information as structured data.

Return ONLY valid JSON with this structure:
{
  "name": "<person's full name>",
  "company": "<company/organization name>",
  "title": "<job title/position>",
  "email": "<email address or null>",
  "phone": "<phone number or null>",
  "address": "<full address or null>",
  "website": "<website URL or null>",
  "department": "<department name or null>",
  "rawText": "<all readable text>"
}

IMPORTANT:
- For Japanese business cards (名刺): read both Japanese and English text if present.
- Distinguish between 氏名 (personal name) and 会社名 (company name).
- Extract 役職 (title), 部署 (department) separately.
- Phone numbers: include country code if visible, preserve formatting.
- If multiple phone/fax numbers exist, use the main phone number.
Return ONLY valid JSON, no markdown fences or extra text.`;

type DocType = "contract" | "invoice" | "certification" | "business_card";

const PROMPTS: Record<DocType, string> = {
  contract: CONTRACT_PROMPT,
  invoice: INVOICE_PROMPT,
  certification: CERTIFICATION_PROMPT,
  business_card: BUSINESS_CARD_PROMPT,
};

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing Supabase configuration" }, 500);
  }
  if (!geminiApiKey) {
    return jsonResponse({ error: "Missing Gemini API key" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing authorization" }, 401);
  }
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: { base64Data: string; mimeType: string; type: DocType };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { base64Data, mimeType, type } = body;
  if (!base64Data || !mimeType || !type) {
    return jsonResponse(
      { error: "base64Data, mimeType, and type are required" },
      400,
    );
  }

  const prompt = PROMPTS[type];
  if (!prompt) {
    return jsonResponse({ error: `Unknown type: ${type}` }, 400);
  }

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error("Gemini API error:", geminiResponse.status, errText);
      return jsonResponse({ error: "AI analysis failed" }, 502);
    }

    const geminiData = await geminiResponse.json();
    const textContent =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

    let result: Record<string, unknown>;
    try {
      result = JSON.parse(textContent);
    } catch {
      result = { rawText: textContent };
    }

    return jsonResponse({ type, result });
  } catch (err) {
    console.error("OCR Document error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

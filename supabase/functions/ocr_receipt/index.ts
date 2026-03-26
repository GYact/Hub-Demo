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

const OCR_PROMPT = `You are an expert receipt/invoice OCR system.
Analyze the provided image and extract the following information as JSON:
{
  "amount": <total amount as number, 0 if not found>,
  "currency": "<currency code, default JPY>",
  "date": "<date in YYYY-MM-DD format, null if not found>",
  "title": "<store/vendor name or description>",
  "items": [{"name": "<item name>", "amount": <item amount>}],
  "rawText": "<all readable text from the image>"
}
Return ONLY valid JSON, no markdown fences or extra text.
If the receipt is in Japanese, still use the JSON keys above but values can be in Japanese.`;

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing Supabase configuration" }, 500);
  }
  if (!geminiApiKey) {
    return jsonResponse({ error: "Missing Gemini API key" }, 500);
  }

  // Authenticate user
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

  // Parse request body
  let body: { base64Data: string; mimeType: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { base64Data, mimeType } = body;
  if (!base64Data || !mimeType) {
    return jsonResponse({ error: "base64Data and mimeType are required" }, 400);
  }

  // Call Gemini Flash with image
  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: OCR_PROMPT },
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
      return jsonResponse({ error: "OCR processing failed" }, 502);
    }

    const geminiData = await geminiResponse.json();
    const textContent =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

    let ocrResult: Record<string, unknown>;
    try {
      ocrResult = JSON.parse(textContent);
    } catch {
      ocrResult = { rawText: textContent };
    }

    return jsonResponse(ocrResult);
  } catch (err) {
    console.error("OCR error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

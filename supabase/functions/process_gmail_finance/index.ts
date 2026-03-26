import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import {
  getValidTokenEntries,
  refreshAccessToken,
} from "../_shared/googleAuth.ts";
import {
  resolveFolderPath,
  uploadFileToDrive,
} from "../_shared/googleDrive.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";
const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";

const WALL_CLOCK_LIMIT_MS = 25_000;
const BATCH_SIZE = 10;

// Google Drive destination paths
const DRIVE_INVOICE_PATH = "97_Finance/Invoice";
const DRIVE_EXPENSE_PATH = "97_Finance/Expenditures";

// ---------- Types ----------

interface GmailMessage {
  id: string;
  user_id: string;
  google_email: string;
  message_id: string;
  subject: string | null;
  sender: string | null;
  body_text: string | null;
  body_html: string | null;
  date: string | null;
  has_attachments: boolean;
  attachments: AttachmentMeta[] | null;
}

interface AttachmentMeta {
  filename: string;
  mimeType: string;
  size: number;
  storagePath?: string;
}

interface ClassificationResult {
  type: "invoice" | "expense" | "irrelevant";
  confidence: number;
  amount: number | null;
  currency: string;
  date: string | null;
  vendor: string | null;
  invoiceNumber: string | null;
  category:
    | "transport"
    | "food"
    | "supplies"
    | "software"
    | "hardware"
    | "communication"
    | "entertainment"
    | "education"
    | "other"
    | "freelance"
    | "salary"
    | "dividend"
    | null;
  summary: string;
  dueDate: string | null;
}

// ---------- Gemini classification ----------

const CLASSIFY_PROMPT = `You are a financial document classifier for a freelancer's Gmail.
Analyze the email subject, sender, and body below, then classify it.

Rules:
- "invoice" = a billing document sent TO the user (someone is charging us). Examples: SaaS subscriptions, hosting fees, service bills.
- "expense" = a receipt or payment confirmation for something the user purchased. Examples: purchase receipts, payment confirmations, subscription payments.
- "irrelevant" = not a financial document. Examples: newsletters, marketing, social notifications, regular correspondence.
- If the email is clearly financial (contains amounts, invoice numbers, payment info), set confidence >= 0.8.
- If uncertain, set confidence < 0.5 and type to "irrelevant".

For "invoice" type, also extract:
- invoiceNumber: the invoice/billing number if present
- dueDate: payment deadline if mentioned (YYYY-MM-DD)
- category: "freelance" | "salary" | "dividend" | "other"

For "expense" type, also extract:
- category: "transport" | "food" | "supplies" | "software" | "hardware" | "communication" | "entertainment" | "education" | "other"

Return ONLY valid JSON:
{
  "type": "invoice" | "expense" | "irrelevant",
  "confidence": 0.0-1.0,
  "amount": <number or null>,
  "currency": "JPY" | "USD" | "EUR",
  "date": "YYYY-MM-DD" or null,
  "vendor": "<company/sender name>" or null,
  "invoiceNumber": "<string>" or null,
  "category": "<category>" or null,
  "summary": "<brief one-line description>",
  "dueDate": "YYYY-MM-DD" or null
}`;

async function classifyEmail(
  subject: string,
  sender: string,
  bodyText: string,
): Promise<ClassificationResult> {
  const emailContent = `Subject: ${subject}\nFrom: ${sender}\n\n${bodyText.slice(0, 3000)}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { parts: [{ text: CLASSIFY_PROMPT }, { text: emailContent }] },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  return JSON.parse(text) as ClassificationResult;
}

// ---------- Attachment OCR via Gemini ----------

async function ocrAttachment(
  base64Data: string,
  mimeType: string,
  docType: "invoice" | "expense",
): Promise<Record<string, unknown>> {
  const prompt =
    docType === "invoice"
      ? `Extract invoice data as JSON: {"invoiceNumber","amount","currency","issueDate","dueDate","issuer","recipient","items":[{"name","amount"}],"taxAmount","rawText"}`
      : `Extract receipt data as JSON: {"amount","currency","date","title","items":[{"name","amount"}],"rawText"}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64Data } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!res.ok) return {};
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  try {
    return JSON.parse(text);
  } catch {
    return { rawText: text };
  }
}

// ---------- Main handler ----------

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing Supabase configuration" }, 500);
  }
  if (!geminiApiKey) {
    return jsonResponse({ error: "Missing GEMINI_API_KEY" }, 500);
  }

  const startTime = Date.now();
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const stats = { processed: 0, invoices: 0, expenses: 0, skipped: 0 };

  try {
    // Get all users with valid Google tokens
    const entries = await getValidTokenEntries(supabase);
    if (entries.length === 0) {
      return jsonResponse({ message: "No valid Google tokens", stats });
    }

    for (const entry of entries) {
      if (Date.now() - startTime > WALL_CLOCK_LIMIT_MS) break;

      const { user_id: userId, google_email: googleEmail } = entry;

      // Fetch unprocessed messages with attachments
      const { data: messages, error: fetchError } = await supabase
        .from("google_gmail_messages")
        .select(
          "id, user_id, google_email, message_id, subject, sender, body_text, body_html, date, has_attachments, attachments",
        )
        .eq("user_id", userId)
        .eq("google_email", googleEmail)
        .eq("finance_processed", false)
        .order("date", { ascending: false })
        .limit(BATCH_SIZE);

      if (fetchError || !messages || messages.length === 0) continue;

      let accessToken: string | null = null;

      for (const msg of messages as GmailMessage[]) {
        if (Date.now() - startTime > WALL_CLOCK_LIMIT_MS) break;

        const subject = msg.subject ?? "";
        const sender = msg.sender ?? "";
        const bodyText = msg.body_text ?? msg.body_html ?? "";

        // Skip very short emails (likely not financial)
        if (!subject && bodyText.length < 20) {
          await markProcessed(supabase, msg.id, {
            type: "irrelevant",
            confidence: 0,
            summary: "Empty or too short",
          });
          stats.skipped++;
          continue;
        }

        // Classify with Gemini
        let classification: ClassificationResult;
        try {
          classification = await classifyEmail(subject, sender, bodyText);
        } catch (e) {
          console.error(
            `[finance] Classification error for ${msg.message_id}:`,
            e,
          );
          continue;
        }

        // Skip irrelevant or low-confidence
        if (
          classification.type === "irrelevant" ||
          classification.confidence < 0.6
        ) {
          await markProcessed(supabase, msg.id, classification);
          stats.skipped++;
          continue;
        }

        // Get access token lazily
        if (!accessToken) {
          try {
            accessToken = await refreshAccessToken(
              supabase,
              userId,
              googleEmail,
            );
          } catch (e) {
            console.error(`[finance] Token refresh failed for ${userId}:`, e);
            break; // Skip this user entirely
          }
        }

        // Process attachments: upload to Drive + OCR
        let driveFileId: string | null = null;
        let ocrData: Record<string, unknown> = {};
        const attachments = msg.attachments ?? [];
        const financialAttachment = attachments.find((a) =>
          /\.(pdf|png|jpg|jpeg|gif|webp)$/i.test(a.filename),
        );

        if (financialAttachment?.storagePath) {
          try {
            // Download from Supabase Storage
            const { data: fileData, error: dlError } = await supabase.storage
              .from("gmail-attachments")
              .download(financialAttachment.storagePath);

            if (!dlError && fileData) {
              const arrayBuffer = await fileData.arrayBuffer();
              const uint8 = new Uint8Array(arrayBuffer);

              // Upload to Google Drive
              const drivePath =
                classification.type === "invoice"
                  ? DRIVE_INVOICE_PATH
                  : DRIVE_EXPENSE_PATH;
              const folderId = await resolveFolderPath(accessToken, drivePath);
              driveFileId = await uploadFileToDrive(
                accessToken,
                folderId,
                financialAttachment.filename,
                financialAttachment.mimeType,
                uint8,
              );

              // OCR the attachment
              if (uint8.length < 4_000_000) {
                const base64 = btoa(String.fromCharCode(...uint8));
                ocrData = await ocrAttachment(
                  base64,
                  financialAttachment.mimeType,
                  classification.type,
                );
              }
            }
          } catch (e) {
            console.error(`[finance] Attachment processing error:`, e);
          }
        }

        // Create finance record
        const now = new Date().toISOString();
        const recordId = crypto.randomUUID();

        if (classification.type === "invoice") {
          const ym = now.slice(0, 7).replace("-", "");
          const invoiceNumber =
            classification.invoiceNumber ??
            `AUTO-${ym}-${recordId.slice(0, 4).toUpperCase()}`;

          const { error: insertError } = await supabase
            .from("invoices")
            .insert({
              id: recordId,
              user_id: userId,
              invoice_number: invoiceNumber,
              amount: classification.amount ?? (ocrData.amount as number) ?? 0,
              currency:
                classification.currency ??
                (ocrData.currency as string) ??
                "JPY",
              status: "issued",
              issue_date:
                classification.date ??
                (ocrData.issueDate as string) ??
                msg.date?.slice(0, 10) ??
                null,
              due_date:
                classification.dueDate ?? (ocrData.dueDate as string) ?? null,
              category: classification.category ?? "other",
              document_type: "invoice",
              notes: classification.summary,
              items: (ocrData.items as unknown[]) ?? [],
              tax_rate: 10,
              tax_included: false,
              ocr_extracted: ocrData,
              source_gmail_message_id: msg.message_id,
              google_drive_file_id: driveFileId,
              vendor: classification.vendor,
              created_at: now,
              updated_at: now,
            });

          if (insertError) {
            console.error(`[finance] Invoice insert error:`, insertError);
          } else {
            stats.invoices++;
          }
        } else if (classification.type === "expense") {
          const { error: insertError } = await supabase
            .from("expenses")
            .insert({
              id: recordId,
              user_id: userId,
              title:
                classification.vendor ??
                (ocrData.title as string) ??
                subject.slice(0, 100),
              amount: classification.amount ?? (ocrData.amount as number) ?? 0,
              currency:
                classification.currency ??
                (ocrData.currency as string) ??
                "JPY",
              expense_date:
                classification.date ??
                (ocrData.date as string) ??
                msg.date?.slice(0, 10) ??
                null,
              category: classification.category ?? "other",
              notes: classification.summary,
              ocr_extracted: ocrData,
              source_gmail_message_id: msg.message_id,
              google_drive_file_id: driveFileId,
              vendor: classification.vendor,
              created_at: now,
              updated_at: now,
            });

          if (insertError) {
            console.error(`[finance] Expense insert error:`, insertError);
          } else {
            stats.expenses++;
          }
        }

        // Mark as processed
        await markProcessed(supabase, msg.id, classification);
        stats.processed++;
      }
    }

    console.log(`[process_gmail_finance] Done:`, stats);
    return jsonResponse({ success: true, stats });
  } catch (err) {
    console.error("[process_gmail_finance] Fatal error:", err);
    return jsonResponse(
      {
        error: err instanceof Error ? err.message : "Unknown error",
        stats,
      },
      500,
    );
  }
});

// ---------- Helpers ----------

async function markProcessed(
  supabase: ReturnType<typeof createClient>,
  rowId: string,
  classification: Record<string, unknown>,
) {
  await supabase
    .from("google_gmail_messages")
    .update({
      finance_processed: true,
      finance_classification: classification,
    })
    .eq("id", rowId);
}

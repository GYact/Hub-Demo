import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { buildInvoicePdf } from "../_shared/invoicePdfBuilder.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader)
      return jsonResponse({ error: "Missing authorization" }, 401);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { invoiceId } = await req.json();
    if (!invoiceId)
      return jsonResponse({ error: "invoiceId is required" }, 400);

    // 1. Load invoice (ownership check via user_id)
    const { data: invoice, error: invError } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("user_id", user.id)
      .single();

    if (invError || !invoice) {
      return jsonResponse({ error: "Invoice not found" }, 404);
    }

    // 2. Load client info
    let clientName = "";
    let clientAddress = "";
    let clientContactName = "";
    if (invoice.client_id) {
      const { data: client } = await supabaseAdmin
        .from("clients")
        .select("name, address, contact_name")
        .eq("id", invoice.client_id)
        .single();
      if (client) {
        clientName = client.name ?? "";
        clientAddress = client.address ?? "";
        clientContactName = client.contact_name ?? "";
      }
    }

    // 3. Load project info
    let projectName = "";
    if (invoice.project_id) {
      const { data: project } = await supabaseAdmin
        .from("projects")
        .select("name")
        .eq("id", invoice.project_id)
        .single();
      if (project) {
        projectName = project.name ?? "";
      }
    }

    // 4. Load business info from user_settings
    const { data: settingRow } = await supabaseAdmin
      .from("user_settings")
      .select("value")
      .eq("user_id", user.id)
      .eq("key", "invoice_business_info")
      .single();

    const business = settingRow?.value ?? {};
    if (!business.companyName) {
      return jsonResponse(
        { error: "Business info not configured. Please set up in Settings." },
        400,
      );
    }

    // 5. Generate PDF
    const items = Array.isArray(invoice.items) ? invoice.items : [];
    const pdfBytes = await buildInvoicePdf({
      invoiceNumber: invoice.invoice_number ?? "",
      issueDate: invoice.issue_date ?? new Date().toISOString().split("T")[0],
      dueDate: invoice.due_date ?? null,
      amount: invoice.amount ?? 0,
      currency: invoice.currency ?? "JPY",
      notes: invoice.notes ?? "",
      clientName,
      clientAddress,
      clientContactName,
      projectName,
      items,
      taxRate: invoice.tax_rate ?? 10,
      taxIncluded: invoice.tax_included === true,
      business,
    });

    // 6. Upload to storage (filename = invoice number)
    const safeNumber = (invoice.invoice_number || invoiceId).replace(
      /[^a-zA-Z0-9_\-]/g,
      "_",
    );
    const pdfPath = `${user.id}/invoices/${safeNumber}.pdf`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("money-files")
      .upload(pdfPath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("PDF upload failed:", uploadError);
      return jsonResponse({ error: "Failed to upload PDF" }, 500);
    }

    // 7. Update invoice: set pdf path and status to issued
    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("invoices")
      .update({
        pdf_storage_path: pdfPath,
        status: "issued",
        issue_date: invoice.issue_date || now.split("T")[0],
        updated_at: now,
      })
      .eq("id", invoiceId);

    if (updateError) {
      console.error("Invoice update failed:", updateError);
      return jsonResponse({ error: "Failed to update invoice" }, 500);
    }

    return jsonResponse({
      success: true,
      pdfStoragePath: pdfPath,
      status: "issued",
    });
  } catch (err) {
    console.error("generate_invoice_pdf error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});

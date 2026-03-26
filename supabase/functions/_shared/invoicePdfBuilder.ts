import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";

interface BusinessInfo {
  companyName: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  bankName: string;
  bankBranch: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
}

interface InvoiceItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

interface InvoiceData {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  amount: number;
  currency: string;
  notes: string;
  clientName: string;
  clientAddress: string;
  clientContactName: string;
  projectName: string;
  items?: InvoiceItem[];
  taxRate?: number;
  taxIncluded?: boolean;
  business: BusinessInfo;
}

// Font cache for warm starts (persists across invocations in same isolate)
let fontBytesCache: Uint8Array | null = null;

const FONT_URL =
  "https://fonts.gstatic.com/s/notosansjp/v56/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75s.ttf";

async function loadJapaneseFont(): Promise<Uint8Array> {
  if (fontBytesCache) return fontBytesCache;

  const res = await fetch(FONT_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Japanese font: ${res.status}`);
  }

  fontBytesCache = new Uint8Array(await res.arrayBuffer());
  return fontBytesCache;
}

/**
 * Normalize full-width ASCII (Ａ-Ｚ, ａ-ｚ, ０-９, symbols) to half-width.
 * Prevents garbled/spaced digits when rendered with CJK font subsets.
 */
function toHalfWidth(str: string): string {
  return str
    .replace(/[\uFF01-\uFF5E]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    )
    .replace(/\u3000/g, " ");
}

/**
 * Normalize phone string: convert all dash-like chars to ASCII hyphen,
 * strip whitespace and anything that isn't digit / plus / hyphen / parens.
 */
function normalizePhone(raw: string): string {
  return toHalfWidth(raw)
    .replace(/[\u30FC\u2010\u2012\u2013\u2014\u2015\u2212\uFF70]/g, "-")
    .replace(/[^\d+\-()]/g, "");
}

function formatAmount(amount: number, currency: string): string {
  if (currency === "JPY") {
    return `¥${Math.round(amount).toLocaleString("ja-JP")}`;
  }
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

// Color palette
const cream = rgb(0.965, 0.902, 0.773); // #f6e6c5
const deepNavy = rgb(0.118, 0.231, 0.408); // #1e3b68
const gold = rgb(0.612, 0.455, 0.208); // #9c7435
const darkNavy = rgb(0.051, 0.106, 0.165); // #0d1b2a
const white = rgb(1, 1, 1);

type PdfPage = ReturnType<PDFDocument["getPages"]>[0];

function drawLine(
  page: PdfPage,
  y: number,
  marginLeft: number,
  marginRight: number,
  pageWidth: number,
) {
  page.drawLine({
    start: { x: marginLeft, y },
    end: { x: pageWidth - marginRight, y },
    thickness: 0.5,
    color: gold,
  });
}

/**
 * Build a professional Japanese invoice PDF from structured data.
 * A4 size (595.28 x 841.89 pt).
 * Color palette: Cream / Deep Navy / Antique Gold / Dark Navy.
 */
export async function buildInvoicePdf(raw: InvoiceData): Promise<Uint8Array> {
  const hw = (s: string) => toHalfWidth(s);
  const data: InvoiceData = {
    ...raw,
    invoiceNumber: hw(raw.invoiceNumber),
    issueDate: hw(raw.issueDate),
    dueDate: raw.dueDate ? hw(raw.dueDate) : null,
    notes: hw(raw.notes),
    clientName: hw(raw.clientName),
    clientAddress: hw(raw.clientAddress),
    clientContactName: hw(raw.clientContactName),
    projectName: hw(raw.projectName),
    business: {
      companyName: hw(raw.business.companyName),
      name: hw(raw.business.name || ""),
      address: hw(raw.business.address),
      phone: normalizePhone(raw.business.phone),
      email: hw(raw.business.email),
      bankName: hw(raw.business.bankName),
      bankBranch: hw(raw.business.bankBranch),
      accountType: hw(raw.business.accountType),
      accountNumber: hw(raw.business.accountNumber),
      accountHolder: hw(raw.business.accountHolder),
    },
  };

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fontBytes = await loadJapaneseFont();
  const jpFont = await pdfDoc.embedFont(fontBytes);
  // Helvetica for ASCII-only text (phone, email, numbers)
  // NotoSansJP CJK subset renders ASCII digits with full-width advance widths
  const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const marginL = 50;
  const marginR = 50;
  const contentWidth = width - marginL - marginR;

  // === Top accent bar (gold) ===
  page.drawRectangle({
    x: 0,
    y: height - 6,
    width,
    height: 6,
    color: gold,
  });

  let y = height - 50;

  // === Title banner (cream background) ===
  const title = "請 求 書";
  const titleSize = 24;
  const titleWidth = jpFont.widthOfTextAtSize(title, titleSize);

  page.drawRectangle({
    x: marginL,
    y: y - 10,
    width: contentWidth,
    height: 40,
    color: cream,
  });

  page.drawText(title, {
    x: (width - titleWidth) / 2,
    y: y - 2,
    size: titleSize,
    font: jpFont,
    color: deepNavy,
  });
  y -= 60;

  // === Invoice number & dates (right-aligned) ===
  const infoSize = 10;
  const infoLines = [
    `請求番号: ${data.invoiceNumber}`,
    `発行日: ${data.issueDate}`,
  ];
  if (data.dueDate) {
    infoLines.push(`支払期限: ${data.dueDate}`);
  }

  for (const line of infoLines) {
    const lineWidth = jpFont.widthOfTextAtSize(line, infoSize);
    page.drawText(line, {
      x: width - marginR - lineWidth,
      y,
      size: infoSize,
      font: jpFont,
      color: darkNavy,
    });
    y -= 16;
  }
  y -= 10;

  drawLine(page, y, marginL, marginR, width);
  y -= 25;

  // === Client section (left) ===
  const sectionLabelSize = 9;
  const clientSize = 12;
  const detailSize = 10;

  page.drawText("宛先", {
    x: marginL,
    y,
    size: sectionLabelSize,
    font: jpFont,
    color: gold,
  });
  y -= 20;

  if (data.clientName) {
    const honorific = data.clientName + "  御中";
    page.drawText(honorific, {
      x: marginL,
      y,
      size: clientSize,
      font: jpFont,
      color: darkNavy,
    });
    y -= 18;
  }

  if (data.clientAddress) {
    page.drawText(data.clientAddress, {
      x: marginL,
      y,
      size: detailSize,
      font: jpFont,
      color: deepNavy,
    });
    y -= 16;
  }

  if (data.clientContactName) {
    page.drawText(`担当: ${data.clientContactName} 様`, {
      x: marginL,
      y,
      size: detailSize,
      font: jpFont,
      color: deepNavy,
    });
    y -= 16;
  }

  y -= 10;
  drawLine(page, y, marginL, marginR, width);
  y -= 25;

  // === Amount section ===
  page.drawText("下記の通りご請求申し上げます。", {
    x: marginL,
    y,
    size: detailSize,
    font: jpFont,
    color: darkNavy,
  });
  y -= 30;

  // Column positions for line items table
  const colNameX = marginL;
  const colQtyX = marginL + contentWidth * 0.55;
  const colPriceX = marginL + contentWidth * 0.7;
  const colAmtX = marginL + contentWidth * 0.85;
  const tableRight = width - marginR;

  const items: InvoiceItem[] =
    data.items && data.items.length > 0
      ? data.items
      : [
          {
            name: data.projectName || "業務委託",
            quantity: 1,
            unitPrice: data.amount,
          },
        ];

  const taxRate = data.taxRate ?? 10;
  const taxIncluded = data.taxIncluded ?? false;

  // Table header (deep navy background)
  const tableHeaderY = y;
  page.drawRectangle({
    x: marginL,
    y: tableHeaderY - 5,
    width: contentWidth,
    height: 22,
    color: deepNavy,
  });

  // Header: 品名 left-aligned, others right-aligned to match data columns
  page.drawText("品名", {
    x: colNameX + 8,
    y: tableHeaderY,
    size: detailSize,
    font: jpFont,
    color: white,
  });
  const hQty = "数量";
  const hQtyW = jpFont.widthOfTextAtSize(hQty, detailSize);
  page.drawText(hQty, {
    x: colPriceX - hQtyW - 8,
    y: tableHeaderY,
    size: detailSize,
    font: jpFont,
    color: white,
  });
  const hPrice = "単価";
  const hPriceW = jpFont.widthOfTextAtSize(hPrice, detailSize);
  page.drawText(hPrice, {
    x: colAmtX - hPriceW - 8,
    y: tableHeaderY,
    size: detailSize,
    font: jpFont,
    color: white,
  });
  const hAmt = "金額";
  const hAmtW = jpFont.widthOfTextAtSize(hAmt, detailSize);
  page.drawText(hAmt, {
    x: tableRight - hAmtW - 8,
    y: tableHeaderY,
    size: detailSize,
    font: jpFont,
    color: white,
  });
  y = tableHeaderY - 25;

  // Table rows
  let subtotal = 0;
  for (const item of items) {
    const lineAmt = item.quantity * item.unitPrice;
    subtotal += lineAmt;

    // Item name (truncate if too long)
    const maxNameChars = 30;
    const nameStr =
      item.name.length > maxNameChars
        ? item.name.slice(0, maxNameChars) + "…"
        : item.name;
    page.drawText(nameStr, {
      x: colNameX + 8,
      y,
      size: detailSize,
      font: jpFont,
      color: darkNavy,
    });

    // Quantity (right-aligned within column) — latinFont for proper digit spacing
    const qtyStr = item.quantity.toString();
    const qtyW = latinFont.widthOfTextAtSize(qtyStr, detailSize);
    page.drawText(qtyStr, {
      x: colPriceX - qtyW - 8,
      y,
      size: detailSize,
      font: latinFont,
      color: darkNavy,
    });

    // Unit price (right-aligned)
    const priceStr = Math.round(item.unitPrice).toLocaleString("ja-JP");
    const priceW = latinFont.widthOfTextAtSize(priceStr, detailSize);
    page.drawText(priceStr, {
      x: colAmtX - priceW - 8,
      y,
      size: detailSize,
      font: latinFont,
      color: darkNavy,
    });

    // Line amount (right-aligned)
    const lineAmtStr = Math.round(lineAmt).toLocaleString("ja-JP");
    const lineAmtW = latinFont.widthOfTextAtSize(lineAmtStr, detailSize);
    page.drawText(lineAmtStr, {
      x: tableRight - lineAmtW - 8,
      y,
      size: detailSize,
      font: latinFont,
      color: darkNavy,
    });

    y -= 18;

    // Row separator — visually centered between rows
    // 10pt font: ascent ~8pt, descent ~2pt → visual center at y+12
    page.drawLine({
      start: { x: marginL, y: y + 12 },
      end: { x: tableRight, y: y + 12 },
      thickness: 0.5,
      color: rgb(0.75, 0.75, 0.75),
    });
  }

  // Notes (multi-line) below items
  if (data.notes) {
    y -= 4;
    const noteLines = data.notes.split("\n").slice(0, 8);
    for (const line of noteLines) {
      if (!line.trim()) {
        y -= 10;
        continue;
      }
      const maxChars = 60;
      const truncated =
        line.length > maxChars ? line.slice(0, maxChars) + "…" : line;
      page.drawText(truncated, {
        x: colNameX + 16,
        y,
        size: 9,
        font: jpFont,
        color: deepNavy,
      });
      y -= 14;
    }
  }

  y -= 5;
  drawLine(page, y, marginL, marginR, width);
  y -= 20;

  // === Subtotal / Tax / Total (right-aligned) ===
  const summaryLabelX = colPriceX - 20;
  const summaryValueRight = tableRight - 8;
  const summarySize = 11;

  // Calculate tax based on inclusive/exclusive mode
  const taxAmt = taxIncluded
    ? Math.round((subtotal * taxRate) / (100 + taxRate))
    : Math.round((subtotal * taxRate) / 100);
  const netSubtotal = taxIncluded ? subtotal - taxAmt : subtotal;
  const totalAmt = taxIncluded ? subtotal : subtotal + taxAmt;

  // Subtotal (税抜金額 for inclusive, 小計 for exclusive)
  const subtotalLabel = taxIncluded ? "税抜金額" : "小計";
  const subtotalStr = Math.round(netSubtotal).toLocaleString("ja-JP");
  const subtotalW = latinFont.widthOfTextAtSize(subtotalStr, summarySize);
  page.drawText(subtotalLabel, {
    x: summaryLabelX,
    y,
    size: summarySize,
    font: jpFont,
    color: darkNavy,
  });
  page.drawText(subtotalStr, {
    x: summaryValueRight - subtotalW,
    y,
    size: summarySize,
    font: latinFont,
    color: darkNavy,
  });
  y -= 18;

  // Tax
  const taxLabel = taxIncluded
    ? `うち消費税 (${taxRate}%)`
    : `消費税 (${taxRate}%)`;
  const taxStr = taxAmt.toLocaleString("ja-JP");
  const taxW = latinFont.widthOfTextAtSize(taxStr, summarySize);
  page.drawText(taxLabel, {
    x: summaryLabelX,
    y,
    size: summarySize,
    font: jpFont,
    color: darkNavy,
  });
  page.drawText(taxStr, {
    x: summaryValueRight - taxW,
    y,
    size: summarySize,
    font: latinFont,
    color: darkNavy,
  });
  y -= 20;

  // Total
  const totalSize = 14;
  const totalLabel = taxIncluded ? "合計金額(税込)" : "合計金額";
  const totalStr = formatAmount(totalAmt, data.currency);
  const totalWidth = latinFont.widthOfTextAtSize(totalStr, totalSize);
  page.drawText(totalLabel, {
    x: summaryLabelX,
    y,
    size: totalSize,
    font: jpFont,
    color: darkNavy,
  });
  page.drawText(totalStr, {
    x: summaryValueRight - totalWidth,
    y,
    size: totalSize,
    font: latinFont,
    color: darkNavy,
  });
  y -= 15;

  // Gold underline for total
  page.drawLine({
    start: { x: summaryLabelX, y },
    end: { x: tableRight, y },
    thickness: 1.5,
    color: gold,
  });

  y -= 35;
  drawLine(page, y, marginL, marginR, width);
  y -= 25;

  // === Bank details ===
  const biz = data.business;
  if (biz.bankName) {
    page.drawText("振込先", {
      x: marginL,
      y,
      size: sectionLabelSize,
      font: jpFont,
      color: gold,
    });
    y -= 18;

    const bankLine = `${biz.bankName}  ${biz.bankBranch}`;
    page.drawText(bankLine, {
      x: marginL,
      y,
      size: detailSize,
      font: jpFont,
      color: darkNavy,
    });
    y -= 16;

    const accountLine = `${biz.accountType}  ${biz.accountNumber}`;
    page.drawText(accountLine, {
      x: marginL,
      y,
      size: detailSize,
      font: jpFont,
      color: darkNavy,
    });
    y -= 16;

    page.drawText(`口座名義: ${biz.accountHolder}`, {
      x: marginL,
      y,
      size: detailSize,
      font: jpFont,
      color: darkNavy,
    });
    y -= 22;

    page.drawText("※振込手数料は御社のご負担にてお願いいたします。", {
      x: marginL,
      y,
      size: 9,
      font: jpFont,
      color: deepNavy,
    });
    y -= 25;

    drawLine(page, y, marginL, marginR, width);
    y -= 25;
  }

  // === Issuer info (right-aligned) ===
  page.drawText("発行者", {
    x: width - marginR - 150,
    y,
    size: sectionLabelSize,
    font: jpFont,
    color: gold,
  });
  y -= 18;

  // Pure ASCII check: use latinFont for phone/email to avoid CJK full-width digit spacing
  const isAscii = (s: string) => /^[\x20-\x7E]*$/.test(s);

  const issuerLines = [
    biz.companyName,
    biz.name,
    biz.address,
    biz.phone ? `電話: ${biz.phone}` : "",
    biz.email,
  ].filter(Boolean);

  for (const line of issuerLines) {
    const font = isAscii(line) ? latinFont : jpFont;
    const lineWidth = font.widthOfTextAtSize(line, detailSize);
    page.drawText(line, {
      x: width - marginR - lineWidth,
      y,
      size: detailSize,
      font,
      color: deepNavy,
    });
    y -= 16;
  }

  return await pdfDoc.save();
}

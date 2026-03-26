import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";

export interface AgendaItem {
  title: string;
  duration: string;
  description: string;
  presenter?: string;
}

export interface AgendaData {
  meetingTitle: string;
  date: string;
  time: string;
  location: string;
  organizer: string;
  attendees: string[];
  objective: string;
  agendaItems: AgendaItem[];
  referenceNotes: string[];
  actionItems: string[];
}

let fontBytesCache: Uint8Array | null = null;
const FONT_URL =
  "https://fonts.gstatic.com/s/notosansjp/v56/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75s.ttf";

async function loadJapaneseFont(): Promise<Uint8Array> {
  if (fontBytesCache) return fontBytesCache;
  const res = await fetch(FONT_URL);
  if (!res.ok) throw new Error(`Failed to fetch font: ${res.status}`);
  fontBytesCache = new Uint8Array(await res.arrayBuffer());
  return fontBytesCache;
}

function toHalfWidth(str: string): string {
  return str
    .replace(/[\uFF01-\uFF5E]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    )
    .replace(/\u3000/g, " ");
}

// Color palette (matching invoice style)
const cream = rgb(0.965, 0.902, 0.773);
const deepNavy = rgb(0.118, 0.231, 0.408);
const gold = rgb(0.612, 0.455, 0.208);
const darkNavy = rgb(0.051, 0.106, 0.165);
const white = rgb(1, 1, 1);
const lightGray = rgb(0.95, 0.95, 0.95);

type PdfPage = ReturnType<PDFDocument["getPages"]>[0];
type PdfFont = Awaited<ReturnType<PDFDocument["embedFont"]>>;

function drawLine(page: PdfPage, y: number, x1: number, x2: number) {
  page.drawLine({
    start: { x: x1, y },
    end: { x: x2, y },
    thickness: 0.5,
    color: gold,
  });
}

/** Wrap text into lines that fit within maxWidth */
function wrapText(
  text: string,
  font: PdfFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const words = text.split("");
  const lines: string[] = [];
  let current = "";

  for (const char of words) {
    const test = current + char;
    const w = font.widthOfTextAtSize(test, fontSize);
    if (w > maxWidth && current.length > 0) {
      lines.push(current);
      current = char;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function buildAgendaPdf(raw: AgendaData): Promise<Uint8Array> {
  const data: AgendaData = {
    ...raw,
    meetingTitle: toHalfWidth(raw.meetingTitle),
    date: toHalfWidth(raw.date),
    time: toHalfWidth(raw.time),
    location: toHalfWidth(raw.location),
    organizer: toHalfWidth(raw.organizer),
    objective: toHalfWidth(raw.objective),
  };

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fontBytes = await loadJapaneseFont();
  const jpFont = await pdfDoc.embedFont(fontBytes);
  const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const latinBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const mL = 50;
  const mR = 50;
  const cW = width - mL - mR;

  // Top accent bar
  page.drawRectangle({ x: 0, y: height - 6, width, height: 6, color: gold });

  let y = height - 50;

  // === Title banner ===
  const title = "Meeting Agenda";
  const titleSize = 22;
  const titleW = latinBold.widthOfTextAtSize(title, titleSize);

  page.drawRectangle({ x: mL, y: y - 10, width: cW, height: 40, color: cream });
  page.drawText(title, {
    x: (width - titleW) / 2,
    y: y - 2,
    size: titleSize,
    font: latinBold,
    color: deepNavy,
  });
  y -= 60;

  // === Meeting Info ===
  const labelSize = 9;
  const detailSize = 10;

  const drawInfoRow = (label: string, value: string) => {
    page.drawText(label, {
      x: mL,
      y,
      size: labelSize,
      font: jpFont,
      color: gold,
    });
    page.drawText(toHalfWidth(value), {
      x: mL + 80,
      y,
      size: detailSize,
      font: jpFont,
      color: darkNavy,
    });
    y -= 16;
  };

  page.drawText("会議名", {
    x: mL,
    y,
    size: labelSize,
    font: jpFont,
    color: gold,
  });
  page.drawText(data.meetingTitle, {
    x: mL + 80,
    y,
    size: 12,
    font: jpFont,
    color: darkNavy,
  });
  y -= 20;

  drawInfoRow("日時", `${data.date}  ${data.time}`);
  drawInfoRow("場所", data.location);
  drawInfoRow("主催", data.organizer);

  // Attendees
  page.drawText("参加者", {
    x: mL,
    y,
    size: labelSize,
    font: jpFont,
    color: gold,
  });
  const attendeeStr = data.attendees.map((a) => toHalfWidth(a)).join(", ");
  const attendeeLines = wrapText(attendeeStr, jpFont, detailSize, cW - 80);
  for (const line of attendeeLines) {
    page.drawText(line, {
      x: mL + 80,
      y,
      size: detailSize,
      font: jpFont,
      color: darkNavy,
    });
    y -= 14;
  }
  y -= 6;

  drawLine(page, y, mL, width - mR);
  y -= 20;

  // === Objective ===
  if (data.objective) {
    page.drawText("目的", {
      x: mL,
      y,
      size: labelSize,
      font: jpFont,
      color: gold,
    });
    y -= 16;
    const objLines = wrapText(data.objective, jpFont, detailSize, cW);
    for (const line of objLines) {
      page.drawText(line, {
        x: mL,
        y,
        size: detailSize,
        font: jpFont,
        color: darkNavy,
      });
      y -= 14;
    }
    y -= 10;
    drawLine(page, y, mL, width - mR);
    y -= 20;
  }

  // === Agenda Items Table ===
  page.drawText("アジェンダ", {
    x: mL,
    y,
    size: 11,
    font: jpFont,
    color: deepNavy,
  });
  y -= 20;

  // Table header
  const colNumX = mL;
  const colTitleX = mL + 30;
  const colDurX = mL + cW * 0.7;
  const colPresX = mL + cW * 0.82;
  const tableRight = width - mR;

  page.drawRectangle({
    x: mL,
    y: y - 5,
    width: cW,
    height: 22,
    color: deepNavy,
  });
  page.drawText("#", {
    x: colNumX + 8,
    y,
    size: detailSize,
    font: latinFont,
    color: white,
  });
  page.drawText("議題", {
    x: colTitleX + 8,
    y,
    size: detailSize,
    font: jpFont,
    color: white,
  });
  page.drawText("時間", {
    x: colDurX,
    y,
    size: detailSize,
    font: jpFont,
    color: white,
  });
  page.drawText("担当", {
    x: colPresX,
    y,
    size: detailSize,
    font: jpFont,
    color: white,
  });
  y -= 25;

  for (let i = 0; i < data.agendaItems.length; i++) {
    const item = data.agendaItems[i];

    // Alternating row background
    if (i % 2 === 0) {
      page.drawRectangle({
        x: mL,
        y: y - 5,
        width: cW,
        height: 18,
        color: lightGray,
      });
    }

    // Number
    const numStr = `${i + 1}`;
    page.drawText(numStr, {
      x: colNumX + 12,
      y,
      size: detailSize,
      font: latinFont,
      color: darkNavy,
    });

    // Title (truncate)
    const maxTitleChars = 35;
    const titleStr =
      item.title.length > maxTitleChars
        ? item.title.slice(0, maxTitleChars) + "…"
        : item.title;
    page.drawText(toHalfWidth(titleStr), {
      x: colTitleX + 8,
      y,
      size: detailSize,
      font: jpFont,
      color: darkNavy,
    });

    // Duration
    page.drawText(toHalfWidth(item.duration), {
      x: colDurX,
      y,
      size: detailSize,
      font: jpFont,
      color: darkNavy,
    });

    // Presenter
    if (item.presenter) {
      const presStr =
        item.presenter.length > 10
          ? item.presenter.slice(0, 10) + "…"
          : item.presenter;
      page.drawText(toHalfWidth(presStr), {
        x: colPresX,
        y,
        size: detailSize,
        font: jpFont,
        color: darkNavy,
      });
    }

    y -= 18;

    // Description (if present, indented below title)
    if (item.description) {
      const descLines = wrapText(
        toHalfWidth(item.description),
        jpFont,
        9,
        cW - 50,
      );
      for (const dl of descLines.slice(0, 2)) {
        page.drawText(dl, {
          x: colTitleX + 16,
          y,
          size: 9,
          font: jpFont,
          color: deepNavy,
        });
        y -= 12;
      }
    }

    // Row separator
    page.drawLine({
      start: { x: mL, y: y + 8 },
      end: { x: tableRight, y: y + 8 },
      thickness: 0.3,
      color: rgb(0.8, 0.8, 0.8),
    });
  }

  y -= 10;
  drawLine(page, y, mL, width - mR);
  y -= 20;

  // === Reference Notes ===
  if (data.referenceNotes.length > 0) {
    page.drawText("参考情報", {
      x: mL,
      y,
      size: 11,
      font: jpFont,
      color: deepNavy,
    });
    y -= 18;

    for (const note of data.referenceNotes.slice(0, 8)) {
      const hw = toHalfWidth(note);
      const noteLines = wrapText(hw, jpFont, 9, cW - 15);
      page.drawText("•", {
        x: mL + 4,
        y,
        size: 9,
        font: latinFont,
        color: gold,
      });
      for (const nl of noteLines.slice(0, 2)) {
        page.drawText(nl, {
          x: mL + 16,
          y,
          size: 9,
          font: jpFont,
          color: darkNavy,
        });
        y -= 12;
      }
      y -= 2;

      if (y < 80) break;
    }

    y -= 8;
    drawLine(page, y, mL, width - mR);
    y -= 20;
  }

  // === Action Items ===
  if (data.actionItems.length > 0 && y > 80) {
    page.drawText("アクションアイテム", {
      x: mL,
      y,
      size: 11,
      font: jpFont,
      color: deepNavy,
    });
    y -= 18;

    for (const action of data.actionItems.slice(0, 6)) {
      if (y < 50) break;
      const hw = toHalfWidth(action);
      // Checkbox style
      page.drawRectangle({
        x: mL + 4,
        y: y - 2,
        width: 8,
        height: 8,
        borderColor: gold,
        borderWidth: 0.8,
        color: white,
      });
      const actionLines = wrapText(hw, jpFont, 9, cW - 20);
      for (const al of actionLines.slice(0, 2)) {
        page.drawText(al, {
          x: mL + 18,
          y,
          size: 9,
          font: jpFont,
          color: darkNavy,
        });
        y -= 12;
      }
      y -= 2;
    }
  }

  // === Footer ===
  const footerY = 30;
  const footerText = `Generated on ${new Date().toISOString().slice(0, 10)}`;
  const footerW = latinFont.widthOfTextAtSize(footerText, 8);
  page.drawText(footerText, {
    x: width - mR - footerW,
    y: footerY,
    size: 8,
    font: latinFont,
    color: rgb(0.6, 0.6, 0.6),
  });

  // Bottom accent bar
  page.drawRectangle({ x: 0, y: 0, width, height: 4, color: gold });

  return await pdfDoc.save();
}

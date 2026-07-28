import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getOrderById, getCompanyInfo } from "@/lib/supabase";
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import QRCode from "qrcode";
import { formatMileage, formatPersonWithInitials, getActLabels, supportedActLanguages } from "@/lib/act-report";
import type { Language } from "@/lib/i18n";
import { requireApiUser } from "@/lib/api-security";
import { configureUnicodePdfFont } from "@/lib/pdf-font";
import { generateOrderShareToken, verifyOrderShareToken } from "@/lib/share-token";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const PAGE_BOTTOM_LIMIT = 275;
const FOOTER_REQUIRED_HEIGHT = 55;

function moneyValue(value: number | null | undefined) {
  return (Number(value) || 0).toLocaleString("ro-MD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function sanitizeFilename(value: string) {
  return value.replace(/[^\p{L}\p{N}_-]+/gu, "_").replace(/_+/g, "_").slice(0, 80);
}

function getReportLanguage(request: NextRequest): Language {
  const requested = request.nextUrl.searchParams.get("lang") as Language | null;
  if (requested && supportedActLanguages.includes(requested)) return requested;
  const cookieLanguage = request.cookies.get("crm-language")?.value as Language | undefined;
  return cookieLanguage && supportedActLanguages.includes(cookieLanguage) ? cookieLanguage : "ru";
}

function textFit(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, options?: { align?: "left" | "center" | "right"; fontSize?: number; maxLines?: number }) {
  const fontSize = options?.fontSize || 8;
  doc.setFontSize(fontSize);
  const value = text || "-";
  const lines = doc.splitTextToSize(value, maxWidth);
  doc.text(lines.slice(0, options?.maxLines || 3), x, y, { align: options?.align || "left", maxWidth });
}

function drawBox(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.rect(x, y, w, h);
}

function setFontStyle(doc: jsPDF, style: "normal" | "bold") {
  doc.setFont(doc.getFont().fontName, style);
}

function drawLabelBox(doc: jsPDF, label: string, value: string, x: number, y: number, labelW: number, valueW: number, h = 5.4) {
  doc.setFontSize(8.5);
  setFontStyle(doc, "bold");
  textFit(doc, label, x, y + 3.6, labelW - 1, { fontSize: label.includes("\n") ? 6.8 : 7.8, maxLines: 2 });
  setFontStyle(doc, "normal");
  drawBox(doc, x + labelW, y, valueW, h);
  setFontStyle(doc, "bold");
  textFit(doc, value, x + labelW + 1.4, y + 3.8, valueW - 2.8, { fontSize: 8.4 });
  setFontStyle(doc, "normal");
}

function resetPageStyles(doc: jsPDF, fontName: string) {
  doc.setFont(fontName, "normal");
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
}

async function makeQrDataUrl(value: string) {
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
  });
}

function getPublicBaseUrl(request: NextRequest) {
  // 1. Explicit env var — used on Vercel production
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured && !configured.includes("0.0.0.0") && !configured.includes("localhost")) return configured;

  // 2. Derive from actual request headers (carries the real IP/host the client used)
  const proto = request.headers.get("x-forwarded-proto") || "http";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host && !host.startsWith("localhost") && !host.startsWith("127.0.0.1") && !host.startsWith("0.0.0.0")) {
    return `${proto}://${host}`;
  }

  // 3. Fallback to request URL
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function getPageLabel(language: Language) {
  if (language === "ro") return "Pagina";
  if (language === "en") return "Page";
  return "Страница";
}

function getOfLabel(language: Language) {
  if (language === "ro") return "din";
  if (language === "en") return "of";
  return "из";
}

/**
 * Multi-page-aware table drawing.
 * If a row would overflow past PAGE_BOTTOM_LIMIT, a new page is created,
 * the header is re-drawn, and drawing continues seamlessly.
 */
function drawTable(
  doc: jsPDF,
  fontName: string,
  config: {
    x: number;
    y: number;
    widths: number[];
    header: string[];
    rows: string[][];
    totalLabel: string;
    totalValue: string;
  }
): number {
  const tableWidth = config.widths.reduce((sum, width) => sum + width, 0);
  const headerH = 7;
  const rows = config.rows.length ? config.rows : [config.header.map(() => "")];

  // Pre-compute row heights
  const rowHeights = rows.map((row) => {
    const maxLines = row.reduce((max, value, colIndex) => {
      doc.setFontSize(colIndex === 2 && row.length === 6 ? 7.8 : 8.5);
      return Math.max(max, doc.splitTextToSize(value || "-", config.widths[colIndex] - 3).length);
    }, 1);
    return Math.max(7, Math.min(18, maxLines * 3.9 + 3));
  });

  let y = config.y;

  // --- Draw header ---
  function drawHeader(startY: number) {
    doc.setLineWidth(0.25);
    // Header row box
    doc.rect(config.x, startY, tableWidth, headerH);
    // Column dividers in header
    let cx = config.x;
    config.widths.slice(0, -1).forEach((w) => {
      cx += w;
      doc.line(cx, startY, cx, startY + headerH);
    });
    // Header text
    setFontStyle(doc, "bold");
    doc.setFontSize(8.8);
    cx = config.x;
    config.header.forEach((title, index) => {
      textFit(doc, title, cx + config.widths[index] / 2, startY + 4.5, config.widths[index] - 2, { align: "center", fontSize: 8.6, maxLines: 2 });
      cx += config.widths[index];
    });
    setFontStyle(doc, "normal");
    return startY + headerH;
  }

  let rowY = drawHeader(y);
  // Track the top of the current page segment (for vertical lines)
  let segmentTopY = y;

  rows.forEach((row, rowIndex) => {
    const rowH = rowHeights[rowIndex];

    // Check if this row would overflow
    if (rowY + rowH > PAGE_BOTTOM_LIMIT) {
      // Close current segment: draw outer rect + vertical column dividers
      const segmentH = rowY - segmentTopY;
      doc.rect(config.x, segmentTopY, tableWidth, segmentH);
      let cx = config.x;
      config.widths.slice(0, -1).forEach((w) => {
        cx += w;
        doc.line(cx, segmentTopY + headerH, cx, rowY);
      });

      // New page
      doc.addPage();
      resetPageStyles(doc, fontName);
      rowY = 15;
      segmentTopY = rowY;
      rowY = drawHeader(rowY);
    }

    // Draw horizontal line at top of this row (acts as bottom of previous row)
    doc.line(config.x, rowY, config.x + tableWidth, rowY);

    // Draw cell content
    let cellX = config.x;
    row.forEach((value, colIndex) => {
      const width = config.widths[colIndex];
      const align = colIndex >= row.length - 3 ? "right" : colIndex === 0 ? "center" : "left";
      const textX = align === "right" ? cellX + width - 1.5 : align === "center" ? cellX + width / 2 : cellX + 1.5;
      textFit(doc, value, textX, rowY + 4.6, width - 3, { align, fontSize: colIndex === 2 && row.length === 6 ? 7.8 : 8.5, maxLines: 4 });
      cellX += width;
    });

    rowY += rowH;
  });

  // Close final segment: outer rect + vertical column dividers
  const finalSegmentH = rowY - segmentTopY;
  doc.rect(config.x, segmentTopY, tableWidth, finalSegmentH);
  let cx = config.x;
  config.widths.slice(0, -1).forEach((w) => {
    cx += w;
    doc.line(cx, segmentTopY + headerH, cx, rowY);
  });

  // Draw total row
  const totalY = rowY;
  const totalBoxW = 31;
  const totalGap = 4;
  const labelW = 55;
  const totalBoxX = config.x + tableWidth - totalBoxW;
  const labelX = totalBoxX - totalGap;
  setFontStyle(doc, "bold");
  textFit(doc, config.totalLabel, labelX, totalY + 7.3, labelW, { align: "right", fontSize: 8, maxLines: 1 });
  drawBox(doc, totalBoxX, totalY + 3, totalBoxW, 6);
  textFit(doc, config.totalValue, config.x + tableWidth - 1.5, totalY + 7.3, totalBoxW - 3, { align: "right", fontSize: 8 });
  setFontStyle(doc, "normal");

  return totalY + 13;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  // Check for public share token bypass
  const shareToken = request.nextUrl.searchParams.get("share");
  if (shareToken) {
    if (!verifyOrderShareToken(id, shareToken)) {
      return new NextResponse("Invalid or expired share link", { status: 403 });
    }
    // Token valid — skip auth
  } else {
    // Normal authenticated flow
    const auth = await requireApiUser();
    if (auth.response) return auth.response;
  }

  const order = await getOrderById(id);

  if (!order) {
    return new NextResponse("Order not found", { status: 404 });
  }

  const companyInfo = await getCompanyInfo();
  const includeQr = request.nextUrl.searchParams.get("qr") === "1";

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const fontName = configureUnicodePdfFont(doc, "ActUnicode");
  const language = getReportLanguage(request);
  const labels = getActLabels(language);
  const pageWidth = doc.internal.pageSize.width;
  const margin = 10;

  doc.setFont(fontName, "normal");
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);

  // Logo left
  const logoCandidates = [
    join(process.cwd(), "public", "autoservice-logo.png"),
    join(process.cwd(), "public", "icon-192.png"),
  ];
  const logoPath = logoCandidates.find((p) => existsSync(p));
  if (logoPath) {
    try {
      doc.addImage(readFileSync(logoPath).toString("base64"), "PNG", margin + 3, 12, 48, 18);
    } catch {
      /* ignore bad image */
    }
  }

  const orderNo = order.id.slice(0, 8).toUpperCase();

  // Company NAME centered (as before)
  doc.setFont(fontName, "bold");
  doc.setFontSize(15);
  doc.text(companyInfo[0], pageWidth / 2, 13, { align: "center" });
  doc.setFontSize(14);
  doc.text(`${labels.orderTitle} ${orderNo}`, pageWidth / 2, 27, { align: "center" });
  doc.setFontSize(9);
  doc.setFont(fontName, "normal");
  doc.text(format(new Date(order.order_date), "dd.MM.yyyy"), pageWidth / 2, 37, { align: "center" });

  // Company details column on the RIGHT — nudged ~3mm left only
  doc.setFontSize(8.5);
  doc.setFont(fontName, "bold");
  const companyX = pageWidth - margin - 50; // was 47; slightly left
  companyInfo.slice(1).forEach((line, index) => doc.text(line, companyX, 13 + index * 4));
  doc.setFont(fontName, "normal");

  // Reserve space for the right-side company header block
  const headerRows = Math.max(companyInfo.length - 1, 7);
  const headerBottom = 13 + headerRows * 4 + 4;

  const workItems = order.items?.filter((item) => item.type === "work") || [];
  const partItems = order.items?.filter((item) => item.type === "part") || [];
  const repairMileage = order.car_mileage || order.car.mileage || 0;
  const workTotal = workItems.reduce((sum, item) => sum + (Number(item.total_price) || Number(item.quantity) * Number(item.selling_price)), 0);
  const partsTotal = partItems.reduce((sum, item) => sum + (Number(item.total_price) || Number(item.quantity) * Number(item.selling_price)), 0);

  let y = Math.max(43, headerBottom);
  drawLabelBox(doc, labels.beneficiary, order.client.full_name, margin + 1, y, 17, 93);
  drawLabelBox(doc, labels.phone, order.client.phone || "-", margin + 120, y, 8, 54);
  y += 7;
  drawLabelBox(doc, "VIN", order.car.vin || "-", margin + 1, y, 8, 102);
  y += 9;
  drawLabelBox(doc, labels.model, `${order.car.brand} ${order.car.model}`, margin + 1, y, 14, 38);
  drawLabelBox(doc, labels.plate, order.car.license_plate || "-", margin + 55, y - 1.5, 10, 38, 6.9);
  drawLabelBox(doc, labels.year, order.car.year ? String(order.car.year) : "-", margin + 105, y - 1.5, 17, 25, 6.9);
  drawLabelBox(doc, labels.mileage, repairMileage ? `${formatMileage(repairMileage)} ${labels.km}` : "-", margin + 148, y - 1.5, 17, 25, 6.9);
  y += 9;

  y = drawTable(doc, fontName, {
    x: margin,
    y,
    widths: [8, 76, 28, 18, 30, 30],
    header: labels.workHeaders,
    rows: workItems.map((item, index) => [
      String(index + 1),
      item.name,
      formatPersonWithInitials(item.mechanic_name),
      String(item.quantity),
      moneyValue(item.selling_price),
      moneyValue(item.total_price),
    ]),
    totalLabel: labels.workTotal,
    totalValue: moneyValue(workTotal),
  }) + 8;

  // If the parts table + footer won't fit, start new page
  if (y > PAGE_BOTTOM_LIMIT - 30) {
    doc.addPage();
    resetPageStyles(doc, fontName);
    y = 15;
  }

  y = drawTable(doc, fontName, {
    x: margin,
    y,
    widths: [8, 88, 20, 18, 28, 28],
    header: labels.partHeaders,
    rows: partItems.map((item, index) => [
      String(index + 1),
      item.name,
      item.code ? item.code.slice(0, 18) : "-",
      String(item.quantity),
      moneyValue(item.selling_price),
      moneyValue(item.total_price),
    ]),
    totalLabel: labels.partsTotal,
    totalValue: moneyValue(partsTotal),
  }) + 8;

  // If the footer won't fit on the current page, add a new page
  if (y + FOOTER_REQUIRED_HEIGHT > PAGE_BOTTOM_LIMIT + 15) {
    doc.addPage();
    resetPageStyles(doc, fontName);
    y = 15;
  }

  const bottomY = y;
  doc.setFontSize(9);
  doc.text(labels.serviceNote1, margin, bottomY);
  doc.text(labels.serviceNote2, margin, bottomY + 5);
  doc.setFont(fontName, "bold");
  doc.text(labels.grandTotal, margin + 122, bottomY + 3);
  drawBox(doc, margin + 160, bottomY - 1, 30, 6);
  textFit(doc, moneyValue(order.total_amount), margin + 188.5, bottomY + 3.3, 27, { align: "right", fontSize: 8 });
  doc.setFont(fontName, "normal");

  doc.setFont(fontName, "bold");
  doc.text(labels.masterControl, margin, bottomY + 18);
  doc.line(margin + 32, bottomY + 18, margin + 82, bottomY + 18);
  doc.setFontSize(7);
  doc.setFont(fontName, "normal");
  doc.text(labels.signature, margin + 50, bottomY + 21);

  doc.setFontSize(9);
  doc.setFont(fontName, "bold");
  doc.text(labels.beneficiaryReceived, margin + 98, bottomY + 18);
  doc.line(margin + 138, bottomY + 18, margin + 186, bottomY + 18);
  doc.setFontSize(7);
  doc.setFont(fontName, "normal");
  doc.text(labels.signature, margin + 155, bottomY + 21);
  doc.setFontSize(9);
  doc.text(labels.acknowledgement, margin + 98, bottomY + 28);

  // --- Generate share URL and QR code (only if requested via ?qr=1) ---
  const safeFilename = `Order_${orderNo}_${language}.pdf`;
  const utf8Filename = encodeURIComponent(`${sanitizeFilename(labels.fileTitle)}_${orderNo}_${sanitizeFilename(order.client.full_name)}.pdf`);

  if (includeQr) {
    // Build the secure stateless share URL for this order
    const token = generateOrderShareToken(id);
    const baseUrl = getPublicBaseUrl(request);
    const qrUrl = `${baseUrl}/orders/${id}/pdf?lang=${language}&share=${token}`;

    // Draw QR code (clean, no labels)
    try {
      const qrDataUrl = await makeQrDataUrl(qrUrl);
      const qrSize = 23;
      const qrX = margin;
      const qrY = bottomY + 28;
      doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
    } catch (error) {
      console.error("[pdf] failed to draw QR:", error);
    }
  }

  // --- Page numbering ---
  const totalPages = doc.getNumberOfPages();
  if (totalPages > 1) {
    const pageLabel = getPageLabel(language);
    const ofLabel = getOfLabel(language);
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont(fontName, "normal");
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text(`${pageLabel} ${i} ${ofLabel} ${totalPages}`, pageWidth / 2, 290, { align: "center" });
      doc.setTextColor(0, 0, 0);
    }
  }

  const pdfBuffer = doc.output("arraybuffer");

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFilename}"; filename*=UTF-8''${utf8Filename}`,
      "Cache-Control": "private, no-store",
    },
  });
}

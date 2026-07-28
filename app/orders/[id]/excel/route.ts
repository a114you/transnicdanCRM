import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "fs";
import { join } from "path";
import { getOrderById, getCompanyInfo } from "@/lib/supabase";
import * as ExcelJS from "exceljs";
import { format } from "date-fns";
import { formatMileage, formatPersonWithInitials, getActLabels, supportedActLanguages } from "@/lib/act-report";
import type { Language } from "@/lib/i18n";
import { requireApiUser } from "@/lib/api-security";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function getReportLanguage(request: NextRequest): Language {
  const requested = request.nextUrl.searchParams.get("lang") as Language | null;
  if (requested && supportedActLanguages.includes(requested)) return requested;
  const cookieLanguage = request.cookies.get("crm-language")?.value as Language | undefined;
  return cookieLanguage && supportedActLanguages.includes(cookieLanguage) ? cookieLanguage : "ru";
}

function moneyValue(value: number | null | undefined) {
  return (Number(value) || 0).toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sanitizeFilename(value: string) {
  return value.replace(/[^\p{L}\p{N}_-]+/gu, "_").replace(/_+/g, "_").slice(0, 80);
}

const thin: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF000000" } },
  bottom: { style: "thin", color: { argb: "FF000000" } },
  left: { style: "thin", color: { argb: "FF000000" } },
  right: { style: "thin", color: { argb: "FF000000" } },
};

function cell(ws: ExcelJS.Worksheet, row: number, col: number) {
  return ws.getCell(row, col);
}

function merge(ws: ExcelJS.Worksheet, row: number, startCol: number, endCol: number) {
  if (startCol !== endCol) ws.mergeCells(row, startCol, row, endCol);
  return cell(ws, row, startCol);
}

function style(cell: ExcelJS.Cell, options: { bold?: boolean; size?: number; align?: "left" | "center" | "right"; border?: boolean } = {}) {
  cell.font = { name: "Arial", size: options.size || 9, bold: options.bold || false, color: { argb: "FF000000" } };
  cell.alignment = { horizontal: options.align || "left", vertical: "middle", wrapText: true };
  if (options.border) cell.border = thin;
}

function borderRange(ws: ExcelJS.Worksheet, startRow: number, endRow: number, startCol: number, endCol: number) {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      cell(ws, row, col).border = thin;
    }
  }
}

function labelBox(ws: ExcelJS.Worksheet, row: number, labelCols: [number, number], valueCols: [number, number], label: string, value: string, height = 17) {
  ws.getRow(row).height = Math.max(ws.getRow(row).height || 0, height);
  const labelCell = merge(ws, row, labelCols[0], labelCols[1]);
  const valueCell = merge(ws, row, valueCols[0], valueCols[1]);
  labelCell.value = label.replace(/\n/g, " ");
  valueCell.value = value || "-";
  style(labelCell, { bold: true, size: 8.5 });
  style(valueCell, { bold: true, size: 8.5, border: true });
  borderRange(ws, row, row, valueCols[0], valueCols[1]);
}

function rowHeight(values: (string | number)[], spans: number[]) {
  const maxLines = values.reduce<number>((max, value, index) => {
    const chars = String(value || "").length;
    const span = spans[index] ?? 1;
    return Math.max(max, Math.ceil(chars / Math.max(span * 7, 10)));
  }, 1);
  return Math.max(18, Math.min(42, 15 + maxLines * 7));
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const { id } = await params;
  const order = await getOrderById(id);

  if (!order) return new NextResponse("Order not found", { status: 404 });

  const language = getReportLanguage(request);
  const labels = getActLabels(language);
  const orderNo = order.id.slice(0, 8).toUpperCase();
  const companyInfo = await getCompanyInfo();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AUTOSERVICE CRM";
  workbook.created = new Date();
  workbook.modified = new Date();

  const ws = workbook.addWorksheet(labels.fileTitle);
  ws.views = [{ showGridLines: false }];
  ws.pageSetup = {
    paperSize: 9,
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    horizontalCentered: true,
    margins: { left: 0.28, right: 0.28, top: 0.28, bottom: 0.28, header: 0.12, footer: 0.12 },
  };
  ws.columns = Array.from({ length: 19 }, () => ({ width: 5.2 }));
  for (let row = 1; row <= 44; row += 1) ws.getRow(row).height = 16;

  // Logo left (autoservice brand)
  const logoCandidates = [
    join(process.cwd(), "public", "autoservice-logo.png"),
    join(process.cwd(), "public", "icon-192.png"),
  ];
  const logoPath = logoCandidates.find((p) => existsSync(p));
  if (logoPath) {
    const imageId = workbook.addImage({ filename: logoPath, extension: "png" });
    ws.addImage(imageId, { tl: { col: 0.6, row: 0.6 }, ext: { width: 155, height: 55 } });
  }

  // Company NAME centered (as before)
  merge(ws, 1, 6, 14).value = companyInfo[0];
  style(cell(ws, 1, 6), { bold: true, size: 15, align: "center" });
  merge(ws, 3, 7, 13).value = `${labels.orderTitle} ${orderNo}`;
  style(cell(ws, 3, 7), { bold: true, size: 14, align: "center" });
  merge(ws, 5, 8, 12).value = format(new Date(order.order_date), "dd.MM.yyyy");
  style(cell(ws, 5, 8), { size: 9, align: "center" });

  // Company details column on the RIGHT — half-column left only (14–19 instead of 15–19)
  companyInfo.slice(1).forEach((line, index) => {
    const row = 1 + index;
    merge(ws, row, 14, 19).value = line;
    style(cell(ws, row, 14), { bold: true, size: 8 });
  });

  // Push body below right-side company header block
  const bodyStartRow = Math.max(8, companyInfo.length + 1);

  const workItems = order.items?.filter((item) => item.type === "work") || [];
  const partItems = order.items?.filter((item) => item.type === "part") || [];
  const repairMileage = order.car_mileage || order.car.mileage || 0;
  const workTotal = workItems.reduce((sum, item) => sum + (Number(item.total_price) || Number(item.quantity) * Number(item.selling_price)), 0);
  const partsTotal = partItems.reduce((sum, item) => sum + (Number(item.total_price) || Number(item.quantity) * Number(item.selling_price)), 0);

  labelBox(ws, bodyStartRow, [1, 2], [3, 12], labels.beneficiary, order.client.full_name);
  labelBox(ws, bodyStartRow, [13, 13], [14, 19], labels.phone, order.client.phone || "-");
  labelBox(ws, bodyStartRow + 1, [1, 2], [3, 12], "VIN", order.car.vin || "-");
  ws.getRow(bodyStartRow + 3).height = 37.5;
  labelBox(ws, bodyStartRow + 3, [1, 2], [3, 6], labels.model, `${order.car.brand} ${order.car.model}`);
  labelBox(ws, bodyStartRow + 3, [7, 7], [8, 10], labels.plate, order.car.license_plate || "-");
  labelBox(ws, bodyStartRow + 3, [11, 12], [13, 15], labels.year, order.car.year ? String(order.car.year) : "-");
  labelBox(ws, bodyStartRow + 3, [16, 17], [18, 19], labels.mileage, repairMileage ? `${formatMileage(repairMileage)} ${labels.km}` : "-");

  let rowIndex = bodyStartRow + 5;
  function addTable(headers: string[], rows: (string | number)[][], totalLabel: string, totalValue: number, colMap: [number, number][]) {
    const headerRow = rowIndex;
    ws.getRow(headerRow).height = 20;
    headers.forEach((header, index) => {
      const [start, end] = colMap[index];
      const target = merge(ws, headerRow, start, end);
      target.value = header;
      style(target, { bold: true, size: 9, align: "center" });
    });
    borderRange(ws, headerRow, headerRow, 1, 19);
    rowIndex += 1;

    const dataRows = rows.length ? rows : [headers.map(() => "")];
    dataRows.forEach((values) => {
      const spans = colMap.map(([start, end]) => end - start + 1);
      ws.getRow(rowIndex).height = rowHeight(values, spans);
      values.forEach((value, index) => {
        const [start, end] = colMap[index];
        const target = merge(ws, rowIndex, start, end);
        target.value = value;
        style(target, {
          size: 9,
          align: index === 0 ? "center" : index >= values.length - 3 ? "right" : "left",
        });
      });
      borderRange(ws, rowIndex, rowIndex, 1, 19);
      rowIndex += 1;
    });

    ws.getRow(rowIndex).height = Math.max(ws.getRow(rowIndex).height || 0, 28);
    merge(ws, rowIndex, 12, 16).value = totalLabel;
    style(cell(ws, rowIndex, 12), { bold: true, size: 9, align: "right" });
    merge(ws, rowIndex, 17, 19).value = moneyValue(totalValue);
    style(cell(ws, rowIndex, 17), { bold: true, size: 9, align: "right", border: true });
    borderRange(ws, rowIndex, rowIndex, 12, 16);
    borderRange(ws, rowIndex, rowIndex, 17, 19);
    rowIndex += 2;
  }

  addTable(
    labels.workHeaders,
    workItems.map((item, index) => [index + 1, item.name, formatPersonWithInitials(item.mechanic_name), String(item.quantity), moneyValue(item.selling_price), moneyValue(item.total_price)]),
    labels.workTotal,
    workTotal,
    [[1, 1], [2, 9], [10, 12], [13, 14], [15, 17], [18, 19]],
  );

  addTable(
    labels.partHeaders,
    partItems.map((item, index) => [index + 1, item.name, item.code ? item.code.slice(0, 18) : "-", String(item.quantity), moneyValue(item.selling_price), moneyValue(item.total_price)]),
    labels.partsTotal,
    partsTotal,
    [[1, 1], [2, 10], [11, 12], [13, 15], [16, 17], [18, 19]],
  );

  const bottomRow = Math.min(rowIndex + 1, 35);
  merge(ws, bottomRow, 1, 9).value = labels.serviceNote1;
  style(cell(ws, bottomRow, 1), { size: 9 });
  merge(ws, bottomRow + 1, 1, 9).value = labels.serviceNote2;
  style(cell(ws, bottomRow + 1, 1), { size: 9 });
  merge(ws, bottomRow, 14, 16).value = labels.grandTotal;
  style(cell(ws, bottomRow, 14), { bold: true, size: 9, align: "right" });
  merge(ws, bottomRow, 17, 19).value = moneyValue(order.total_amount);
  style(cell(ws, bottomRow, 17), { bold: true, size: 9, align: "right", border: true });
  borderRange(ws, bottomRow, bottomRow, 17, 19);

  merge(ws, bottomRow + 4, 1, 3).value = labels.masterControl;
  style(cell(ws, bottomRow + 4, 1), { bold: true, size: 9 });
  merge(ws, bottomRow + 4, 4, 9);
  cell(ws, bottomRow + 4, 4).border = { bottom: { style: "thin", color: { argb: "FF000000" } } };
  merge(ws, bottomRow + 5, 4, 9).value = labels.signature;
  style(cell(ws, bottomRow + 5, 4), { size: 8, align: "center" });

  merge(ws, bottomRow + 4, 11, 14).value = labels.beneficiaryReceived;
  style(cell(ws, bottomRow + 4, 11), { bold: true, size: 9 });
  merge(ws, bottomRow + 4, 15, 19);
  cell(ws, bottomRow + 4, 15).border = { bottom: { style: "thin", color: { argb: "FF000000" } } };
  merge(ws, bottomRow + 5, 15, 19).value = labels.signature;
  style(cell(ws, bottomRow + 5, 15), { size: 8, align: "center" });
  merge(ws, bottomRow + 8, 11, 19).value = labels.acknowledgement;
  style(cell(ws, bottomRow + 8, 11), { size: 9 });
  ws.pageSetup.printArea = `A1:S${Math.max(bottomRow + 8, rowIndex + 1)}`;

  const buffer = await workbook.xlsx.writeBuffer();
  const safeFilename = `Order_${orderNo}_${language}.xlsx`;
  const utf8Filename = encodeURIComponent(`${sanitizeFilename(labels.fileTitle)}_${orderNo}_${sanitizeFilename(order.client.full_name)}.xlsx`);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeFilename}"; filename*=UTF-8''${utf8Filename}`,
      "Cache-Control": "private, no-store",
    },
  });
}

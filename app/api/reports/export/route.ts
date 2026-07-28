import { NextRequest, NextResponse } from "next/server";
import * as ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { getOrders, getOrdersByDateRange } from "@/lib/supabase";
import { getDebtAgeDays, getOrderEconomy, getPaymentStatusLabel } from "@/lib/finance";
import { translatePhrase, type Language } from "@/lib/i18n";
import type { OrderWithDetails } from "@/lib/types";
import { requireApiUser } from "@/lib/api-security";
import { configureUnicodePdfFont } from "@/lib/pdf-font";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ReportTab = "finance" | "history" | "mechanics" | "debtors";

const supportedLanguages: Language[] = ["ru", "ro", "en"];
const supportedTabs: ReportTab[] = ["finance", "history", "mechanics", "debtors"];
function getLanguage(request: NextRequest): Language {
  const requested = request.nextUrl.searchParams.get("lang") as Language | null;
  return requested && supportedLanguages.includes(requested) ? requested : "ru";
}

function asciiFilename(tab: ReportTab, extension: string) {
  const name = tab === "finance" ? "Financial_report" : tab === "history" ? "Service_history" : tab === "mechanics" ? "Mechanics_report" : "Debtors_register";
  return `${name}.${extension}`;
}

function reportOrientation(tab: ReportTab): "portrait" | "landscape" {
  return tab === "finance" || tab === "debtors" ? "landscape" : "portrait";
}

function moneyValue(value: number | null | undefined) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function moneyText(value: number | null | undefined) {
  return moneyValue(value).toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function resolvePaidAmount(order: OrderWithDetails) {
  if (typeof order.paid_amount === "number") return moneyValue(order.paid_amount);
  if (order.payment_status === "unpaid") return 0;
  if (order.payment_status === "partial") return moneyValue(order.total_amount) - moneyValue(order.debt_amount);
  return moneyValue(order.total_amount);
}

function carLabel(order: OrderWithDetails) {
  return [order.car.brand, order.car.model, order.car.license_plate ? `(${order.car.license_plate})` : ""].filter(Boolean).join(" ");
}

function itemsSummary(order: OrderWithDetails, language: Language) {
  const t = (value: string) => translatePhrase(value, language);
  return (order.items || [])
    .map((item) => `${item.type === "work" ? t("Работа") : t("Запчасть")}: ${item.name} x${item.quantity} = ${moneyText(item.total_price)} MDL`)
    .join("\n");
}

function buildMechanicRows(orders: OrderWithDetails[], language: Language) {
  const t = (value: string) => translatePhrase(value, language);
  const rows = new Map<
    string,
    {
      key: string;
      mechanicName: string;
      worksCount: number;
      totalAmount: number;
      works: {
        order: OrderWithDetails;
        itemId: string;
        name: string;
        quantity: number;
        sellingPrice: number;
        totalPrice: number;
      }[];
    }
  >();

  orders.forEach((order) => {
    (order.items || [])
      .filter((item) => item.type === "work" && (item.mechanic_id || item.mechanic_name))
      .forEach((item) => {
        const key = item.mechanic_id || item.mechanic_name || "";
        const totalPrice = moneyValue(item.total_price) || moneyValue(item.quantity) * moneyValue(item.selling_price) || 0;
        const current = rows.get(key) || {
          key,
          mechanicName: item.mechanic_name || t("Без имени"),
          worksCount: 0,
          totalAmount: 0,
          works: [],
        };
        current.worksCount += 1;
        current.totalAmount += totalPrice;
        current.works.push({
          order,
          itemId: item.id,
          name: item.name,
          quantity: Number(item.quantity) || 0,
          sellingPrice: Number(item.selling_price) || 0,
          totalPrice,
        });
        rows.set(key, current);
      });
  });

  return Array.from(rows.values()).sort((a, b) => b.totalAmount - a.totalAmount);
}

function summarize(orders: OrderWithDetails[]) {
  return orders.reduce(
    (acc, order) => {
      const economy = getOrderEconomy(order.items || []);
      acc.totalOrders += 1;
      acc.totalRevenue += moneyValue(order.total_amount);
      acc.totalPaid += resolvePaidAmount(order);
      acc.totalDebt += moneyValue(order.debt_amount);
      acc.workRevenue += economy.workRevenue;
      acc.partsRevenue += economy.partsRevenue;
      acc.partsCost += economy.partsCost;
      acc.partsProfit += economy.partsProfit;
      acc.grossProfit += economy.grossProfit;
      acc.clientIds.add(order.client_id);
      return acc;
    },
    {
      totalOrders: 0,
      totalRevenue: 0,
      totalPaid: 0,
      totalDebt: 0,
      workRevenue: 0,
      partsRevenue: 0,
      partsCost: 0,
      partsProfit: 0,
      grossProfit: 0,
      clientIds: new Set<string>(),
    }
  );
}

async function getFilteredOrders(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const allTime = searchParams.get("all") === "1" || (!start && !end);
  const q = (searchParams.get("q")?.trim().toLowerCase() || "").slice(0, 120);
  const clientIds = (searchParams.get("clientIds") || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));

  if (!allTime && (!start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end)))) throw new Error("Missing date range");

  let orders = allTime ? await getOrders(5000) : await getOrdersByDateRange(start!, end!);
  if (clientIds.length > 0) {
    const allowed = new Set(clientIds);
    orders = orders.filter((order) => allowed.has(order.client_id));
  }
  if (q) {
    orders = orders.filter((order) =>
      [order.id, order.client.full_name, order.client.phone, order.car.brand, order.car.model, order.car.license_plate, order.car.vin]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }
  return orders;
}

function applyHeader(row: ExcelJS.Row, cols: number) {
  for (let i = 1; i <= cols; i++) {
    const cell = row.getCell(i);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    cell.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD1D5DB" } },
      bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
      left: { style: "thin", color: { argb: "FFD1D5DB" } },
      right: { style: "thin", color: { argb: "FFD1D5DB" } },
    };
  }
}

function applyCell(cell: ExcelJS.Cell, align: "left" | "center" | "right" = "left") {
  cell.font = { name: "Calibri", size: 10, color: { argb: "FF111827" } };
  cell.alignment = { horizontal: align, vertical: "middle", wrapText: true };
  cell.border = {
    top: { style: "thin", color: { argb: "FFE5E7EB" } },
    bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
    left: { style: "thin", color: { argb: "FFE5E7EB" } },
    right: { style: "thin", color: { argb: "FFE5E7EB" } },
  };
}

async function buildExcel(orders: OrderWithDetails[], tab: ReportTab, language: Language, start: string | null, end: string | null) {
  const t = (value: string) => translatePhrase(value, language);
  const workbook = new ExcelJS.Workbook();
  const currencyFmt = '#,##0.00 "MDL"';
  const title = tab === "finance" ? t("Финансовый анализ") : tab === "history" ? t("История обслуживания") : tab === "mechanics" ? t("Отчет по механикам") : t("Реестр должников");
  const summary = summarize(orders);
  const dateRange = start && end ? `${format(new Date(start), "dd.MM.yyyy")} - ${format(new Date(end), "dd.MM.yyyy")}` : t("За все время");
  const mechanicRows = tab === "mechanics" ? buildMechanicRows(orders, language) : [];

  const ws = workbook.addWorksheet(title);
  const headers =
    tab === "mechanics"
      ? [t("Дата"), t("Работа"), t("Клиент"), t("Автомобиль"), t("Кол-во"), t("Цена"), t("Сумма")]
      : tab === "debtors"
      ? [t("Дата ремонта"), t("Клиент"), t("Телефон"), t("Автомобиль"), t("Сумма"), t("Оплачено"), t("Долг"), t("Дата долга"), t("Дней долга")]
      : tab === "history"
        ? [t("Дата"), t("Клиент"), t("Телефон"), t("Автомобиль"), t("Пробег"), t("VIN"), t("Статус"), t("Детализация"), t("Сумма")]
        : [t("Дата заказа"), t("Клиент"), t("Автомобиль"), t("Статус"), t("Оплата"), t("Работы"), t("Запчасти"), t("Себест. запчастей"), t("Долг"), t("Прибыль сервиса"), t("Итого")];

  ws.mergeCells(1, 1, 1, headers.length);
  ws.getCell(1, 1).value = title;
  ws.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF6B00" } };
  ws.getCell(1, 1).font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" }, size: 16 };
  ws.getCell(1, 1).alignment = { horizontal: "center" };
  ws.mergeCells(2, 1, 2, headers.length);
  ws.getCell(2, 1).value = `${t("Период")}: ${dateRange} · ${t("Сформировано")}: ${format(new Date(), "dd.MM.yyyy HH:mm")}`;
  ws.getCell(2, 1).alignment = { horizontal: "center" };
  ws.addRow([]);

  let tableHeaderRow: ExcelJS.Row | undefined;

  if (tab === "mechanics") {
    const worksCountTotal = mechanicRows.reduce((sum, row) => sum + row.worksCount, 0);
    const amountTotal = mechanicRows.reduce((sum, row) => sum + row.totalAmount, 0);

    const rowSummary1 = ws.addRow([t("Исполнителей"), mechanicRows.length, t("Работ выполнено"), worksCountTotal]);
    applyCell(rowSummary1.getCell(1), "left");
    rowSummary1.getCell(1).font = { name: "Calibri", bold: true, size: 10 };
    applyCell(rowSummary1.getCell(2), "right");
    rowSummary1.getCell(2).font = { name: "Calibri", bold: true, size: 10 };
    applyCell(rowSummary1.getCell(3), "left");
    rowSummary1.getCell(3).font = { name: "Calibri", bold: true, size: 10 };
    applyCell(rowSummary1.getCell(4), "right");
    rowSummary1.getCell(4).font = { name: "Calibri", bold: true, size: 10 };

    const rowSummary2 = ws.addRow([t("Сумма работ"), amountTotal]);
    applyCell(rowSummary2.getCell(1), "left");
    rowSummary2.getCell(1).font = { name: "Calibri", bold: true, size: 10 };
    applyCell(rowSummary2.getCell(2), "right");
    rowSummary2.getCell(2).font = { name: "Calibri", bold: true, size: 10 };
    rowSummary2.getCell(2).numFmt = currencyFmt;

    ws.addRow([]);

    const overviewHeaderRow = ws.addRow([]);
    const rNum = overviewHeaderRow.number;

    ws.getCell(rNum, 1).value = t("Механик ФИО");
    ws.getCell(rNum, 3).value = t("Сделал работ");
    ws.getCell(rNum, 4).value = t("Сумма с работ");
    ws.getCell(rNum, 5).value = t("ЗП");

    ws.mergeCells(rNum, 1, rNum, 2);
    ws.mergeCells(rNum, 5, rNum, 7);

    applyHeader(overviewHeaderRow, 7);
    ws.getCell(rNum, 1).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    ws.getCell(rNum, 3).alignment = { horizontal: "right", vertical: "middle", wrapText: true };
    ws.getCell(rNum, 4).alignment = { horizontal: "right", vertical: "middle", wrapText: true };
    ws.getCell(rNum, 5).alignment = { horizontal: "right", vertical: "middle", wrapText: true };

    mechanicRows.forEach((mechanic) => {
      const dataRow = ws.addRow([]);
      const rDataNum = dataRow.number;

      ws.getCell(rDataNum, 1).value = mechanic.mechanicName;
      ws.getCell(rDataNum, 3).value = mechanic.worksCount;
      ws.getCell(rDataNum, 4).value = mechanic.totalAmount;
      ws.getCell(rDataNum, 5).value = mechanic.totalAmount / 2;

      ws.mergeCells(rDataNum, 1, rDataNum, 2);
      ws.mergeCells(rDataNum, 5, rDataNum, 7);

      for (let i = 1; i <= 7; i++) {
        applyCell(dataRow.getCell(i), i === 1 ? "left" : "right");
        if (i === 4 || i === 5) {
          dataRow.getCell(i).numFmt = currencyFmt;
        }
      }
    });

    const overviewTotalRow = ws.addRow([]);
    const rTotalNum = overviewTotalRow.number;
    ws.getCell(rTotalNum, 1).value = t("ИТОГО");
    ws.getCell(rTotalNum, 3).value = worksCountTotal;
    ws.getCell(rTotalNum, 4).value = amountTotal;
    ws.getCell(rTotalNum, 5).value = amountTotal / 2;

    ws.mergeCells(rTotalNum, 1, rTotalNum, 2);
    ws.mergeCells(rTotalNum, 5, rTotalNum, 7);

    for (let i = 1; i <= 7; i++) {
      applyCell(overviewTotalRow.getCell(i), i === 1 ? "left" : "right");
      overviewTotalRow.getCell(i).font = { name: "Calibri", bold: true, color: { argb: "FFFF6B00" } };
      if (i === 4 || i === 5) {
        overviewTotalRow.getCell(i).numFmt = currencyFmt;
      }
    }

    mechanicRows.forEach((mechanic) => {
      ws.addRow([]);

      const mechTitleRow = ws.addRow([]);
      const rMechTitleNum = mechTitleRow.number;
      ws.getCell(rMechTitleNum, 1).value = `${mechanic.mechanicName} - ${t("Работы этого механика за выбранный период")}`;
      ws.mergeCells(rMechTitleNum, 1, rMechTitleNum, 7);

      const titleCell = ws.getCell(rMechTitleNum, 1);
      titleCell.font = { name: "Calibri", bold: true, size: 10, color: { argb: "FF1F2937" } };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
      titleCell.alignment = { horizontal: "left", vertical: "middle" };
      titleCell.border = {
        top: { style: "thin", color: { argb: "FFD1D5DB" } },
        bottom: { style: "thin", color: { argb: "FFD1D5DB" } }
      };

      const detailsHeaderRow = ws.addRow([t("Дата"), t("Работа"), t("Клиент"), t("Автомобиль"), t("Кол-во"), t("Цена"), t("ЗП")]);
      applyHeader(detailsHeaderRow, 7);

      mechanic.works.forEach((work) => {
        const workRow = ws.addRow([
          format(new Date(work.order.order_date), "dd.MM.yyyy"),
          work.name,
          work.order.client.full_name,
          carLabel(work.order),
          work.quantity,
          work.sellingPrice,
          work.totalPrice / 2,
        ]);

        for (let i = 1; i <= 7; i++) {
          applyCell(workRow.getCell(i), i <= 4 ? "left" : "right");
          if (i === 6 || i === 7) {
            workRow.getCell(i).numFmt = currencyFmt;
          }
        }
      });

      const mechTotalRow = ws.addRow(["", "", "", t("ИТОГО"), "", "", mechanic.totalAmount / 2]);
      for (let i = 1; i <= 7; i++) {
        applyCell(mechTotalRow.getCell(i), i <= 4 ? "left" : "right");
        mechTotalRow.getCell(i).font = { name: "Calibri", bold: true, color: { argb: "FFFF6B00" } };
        if (i === 7) {
          mechTotalRow.getCell(i).numFmt = currencyFmt;
        }
      }
    });

  } else {
    ws.addRow([t("Всего заказов"), summary.totalOrders, t("Клиентов"), summary.clientIds.size, t("Выручка"), summary.totalRevenue, t("Оплачено"), summary.totalPaid, t("Долг"), summary.totalDebt].slice(0, headers.length));
    ws.addRow([t("Работы"), summary.workRevenue, t("Запчасти клиенту"), summary.partsRevenue, t("Себест. запчастей"), summary.partsCost, t("Прибыль сервиса"), summary.grossProfit].slice(0, headers.length));
    ws.addRow([]);
    tableHeaderRow = ws.addRow(headers);
    applyHeader(tableHeaderRow, headers.length);

    const rows = tab === "debtors" ? orders.filter((order) => moneyValue(order.debt_amount) > 0) : orders;
    rows.forEach((order) => {
      const economy = getOrderEconomy(order.items || []);
      const row = ws.addRow(
        tab === "debtors"
          ? [
              format(new Date(order.order_date), "dd.MM.yyyy HH:mm"),
              order.client.full_name,
              order.client.phone,
              carLabel(order),
              moneyValue(order.total_amount),
              resolvePaidAmount(order),
              moneyValue(order.debt_amount),
              order.debt_started_at ? format(new Date(order.debt_started_at), "dd.MM.yyyy") : "",
              getDebtAgeDays(order.debt_started_at),
            ]
          : tab === "history"
            ? [
                format(new Date(order.order_date), "dd.MM.yyyy HH:mm"),
                order.client.full_name,
                order.client.phone,
                carLabel(order),
                order.car_mileage || order.car.mileage || "",
                order.car.vin || "",
                t(order.status),
                itemsSummary(order, language),
                moneyValue(order.total_amount),
              ]
          : [
              format(new Date(order.order_date), "dd.MM.yyyy HH:mm"),
              order.client.full_name,
              carLabel(order),
              t(order.status),
              getPaymentStatusLabel(order.payment_status || "paid", language),
              economy.workRevenue,
              economy.partsRevenue,
              economy.partsCost,
              moneyValue(order.debt_amount),
              economy.grossProfit,
              moneyValue(order.total_amount),
            ]
      );
      for (let i = 1; i <= headers.length; i++) {
        applyCell(row.getCell(i), i >= headers.length - (tab === "history" ? 0 : 5) ? "right" : "left");
        if (typeof row.getCell(i).value === "number" && !(tab === "debtors" && i === headers.length)) row.getCell(i).numFmt = currencyFmt;
      }
    });

    const totalRow = ws.addRow(
      tab === "debtors"
        ? ["", "", "", t("ИТОГО"), summary.totalRevenue, summary.totalPaid, summary.totalDebt, "", ""]
        : tab === "history"
          ? ["", "", "", "", "", "", "", t("ИТОГО"), summary.totalRevenue]
          : ["", "", "", "", t("ИТОГО"), summary.workRevenue, summary.partsRevenue, summary.partsCost, summary.totalDebt, summary.grossProfit, summary.totalRevenue]
    );
    totalRow.eachCell((cell) => {
      cell.font = { name: "Calibri", bold: true, color: { argb: "FFFF6B00" } };
      if (typeof cell.value === "number") cell.numFmt = currencyFmt;
    });

    ws.pageSetup.printTitlesRow = `${tableHeaderRow.number}:${tableHeaderRow.number}`;
  }

  ws.columns = headers.map((header, index) => {
    if (tab === "finance") return { width: [13, 22, 28, 13, 14, 14, 14, 16, 13, 16, 14][index] || 14 };
    if (tab === "history") return { width: [13, 22, 17, 28, 13, 18, 13, 42, 14][index] || 14 };
    if (tab === "mechanics") return { width: [14, 35, 25, 25, 10, 14, 16][index] || 15 };
    return { width: [13, 22, 17, 28, 14, 14, 14, 13, 11][index] || Math.max(13, String(header).length + 4) };
  });

  if (tab !== "mechanics") {
    ws.views = [{ state: "frozen", ySplit: 7 }];
    if (tableHeaderRow) {
      ws.autoFilter = { from: { row: tableHeaderRow.number, column: 1 }, to: { row: tableHeaderRow.number, column: headers.length } };
    }
  }

  ws.pageSetup = {
    paperSize: 9,
    orientation: reportOrientation(tab),
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 },
  };
  ws.pageSetup.printArea = `A1:${ws.getColumn(headers.length).letter}${ws.rowCount}`;

  return workbook.xlsx.writeBuffer();
}

function buildPdf(orders: OrderWithDetails[], tab: ReportTab, language: Language, start: string | null, end: string | null) {
  const t = (value: string) => translatePhrase(value, language);
  const title = tab === "finance" ? t("SPARK / Отчёт") : tab === "history" ? t("SPARK / История обслуживания") : tab === "mechanics" ? t("SPARK / Отчет по механикам") : t("SPARK / Реестр должников");
  const doc = new jsPDF({ orientation: reportOrientation(tab), unit: "mm", format: "a4" });
  const fontName = configureUnicodePdfFont(doc, "ReportUnicode");
  const summary = summarize(orders);
  const mechanicRows = tab === "mechanics" ? buildMechanicRows(orders, language) : [];
  const rows = tab === "debtors" ? orders.filter((order) => moneyValue(order.debt_amount) > 0) : tab === "mechanics" ? [] : orders;

  doc.setFont(fontName, "normal");
  doc.setFontSize(15);
  doc.setTextColor(255, 107, 0);
  doc.text(title, 14, 16);
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text(`${t("Период")}: ${start && end ? `${format(new Date(start), "dd.MM.yyyy")} - ${format(new Date(end), "dd.MM.yyyy")}` : t("За все время")}`, 14, 22);
  doc.text(
    tab === "mechanics"
      ? `${t("Исполнителей")}: ${mechanicRows.length} | ${t("Работ выполнено")}: ${mechanicRows.reduce((sum, row) => sum + row.worksCount, 0)} | ${t("Сумма работ")}: ${moneyText(mechanicRows.reduce((sum, row) => sum + row.totalAmount, 0))} MDL`
      : `${t("Всего заказов")}: ${rows.length} | ${t("Общая выручка")}: ${moneyText(summary.totalRevenue)} MDL | ${t("Долги")}: ${moneyText(summary.totalDebt)} MDL`,
    14,
    27
  );

  if (tab === "mechanics") {
    const overviewHeaders = [t("Механик ФИО"), t("Сделал работ"), t("Сумма с работ"), t("ЗП")];
    const overviewBody = mechanicRows.map((mechanic) => [
      mechanic.mechanicName,
      mechanic.worksCount.toString(),
      `${moneyText(mechanic.totalAmount)} MDL`,
      `${moneyText(mechanic.totalAmount / 2)} MDL`,
    ]);

    overviewBody.push([
      t("ИТОГО"),
      mechanicRows.reduce((sum, r) => sum + r.worksCount, 0).toString(),
      `${moneyText(mechanicRows.reduce((sum, r) => sum + r.totalAmount, 0))} MDL`,
      `${moneyText(mechanicRows.reduce((sum, r) => sum + r.totalAmount, 0) / 2)} MDL`,
    ]);

    autoTable(doc, {
      head: [overviewHeaders],
      body: overviewBody,
      startY: 34,
      styles: { fontSize: 8, font: fontName, cellPadding: 1.5 },
      headStyles: { fillColor: [31, 41, 55], textColor: 255, fontStyle: "normal" },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: 14, right: 14 },
      tableWidth: "auto",
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 32 },
        2: { cellWidth: 40 },
        3: { cellWidth: 40 },
      },
      didParseCell: (data) => {
        if (data.row.index === overviewBody.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = [255, 107, 0];
        }
      }
    });

    let currentY = (doc as any).lastAutoTable.finalY + 10;

    mechanicRows.forEach((mechanic) => {
      if (currentY > 245) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFont(fontName, "bold");
      doc.setFontSize(9);
      doc.setTextColor(31, 41, 55);
      doc.text(`${mechanic.mechanicName} - ${t("Работы этого механика за выбранный период")}`, 14, currentY);
      currentY += 4;

      const detailsHeaders = [t("Дата"), t("Работа"), t("Клиент"), t("Автомобиль"), t("Кол-во"), t("Цена"), t("ЗП")];
      const detailsBody = mechanic.works.map((work) => [
        format(new Date(work.order.order_date), "dd.MM.yyyy"),
        work.name,
        work.order.client.full_name,
        carLabel(work.order),
        work.quantity.toString(),
        `${moneyText(work.sellingPrice)} MDL`,
        `${moneyText(work.totalPrice / 2)} MDL`,
      ]);

      detailsBody.push([
        "", "", "", t("ИТОГО"), "", "", `${moneyText(mechanic.totalAmount / 2)} MDL`
      ]);

      autoTable(doc, {
        head: [detailsHeaders],
        body: detailsBody,
        startY: currentY,
        styles: { fontSize: 7, font: fontName, cellPadding: 1.2, overflow: "linebreak" },
        headStyles: { fillColor: [75, 85, 99], textColor: 255, fontStyle: "normal" },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        margin: { left: 14, right: 14 },
        tableWidth: "auto",
        columnStyles: {
          0: { cellWidth: 18 },
          1: { cellWidth: 45 },
          2: { cellWidth: 35 },
          3: { cellWidth: 35 },
          4: { cellWidth: 12 },
          5: { cellWidth: 17 },
          6: { cellWidth: 20 },
        },
        didParseCell: (data) => {
          if (data.row.index === detailsBody.length - 1) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = [255, 107, 0];
          }
        }
      });

      currentY = (doc as any).lastAutoTable.finalY + 8;
    });

  } else {
    const headers =
      tab === "debtors"
      ? [t("Заказ"), t("Дата"), t("Клиент"), t("Телефон"), t("Авто"), t("Сумма"), t("Оплачено"), t("Долг"), t("Дней")]
      : tab === "history"
        ? [t("Дата"), t("Клиент"), t("Телефон"), t("Автомобиль"), t("Статус"), t("Детализация"), t("Сумма")]
        : [t("Дата"), t("Клиент"), t("Автомобиль"), t("Статус"), t("Оплата"), t("Работы"), t("Запчасти"), t("Долг"), t("Прибыль"), t("Итого")];

    const body = rows.map((order) => {
      const economy = getOrderEconomy(order.items || []);
      return tab === "debtors"
        ? [
            order.id.slice(0, 8),
            format(new Date(order.order_date), "dd.MM.yyyy"),
            order.client.full_name,
            order.client.phone,
            carLabel(order),
            `${moneyText(order.total_amount)} MDL`,
            `${moneyText(resolvePaidAmount(order))} MDL`,
            `${moneyText(order.debt_amount)} MDL`,
            getDebtAgeDays(order.debt_started_at),
          ]
        : tab === "history"
          ? [
              format(new Date(order.order_date), "dd.MM.yyyy"),
              order.client.full_name,
              order.client.phone,
              carLabel(order),
              t(order.status),
              itemsSummary(order, language) || "-",
              `${moneyText(order.total_amount)} MDL`,
            ]
        : [
            format(new Date(order.order_date), "dd.MM.yyyy"),
            order.client.full_name,
            carLabel(order),
            t(order.status),
            getPaymentStatusLabel(order.payment_status || "paid", language),
            `${moneyText(economy.workRevenue)} MDL`,
            `${moneyText(economy.partsRevenue)} MDL`,
            `${moneyText(order.debt_amount)} MDL`,
            `${moneyText(economy.grossProfit)} MDL`,
            `${moneyText(order.total_amount)} MDL`,
          ];
    });

    autoTable(doc, {
      head: [headers],
      body,
      startY: 34,
      styles: { fontSize: tab === "history" ? 6.5 : 7.2, font: fontName, cellPadding: 1.5, overflow: "linebreak" },
      headStyles: { fillColor: [31, 41, 55], textColor: 255, fontStyle: "normal" },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: 14, right: 14 },
      tableWidth: "auto",
      columnStyles:
        tab === "finance"
          ? { 0: { cellWidth: 20 }, 1: { cellWidth: 35 }, 2: { cellWidth: 43 }, 3: { cellWidth: 18 }, 4: { cellWidth: 19 } }
          : tab === "history"
            ? { 0: { cellWidth: 20 }, 1: { cellWidth: 31 }, 2: { cellWidth: 25 }, 3: { cellWidth: 34 }, 4: { cellWidth: 18 }, 5: { cellWidth: 47 }, 6: { cellWidth: 20 } }
            : { 0: { cellWidth: 18 }, 1: { cellWidth: 20 }, 2: { cellWidth: 34 }, 3: { cellWidth: 26 }, 4: { cellWidth: 38 } },
    });
  }

  return doc.output("arraybuffer");
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const formatType = request.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "excel";
    const tabParam = request.nextUrl.searchParams.get("tab") as ReportTab | null;
    const tab = tabParam && supportedTabs.includes(tabParam) ? tabParam : "finance";
    const language = getLanguage(request);
    const start = request.nextUrl.searchParams.get("start");
    const end = request.nextUrl.searchParams.get("end");

    const orders = await getFilteredOrders(request);
    const buffer = formatType === "pdf" ? buildPdf(orders, tab, language, start, end) : await buildExcel(orders, tab, language, start, end);
    const extension = formatType === "pdf" ? "pdf" : "xlsx";
    const fallback = asciiFilename(tab, extension);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": formatType === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fallback}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось сформировать отчет" },
      { status: 500 }
    );
  }
}

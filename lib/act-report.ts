import type { Language } from "./i18n";

export const COMPANY_INFO = [
  'S.C.  "MONTATORUL" SRL',
  "MD 2002, mun. Chisinau,",
  "str. Muncesti, 191/1",
  "Tel.: 0 792-000-94, 0 792-000-95,",
  "0 792-000-97",
  "Fax: / 022/ 63-80-37",
  "c.f. 1003600038304, TVA 0300672",
  "IBAN:MD87EC000000022242716485",
];

export const supportedActLanguages: Language[] = ["ru", "ro", "en"];

export type ActLabels = {
  fileTitle: string;
  orderTitle: string;
  beneficiary: string;
  phone: string;
  executor: string;
  model: string;
  plate: string;
  year: string;
  mileage: string;
  km: string;
  workHeaders: string[];
  partHeaders: string[];
  workTotal: string;
  partsTotal: string;
  grandTotal: string;
  serviceNote1: string;
  serviceNote2: string;
  masterControl: string;
  beneficiaryReceived: string;
  signature: string;
  acknowledgement: string;
};

export function normalizeVehicleCode(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase();
  return normalized || undefined;
}

export function formatMileage(value: number | null | undefined) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  return String(Math.trunc(numeric)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatPersonWithInitials(value: string | null | undefined) {
  const parts = value?.trim().split(/\s+/).filter(Boolean) || [];
  if (parts.length === 0) return "-";
  if (parts.length === 1) return parts[0];

  const [lastName, firstName] = parts;
  const initial = firstName ? `${firstName[0].toUpperCase()}.` : "";
  return [lastName, initial].filter(Boolean).join(" ");
}

export function getActLabels(language: Language) {
  const labels = {
    ru: {
      fileTitle: "Акт выполненных работ",
      orderTitle: "Заказ №",
      beneficiary: "Клиент",
      phone: "Тел.",
      executor: "Исполнитель",
      model: "Модель",
      plate: "Гос.\nномер",
      year: "Год\nвыпуска",
      mileage: "Пробег",
      km: "km",
      workHeaders: ["№", "Наименование услуг", "Исполнитель", "Кол-во", "Цена", "Сумма"],
      partHeaders: ["№", "Наименование запчасти автомобиля", "Код", "Кол-во", "Цена", "Сумма"],
      workTotal: "Итого по работе",
      partsTotal: "Итого по запчастям",
      grandTotal: "Итого по заказу",
      serviceNote1: "Сервис не несет ответственности за качество деталей,",
      serviceNote2: "предоставленных клиентом.",
      masterControl: "Проверил мастер",
      beneficiaryReceived: "Принял клиент",
      signature: "подпись",
      acknowledgement: "Клиент ознакомлен с заказом и претензий не имеет.",
    },
    ro: {
      fileTitle: "Act de lucrări executate",
      orderTitle: "Comanda №",
      beneficiary: "Beneficiar",
      phone: "Tel.",
      executor: "Executor",
      model: "Modelul",
      plate: "nr.\ninm.",
      year: "Anul\nproducerii",
      mileage: "Distanţa\nparcursă",
      km: "km",
      workHeaders: ["№", "Denumirea lucrărilor", "Executor", "Cantitate", "Preţ", "Sumă"],
      partHeaders: ["№", "Denumirea pieselor auto", "Cod", "Cantitate", "Preţ", "Sumă"],
      workTotal: "Total lucrări",
      partsTotal: "Total piese",
      grandTotal: "Total pe comandă",
      serviceNote1: "Firma nu poartă răspundere pentru calitatea pieselor",
      serviceNote2: "auto aduse de către Beneficiar.",
      masterControl: "A controlat maistrul",
      beneficiaryReceived: "A primit Beneficiarul",
      signature: "semnătura",
      acknowledgement: "Beneficiarul a luat cunoştinţă cu comanda şi nu are obiecţii.",
    },
    en: {
      fileTitle: "Work Completion Act",
      orderTitle: "Order №",
      beneficiary: "Customer",
      phone: "Tel.",
      executor: "Mechanic",
      model: "Model",
      plate: "Reg.\nNo.",
      year: "Year",
      mileage: "Mileage",
      km: "km",
      workHeaders: ["№", "Service description", "Mechanic", "Quantity", "Price", "Amount"],
      partHeaders: ["№", "Vehicle part description", "Code", "Quantity", "Price", "Amount"],
      workTotal: "Labor total",
      partsTotal: "Parts total",
      grandTotal: "Order total",
      serviceNote1: "The company is not responsible for the quality of parts",
      serviceNote2: "provided by the Customer.",
      masterControl: "Checked by foreman",
      beneficiaryReceived: "Received by Customer",
      signature: "signature",
      acknowledgement: "The Customer has reviewed the order and has no objections.",
    },
  } satisfies Record<Language, ActLabels>;

  return labels[language] || labels.ru;
}

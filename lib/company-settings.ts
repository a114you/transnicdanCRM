import { supabase } from "./supabase";

export const DEFAULT_COMPANY_INFO: CompanyInfo = {
  legal_name: 'S.C.  "AUTO-STORY" SRL',
  address_line_1: "MD 2006, mun. Chisinau,",
  address_line_2: "str. Stefan cel Mare, 10",
  phones: "Tel.: 0 792-000-77, 0 792-000-55, 0 792-000-43",
  fax: "Fax: / 022/ 73-81-39",
  fiscal_code: "c.f. 100390007656, TVA 0200670",
  iban: "IBAN:MD57EC000000027842326499",
};

export interface CompanyInfo {
  legal_name: string;
  address_line_1: string;
  address_line_2: string;
  phones: string;
  fax: string;
  fiscal_code: string;
  iban: string;
}

export const EMPTY_COMPANY_INFO: CompanyInfo = {
  legal_name: "",
  address_line_1: "",
  address_line_2: "",
  phones: "",
  fax: "",
  fiscal_code: "",
  iban: "",
};

export const FALLBACK_COMPANY_INFO: CompanyInfo = DEFAULT_COMPANY_INFO;

/**
 * Render the company info into a line list for header displays.
 *
 * The phones field is comma-separated. To stay inside the narrow right-side
 * block (47mm PDF / 5 cols Excel) without wrapping: the first two numbers go
 * on one row and any extra numbers move to the next row. Other fields stay as
 * a single line — they fit.
 */
function normalizeField(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

export function companyInfoToLines(info: CompanyInfo): string[] {
  const phoneParts = info.phones
    .split(/[,;\n]+/)
    .map((piece) => piece.trim())
    .filter(Boolean);

  let phoneLines: string[];
  if (phoneParts.length === 0) {
    phoneLines = [""];
  } else if (phoneParts.length <= 2) {
    phoneLines = [phoneParts.join(", ")];
  } else {
    phoneLines = [
      phoneParts.slice(0, 2).join(", "),
      phoneParts.slice(2).join(", "),
    ];
  }

  return [
    normalizeField(info.legal_name),
    normalizeField(info.address_line_1),
    normalizeField(info.address_line_2),
    ...phoneLines,
    normalizeField(info.fax),
    normalizeField(info.fiscal_code),
    normalizeField(info.iban),
  ];
}

export async function getRawCompanyInfo(): Promise<CompanyInfo> {
  try {
    const { data, error } = await supabase
      .from("company_settings")
      .select("legal_name, address_line_1, address_line_2, phones, fax, fiscal_code, iban")
      .eq("id", 1)
      .maybeSingle();

    if (error || !data) return FALLBACK_COMPANY_INFO;
    return data as CompanyInfo;
  } catch {
    return FALLBACK_COMPANY_INFO;
  }
}

export async function getCompanyInfo(): Promise<string[]> {
  const info = await getRawCompanyInfo();
  return companyInfoToLines(info);
}

export async function updateCompanyInfo(info: CompanyInfo): Promise<void> {
  const payload = {
    ...info,
    id: 1,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("company_settings")
    .upsert(payload, { onConflict: "id" });
  if (error) throw error;
}
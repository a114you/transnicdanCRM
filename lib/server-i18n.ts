import { cookies } from "next/headers";
import type { Language } from "./i18n";

export async function getServerLanguage(): Promise<Language> {
  const cookieStore = await cookies();
  const language = cookieStore.get("crm-language")?.value;
  return language === "ro" || language === "en" ? language : "ru";
}

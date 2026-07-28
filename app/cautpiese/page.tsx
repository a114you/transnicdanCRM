import { PartsSearchClient } from "./PartsSearchClient";
import { tr } from "@/lib/i18n";
import { getServerLanguage } from "@/lib/server-i18n";
import { PageHeader } from "@/components/layout/PageHeader";
import { Search } from "lucide-react";

export default async function CautPiesePage() {
  const language = await getServerLanguage();

  return (
    <div className="space-y-5 sm:space-y-6 lg:space-y-7 pb-8 lg:pb-4">
      <PageHeader
        icon={<Search className="h-5 w-5" />}
        title={tr("Поиск запчастей", language)}
        description={tr(
          "Один экран вместо 10 вкладок: VIN → запчасть на авто → цены и наличие у всех молдавских поставщиков. Или быстрый поиск по артикулу (точный код + аналоги).",
          language
        )}
      />

      <PartsSearchClient />
    </div>
  );
}

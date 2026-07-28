"use client";

import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, FileText, Loader2, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppAlert } from "@/components/layout/AppAlertProvider";
import { useLanguage } from "@/components/layout/LanguageProvider";

type ExportFormat = "pdf" | "excel";
type ExportLanguage = "ru" | "ro" | "en";

const languages: ExportLanguage[] = ["ru", "ro", "en"];
const QR_STORAGE_KEY = "crm-order-export-qr";

function fallbackFilename(orderId: string, format: ExportFormat, language: ExportLanguage) {
  return `Order_${orderId.slice(0, 8).toUpperCase()}_${language}.${format === "pdf" ? "pdf" : "xlsx"}`;
}

function filenameFromDisposition(disposition: string | null) {
  if (!disposition) return null;

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1].replace(/^"|"$/g, ""));

  const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
  return asciiMatch?.[1] || null;
}

export function OrderExportActions({ orderId }: { orderId: string }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [includeQr, setIncludeQr] = useState(false);
  const downloadCounter = useRef(0);
  const { showAlert } = useAppAlert();
  const { tp } = useLanguage();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(QR_STORAGE_KEY);
    if (saved === "1") setIncludeQr(true);
  }, []);

  function toggleQr() {
    setIncludeQr((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(QR_STORAGE_KEY, next ? "1" : "0");
      }
      return next;
    });
  }

  async function download(format: ExportFormat, language: ExportLanguage) {
    const key = `${format}-${language}`;
    setDownloading(key);
    downloadCounter.current += 1;

    try {
      const qrFlag = includeQr ? "1" : "0";
      const url = `/orders/${orderId}/${format}?lang=${language}&download=${downloadCounter.current}&qr=${qrFlag}`;
      const response = await fetch(url, {
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error(`Export failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filenameFromDisposition(response.headers.get("Content-Disposition")) || fallbackFilename(orderId, format, language);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch {
      showAlert(tp("Не удалось скачать файл. Попробуйте еще раз."), { variant: "error" });
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="contents">
      <label
        className="inline-flex items-center gap-1.5 cursor-pointer select-none rounded-lg border border-border/60 bg-secondary/5 px-2.5 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors h-10 sm:h-11"
        style={{ fontFamily: "var(--font-oswald)" }}
      >
        <input
          type="checkbox"
          checked={includeQr}
          onChange={toggleQr}
          className="h-3.5 w-3.5 cursor-pointer accent-primary"
          aria-label={tp("Включить QR-код")}
        />
        <QrCode className={`h-3.5 w-3.5 ${includeQr ? "text-primary" : "text-muted-foreground"}`} />
        <span className="hidden min-[420px]:inline">{tp("QR")}</span>
      </label>

      {languages.map((language) => {
        const key = `pdf-${language}`;
        const isLoading = downloading === key;

        return (
          <Button
            key={key}
            type="button"
            variant="outline"
            disabled={Boolean(downloading)}
            onClick={() => void download("pdf", language)}
            className="h-10 sm:h-11 w-full sm:w-auto px-3 sm:px-4 text-xs sm:text-sm rounded-xl border-border/60 hover:bg-primary/5 hover:text-primary transition-colors duration-150 font-semibold uppercase tracking-wider"
            style={{ fontFamily: "var(--font-oswald)" }}
          >
            {isLoading ? <Loader2 className="h-4 w-4 mr-1.5 sm:mr-2 animate-spin text-primary" /> : <FileText className="h-4 w-4 mr-1.5 sm:mr-2 text-primary" />}
            PDF {language.toUpperCase()}
          </Button>
        );
      })}

      {languages.map((language) => {
        const key = `excel-${language}`;
        const isLoading = downloading === key;

        return (
          <Button
            key={key}
            type="button"
            variant="outline"
            disabled={Boolean(downloading)}
            onClick={() => void download("excel", language)}
            className="h-10 sm:h-11 w-full sm:w-auto px-3 sm:px-4 text-xs sm:text-sm rounded-xl border-border/60 hover:bg-green-500/10 hover:text-green-600 hover:border-green-500/30 transition-colors duration-150 font-semibold uppercase tracking-wider"
            style={{ fontFamily: "var(--font-oswald)" }}
          >
            {isLoading ? <Loader2 className="h-4 w-4 mr-1.5 sm:mr-2 animate-spin text-green-600" /> : <FileSpreadsheet className="h-4 w-4 mr-1.5 sm:mr-2 text-green-600" />}
            Excel {language.toUpperCase()}
          </Button>
        );
      })}
    </div>
  );
}
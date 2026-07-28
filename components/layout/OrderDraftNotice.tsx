"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tr, type Language } from "@/lib/i18n";

const ORDER_DRAFT_KEY = "crm:new-order-draft";

type DraftPreview = {
  selectedClientId?: string;
  selectedCarId?: string;
  items?: unknown[];
  notes?: string;
  savedAt?: string;
};

export function OrderDraftNotice({ language }: { language: Language }) {
  const [draft, setDraft] = useState<DraftPreview | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(ORDER_DRAFT_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as DraftPreview;
      const timeout = setTimeout(() => setDraft(parsed), 0);
      return () => clearTimeout(timeout);
    } catch {
      window.localStorage.removeItem(ORDER_DRAFT_KEY);
    }
  }, []);

  if (!draft) return null;

  const itemsCount = Array.isArray(draft.items) ? draft.items.length : 0;

  function clearDraft() {
    window.localStorage.removeItem(ORDER_DRAFT_KEY);
    setDraft(null);
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-amber-600" />
            <p className="font-bold text-sm">{tr("Есть незавершенный черновик заказа", language)}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {itemsCount > 0 ? `${itemsCount} ${tr("позиций", language)}` : tr("Позиции еще не добавлены", language)}
            {draft.savedAt ? ` · ${tr("сохранен", language)} ${draft.savedAt}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/orders/new">
            <Button className="h-9 px-4 text-xs font-bold">{tr("Продолжить", language)}</Button>
          </Link>
          <Button type="button" variant="outline" onClick={clearDraft} className="h-9 px-4 text-xs font-bold">
            {tr("Удалить", language)}
          </Button>
        </div>
      </div>
    </div>
  );
}

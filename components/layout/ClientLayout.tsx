"use client";

import { Wrench } from "lucide-react";
import { Header } from "./Header";
import { useLanguage } from "./LanguageProvider";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const { tp } = useLanguage();
  return (
    <>
      <Header />

      {/* Unused wrapper kept for compatibility; root layout owns chrome */}
      <main className="flex-1 container mx-auto max-w-7xl px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8 pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-8">
        {children}
      </main>

      <footer className="hidden lg:block bg-muted border-t-2 border-border mt-auto">
        <div className="container mx-auto px-4 lg:px-6 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Wrench className="h-5 w-5" />
              <span className="font-display text-lg tracking-wide" style={{ fontFamily: "var(--font-bebas)" }}>
                {tp("АВТОСЕРВИС CRM")}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} {tp("Все права защищены")}
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}

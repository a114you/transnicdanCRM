"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/layout/LanguageProvider";

type YearInputProps = {
  id: string;
  value: number | null | undefined;
  onValueChange: (value: number | undefined) => void;
  minYear?: number;
  maxYear?: number;
  className?: string;
};

export function YearInput({ id, value, onValueChange, minYear = 1950, maxYear = new Date().getFullYear() + 1, className }: YearInputProps) {
  const { tp } = useLanguage();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value ? String(value) : "");
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const inputRef = useRef<HTMLInputElement | null>(null);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setText(value ? String(value) : "");
    }, 0);
    return () => clearTimeout(timeout);
  }, [value]);

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    const preferredStart = Math.max(minYear, current - 25);
    const allYears = Array.from({ length: maxYear - minYear + 1 }, (_, index) => maxYear - index);
    const recentYears = allYears.filter((year) => year >= preferredStart);
    const olderYears = allYears.filter((year) => year < preferredStart);
    return [...recentYears, ...olderYears];
  }, [maxYear, minYear]);

  const filteredYears = useMemo(() => {
    const query = text.trim();
    if (!query) return years.slice(0, 36);
    return years.filter((year) => String(year).startsWith(query)).slice(0, 36);
  }, [text, years]);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportWidth = window.innerWidth;
      const width = Math.min(Math.max(rect.width, 220), viewportWidth - 16);
      const left = Math.min(Math.max(rect.left, 8), viewportWidth - width - 8);
      setDropdownStyle({
        position: "fixed",
        left,
        top: rect.bottom + 6,
        width,
        zIndex: 2147483000,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  function commitYear(nextText: string) {
    const digits = nextText.replace(/\D/g, "").slice(0, 4);
    setText(digits);
    if (digits.length === 0) {
      onValueChange(undefined);
      return;
    }
    if (digits.length === 4) {
      const year = Number(digits);
      onValueChange(year >= minYear && year <= maxYear ? year : undefined);
    }
  }

  function selectYear(year: number) {
    setText(String(year));
    onValueChange(year);
    setOpen(false);
  }

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        inputMode="numeric"
        pattern="[0-9]{4}"
        placeholder="YYYY"
        autoComplete="off"
        value={text}
        className={cn("pr-9", className)}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimeout.current = setTimeout(() => setOpen(false), 120);
        }}
        onChange={(event) => {
          commitYear(event.target.value);
          setOpen(true);
        }}
      />
      <CalendarDays className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />

      {open && createPortal(
        <div style={dropdownStyle} className="overflow-hidden rounded-lg border border-border/70 bg-popover shadow-2xl">
          <div className="border-b border-border/60 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {tp("Год выпуска")}
          </div>
          <div className="grid max-h-64 grid-cols-3 gap-1 overflow-auto p-1.5">
            {filteredYears.map((year) => {
              const selected = year === value;
              return (
                <button
                  key={year}
                  type="button"
                  className={cn(
                    "flex h-9 items-center justify-center gap-1 rounded-md text-sm font-medium transition-colors",
                    selected ? "bg-primary text-primary-foreground" : "hover:bg-secondary/20",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectYear(year)}
                >
                  {year}
                  {selected && <Check className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

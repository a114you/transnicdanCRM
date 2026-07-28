"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/layout/LanguageProvider";
import type { Language } from "@/lib/i18n";

type DatePickerInputProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

const dateLocales: Record<Language, string> = {
  ru: "ru-RU",
  ro: "ro-RO",
  en: "en-US",
};

const weekDays: Record<Language, string[]> = {
  ru: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  ro: ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

function formatDisplay(value: string, language: Language) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(dateLocales[language], { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function DatePickerInput({ id, value, onChange, disabled, className }: DatePickerInputProps) {
  const { language, tp } = useLanguage();
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const selectedDate = useMemo(() => value ? new Date(`${value}T12:00:00`) : null, [value]);
  const [visibleMonth, setVisibleMonth] = useState(() => selectedDate || new Date());
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: 81 }, (_, index) => String(currentYear + 5 - index)), [currentYear]);
  const months = useMemo(() => Array.from({ length: 12 }, (_, index) => ({
    value: String(index),
    label: new Intl.DateTimeFormat(dateLocales[language], { month: "long" }).format(new Date(2024, index, 1)),
  })), [language]);

  useEffect(() => {
    if (!selectedDate || Number.isNaN(selectedDate.getTime())) return;
    const timeout = setTimeout(() => setVisibleMonth(selectedDate), 0);
    return () => clearTimeout(timeout);
  }, [selectedDate]);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportWidth = window.innerWidth;
      const width = Math.min(Math.max(rect.width, 320), viewportWidth - 16);
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
    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (inputRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const days = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - startOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return date;
    });
  }, [visibleMonth]);

  function shiftMonth(delta: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function selectDate(date: Date) {
    onChange(toInputDate(date));
    setOpen(false);
  }

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        value={formatDisplay(value, language)}
        readOnly
        disabled={disabled}
        placeholder={language === "en" ? "mm/dd/yyyy" : "dd.mm.yyyy"}
        className={cn("cursor-pointer pr-10 disabled:cursor-not-allowed", className)}
        onFocus={() => !disabled && setOpen(true)}
        onClick={() => !disabled && setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!disabled) setOpen(true);
          }
        }}
      />
      <CalendarDays className={cn("pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2", disabled ? "text-muted-foreground/35" : "text-primary")} />

      {open && !disabled && createPortal(
        <div ref={popupRef} style={dropdownStyle} className="overflow-hidden rounded-xl border border-border/80 bg-popover shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => shiftMonth(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-secondary/20">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="grid min-w-0 flex-1 grid-cols-[1fr_92px] gap-2">
              <select
                value={String(visibleMonth.getMonth())}
                onMouseDown={(event) => event.stopPropagation()}
                onChange={(event) => setVisibleMonth((current) => new Date(current.getFullYear(), Number(event.target.value), 1))}
                className="h-9 min-w-0 rounded-lg border border-border/70 bg-background px-2 text-sm font-semibold capitalize text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                {months.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
              <select
                value={String(visibleMonth.getFullYear())}
                onMouseDown={(event) => event.stopPropagation()}
                onChange={(event) => setVisibleMonth((current) => new Date(Number(event.target.value), current.getMonth(), 1))}
                className="h-9 rounded-lg border border-border/70 bg-background px-2 text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => shiftMonth(1)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-secondary/20">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 px-3 pt-3 text-center text-[11px] font-bold uppercase text-muted-foreground">
            {weekDays[language].map((day) => <div key={day}>{day}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1 p-3">
            {days.map((date) => {
              const inMonth = date.getMonth() === visibleMonth.getMonth();
              const selected = selectedDate ? sameDay(date, selectedDate) : false;
              const today = sameDay(date, new Date());
              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectDate(date)}
                  className={cn(
                    "h-9 rounded-lg text-sm font-semibold transition-colors",
                    selected ? "bg-primary text-primary-foreground" : today ? "border border-primary/60 text-primary" : "hover:bg-secondary/20",
                    !inMonth && !selected ? "text-muted-foreground/40" : "",
                  )}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2.5">
            <Button type="button" variant="outline" className="h-8 px-3 text-xs" onMouseDown={(event) => event.preventDefault()} onClick={() => selectDate(new Date())}>
              {tp("Сегодня")}
            </Button>
            <Button type="button" variant="ghost" className="h-8 px-3 text-xs" onMouseDown={(event) => event.preventDefault()} onClick={() => onChange("")}>
              <X className="mr-1 h-3.5 w-3.5" />
              {tp("Очистить")}
            </Button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

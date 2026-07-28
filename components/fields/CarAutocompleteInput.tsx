"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CarFront, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getCanonicalMake, getCarMakeSuggestions, getCarModelSuggestions } from "@/lib/car-catalog";

type CarAutocompleteInputProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  type: "make" | "model";
  make?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
};

export function CarAutocompleteInput({
  id,
  value,
  onChange,
  type,
  make = "",
  required,
  placeholder,
  className,
}: CarAutocompleteInputProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const inputRef = useRef<HTMLInputElement | null>(null);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canonicalMake = type === "model" ? getCanonicalMake(make) : undefined;

  const suggestions = useMemo(() => {
    if (type === "make") return getCarMakeSuggestions(value, 8);
    return getCarModelSuggestions(make, value, 8);
  }, [make, type, value]);

  const showSuggestions = open && suggestions.length > 0 && (type === "make" || make.trim().length > 0);

  useEffect(() => {
    if (!showSuggestions) return;

    function updatePosition() {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportWidth = window.innerWidth;
      const width = Math.min(Math.max(rect.width, 260), viewportWidth - 16);
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
  }, [showSuggestions]);

  function selectSuggestion(suggestion: string) {
    onChange(suggestion);
    setOpen(false);
    setActiveIndex(0);
  }

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        value={value}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
        className={cn("pr-9", className)}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimeout.current = setTimeout(() => setOpen(false), 120);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={(event) => {
          if (!showSuggestions) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => (index + 1) % suggestions.length);
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
          }
          if (event.key === "Enter" && suggestions[activeIndex]) {
            event.preventDefault();
            selectSuggestion(suggestions[activeIndex]);
          }
          if (event.key === "Escape") setOpen(false);
        }}
      />
      <CarFront className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />

      {showSuggestions && createPortal(
        <div style={dropdownStyle} className="overflow-hidden rounded-lg border border-border/70 bg-popover shadow-2xl">
          {type === "model" && canonicalMake && (
            <div className="border-b border-border/60 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {canonicalMake}
            </div>
          )}
          <div className="max-h-64 overflow-auto p-1">
            {suggestions.map((suggestion, index) => {
              const selected = suggestion.toLowerCase() === value.trim().toLowerCase();
              return (
                <button
                  key={suggestion}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                    index === activeIndex ? "bg-secondary/20 text-foreground" : "text-foreground hover:bg-secondary/15",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectSuggestion(suggestion)}
                >
                  <span className="truncate font-medium">{suggestion}</span>
                  {selected && <Check className="h-4 w-4 text-primary" />}
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

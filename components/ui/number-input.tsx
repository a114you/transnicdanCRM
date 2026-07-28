"use client";

import { Input } from "@/components/ui/input";
import type { ComponentProps } from "react";

type NumberInputProps = Omit<ComponentProps<typeof Input>, "type" | "value" | "onChange"> & {
  value: number | null | undefined;
  onValueChange: (value: number) => void;
};

export function NumberInput({ value, onValueChange, step = 1, ...props }: NumberInputProps) {
  return (
    <Input
      {...props}
      type="number"
      step={step}
      value={value === null || value === undefined || Number(value) === 0 ? "" : String(value)}
      onChange={(event) => onValueChange(event.target.value === "" ? 0 : Number(event.target.value))}
      onWheel={(e) => e.currentTarget.blur()}
    />
  );
}

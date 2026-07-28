import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Unified page chrome — mobile + desktop.
 * Keeps titles/actions consistent without redesigning each page.
 */
export function PageHeader({
  icon,
  title,
  description,
  actions,
  className,
  children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 p-4 sm:p-5 lg:p-6 glass-card bg-secondary/5 border-white/5",
        "lg:flex-row lg:items-end lg:justify-between lg:gap-6",
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </div>
        )}
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl min-[390px]:text-3xl sm:text-4xl lg:text-[2.35rem] font-extrabold tracking-tight text-foreground break-words">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">{description}</p>
          )}
          {children}
        </div>
      </div>
      {actions && (
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "primary" | "success" | "warning" | "danger";
  className?: string;
}) {
  const valueTone =
    tone === "primary"
      ? "text-primary"
      : tone === "success"
        ? "text-green-600"
        : tone === "warning"
          ? "text-amber-600"
          : tone === "danger"
            ? "text-destructive"
            : "text-foreground";

  return (
    <div className={cn("glass-card border-border/60 rounded-2xl p-4 sm:p-5", className)}>
      <p className="text-[11px] sm:text-xs text-muted-foreground uppercase font-bold tracking-wider">{label}</p>
      <p
        className={cn("text-2xl sm:text-3xl font-extrabold mt-1 tabular-nums tracking-tight", valueTone)}
        style={{ fontFamily: "var(--font-bebas)" }}
      >
        {value}
      </p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

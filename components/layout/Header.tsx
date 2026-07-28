"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users,
  FileText,
  Home,
  BarChart3,
  Package,
  Settings,
  LogOut,
  UserRoundCog,
  Wrench,
  UserPlus,
  Search,
  MoreHorizontal,
  X,
} from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { supabase } from "@/lib/supabase";

type NavItem = {
  href: string;
  labelKey: "nav.home" | "nav.clients" | "nav.orders" | "nav.employees" | "nav.warehouse" | "nav.parts" | "nav.works" | "nav.reports" | "nav.referrers" | "nav.settings";
  icon: React.ReactNode;
  match: (path: string) => boolean;
};

const PRIMARY: NavItem[] = [
  { href: "/", labelKey: "nav.home", icon: <Home className="h-[22px] w-[22px]" strokeWidth={2} />, match: (p) => p === "/" },
  { href: "/clients", labelKey: "nav.clients", icon: <Users className="h-[22px] w-[22px]" strokeWidth={2} />, match: (p) => p.startsWith("/clients") },
  { href: "/orders", labelKey: "nav.orders", icon: <FileText className="h-[22px] w-[22px]" strokeWidth={2} />, match: (p) => p.startsWith("/orders") },
  { href: "/cautpiese", labelKey: "nav.parts", icon: <Search className="h-[22px] w-[22px]" strokeWidth={2} />, match: (p) => p.startsWith("/cautpiese") },
];

const MORE: NavItem[] = [
  { href: "/warehouse", labelKey: "nav.warehouse", icon: <Package className="h-5 w-5" strokeWidth={2} />, match: (p) => p.startsWith("/warehouse") },
  { href: "/works", labelKey: "nav.works", icon: <Wrench className="h-5 w-5" strokeWidth={2} />, match: (p) => p.startsWith("/works") },
  { href: "/employees", labelKey: "nav.employees", icon: <UserRoundCog className="h-5 w-5" strokeWidth={2} />, match: (p) => p.startsWith("/employees") },
  { href: "/reports", labelKey: "nav.reports", icon: <BarChart3 className="h-5 w-5" strokeWidth={2} />, match: (p) => p.startsWith("/reports") },
  { href: "/referrers", labelKey: "nav.referrers", icon: <UserPlus className="h-5 w-5" strokeWidth={2} />, match: (p) => p.startsWith("/referrers") },
  { href: "/settings", labelKey: "nav.settings", icon: <Settings className="h-5 w-5" strokeWidth={2} />, match: (p) => p.startsWith("/settings") },
];

/** Desktop rail: always labels on xl+, compact on lg */
const DESKTOP_CORE: NavItem[] = [
  { href: "/", labelKey: "nav.home", icon: <Home className="h-4 w-4" strokeWidth={2} />, match: (p) => p === "/" },
  { href: "/clients", labelKey: "nav.clients", icon: <Users className="h-4 w-4" strokeWidth={2} />, match: (p) => p.startsWith("/clients") },
  { href: "/orders", labelKey: "nav.orders", icon: <FileText className="h-4 w-4" strokeWidth={2} />, match: (p) => p.startsWith("/orders") },
  { href: "/cautpiese", labelKey: "nav.parts", icon: <Search className="h-4 w-4" strokeWidth={2} />, match: (p) => p.startsWith("/cautpiese") },
  { href: "/warehouse", labelKey: "nav.warehouse", icon: <Package className="h-4 w-4" strokeWidth={2} />, match: (p) => p.startsWith("/warehouse") },
  { href: "/works", labelKey: "nav.works", icon: <Wrench className="h-4 w-4" strokeWidth={2} />, match: (p) => p.startsWith("/works") },
];

const DESKTOP_EXTRA: NavItem[] = [
  { href: "/employees", labelKey: "nav.employees", icon: <UserRoundCog className="h-4 w-4" strokeWidth={2} />, match: (p) => p.startsWith("/employees") },
  { href: "/reports", labelKey: "nav.reports", icon: <BarChart3 className="h-4 w-4" strokeWidth={2} />, match: (p) => p.startsWith("/reports") },
  { href: "/referrers", labelKey: "nav.referrers", icon: <UserPlus className="h-4 w-4" strokeWidth={2} />, match: (p) => p.startsWith("/referrers") },
];

export function Header({ userId }: { userId?: string }) {
  const pathname = usePathname();
  const { t, tp } = useLanguage();
  const [moreOpen, setMoreOpen] = useState(false);
  const [desktopMoreOpen, setDesktopMoreOpen] = useState(false);

  const moreActive = useMemo(
    () => MORE.some((item) => item.match(pathname)),
    [pathname]
  );

  useEffect(() => {
    setMoreOpen(false);
    setDesktopMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel(`user_sessions_${userId}`, {
      config: { broadcast: { ack: false } },
    });

    channel
      .on("broadcast", { event: "kick" }, async () => {
        try {
          const res = await fetch("/api/auth/status");
          if (res.status === 401) {
            window.location.href = "/login";
          }
        } catch {
          /* ignore */
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const desktopSecondaryActive = useMemo(
    () =>
      ["/employees", "/reports", "/referrers"].some((p) => pathname.startsWith(p)),
    [pathname]
  );

  return (
    <>
      <header className="sticky top-0 z-50 bg-secondary text-secondary-foreground border-b border-white/5 pt-safe-top shadow-[0_1px_0_0_rgba(255,255,255,0.04)]">
        <div className="mx-auto w-full max-w-[1600px] px-3 sm:px-4 lg:px-6 xl:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 lg:h-16 xl:h-[4.25rem] gap-3 lg:gap-4">
            <Link href="/" prefetch={false} className="flex min-w-0 items-center gap-2.5 sm:gap-3 group shrink-0">
              <div className="relative flex-shrink-0">
                <div className="absolute inset-0 bg-primary rounded-lg opacity-20 group-hover:opacity-35 transition-opacity" />
                <div className="relative p-1.5 lg:p-2 bg-gradient-to-br from-primary to-[#ff8533] rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/spark.svg" alt="Spark" className="h-5 w-5 sm:h-6 sm:w-6 object-contain" />
                </div>
              </div>
              <div className="flex min-w-0 flex-col">
                <span
                  className="font-display text-lg sm:text-xl tracking-wider leading-none truncate"
                  style={{ fontFamily: "var(--font-bebas)" }}
                >
                  {t("app.brand")}
                </span>
                <span className="hidden sm:block text-[10px] text-secondary-foreground/50 tracking-[0.2em] uppercase truncate">
                  {t("app.system")}
                </span>
              </div>
            </Link>

            {/* Desktop nav — ideal PC: compact pill rail + utilities */}
            <div className="hidden lg:flex flex-1 items-center justify-end gap-2 xl:gap-3 min-w-0">
              <nav
                aria-label="Primary"
                className="flex min-w-0 items-center gap-0.5 rounded-2xl bg-white/[0.06] p-1 ring-1 ring-white/10"
              >
                {DESKTOP_CORE.map((item) => (
                  <DesktopNavLink
                    key={item.href}
                    href={item.href}
                    active={item.match(pathname)}
                    icon={item.icon}
                    label={t(item.labelKey)}
                  />
                ))}

                {/* Overflow: employees / reports / referrers */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setDesktopMoreOpen((v) => !v)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-colors ${
                      desktopSecondaryActive || desktopMoreOpen
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-secondary-foreground/80 hover:bg-white/10 hover:text-secondary-foreground"
                    }`}
                    aria-expanded={desktopMoreOpen}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="hidden min-[1280px]:inline">{tp("Ещё")}</span>
                  </button>
                  {desktopMoreOpen && (
                    <>
                      <button
                        type="button"
                        className="fixed inset-0 z-40 cursor-default"
                        aria-label={tp("Закрыть")}
                        onClick={() => setDesktopMoreOpen(false)}
                      />
                      <div className="absolute right-0 top-[calc(100%+0.4rem)] z-50 w-56 rounded-2xl border border-border/70 bg-popover text-popover-foreground p-1.5 shadow-xl ring-1 ring-black/5">
                        {DESKTOP_EXTRA.map((item) => {
                          const active = item.match(pathname);
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              prefetch={false}
                              onClick={() => setDesktopMoreOpen(false)}
                              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                                active
                                  ? "bg-primary/10 text-primary"
                                  : "text-foreground hover:bg-muted"
                              }`}
                            >
                              {item.icon}
                              {t(item.labelKey)}
                            </Link>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </nav>

              <div className="flex items-center gap-1.5 shrink-0 pl-1">
                <Link
                  href="/settings"
                  prefetch={false}
                  title={t("nav.settings")}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ring-1 transition-colors ${
                    pathname.startsWith("/settings")
                      ? "bg-primary/15 text-primary ring-primary/30"
                      : "text-secondary-foreground/75 ring-white/10 hover:bg-white/10 hover:text-secondary-foreground"
                  }`}
                  aria-label={t("nav.settings")}
                >
                  <Settings className="h-4.5 w-4.5 h-[18px] w-[18px]" />
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  title={tp("Выйти")}
                  aria-label={tp("Выйти")}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-secondary-foreground/75 ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-secondary-foreground"
                >
                  <LogOut className="h-[18px] w-[18px]" />
                </button>
              </div>
            </div>

            {/* Mobile header actions */}
            <div className="lg:hidden flex items-center gap-2 flex-shrink-0">
              <Link
                href="/settings"
                className={`h-10 w-10 rounded-xl border flex items-center justify-center transition-colors ${
                  pathname.startsWith("/settings")
                    ? "border-primary/40 text-primary bg-primary/15"
                    : "border-white/10 text-secondary-foreground/80 bg-white/5"
                }`}
                aria-label={t("nav.settings")}
              >
                <Settings className="h-5 w-5" />
              </Link>
              <button
                type="button"
                onClick={logout}
                aria-label={tp("Выйти")}
                className="h-10 w-10 rounded-xl border border-primary/20 text-primary bg-primary/10 flex items-center justify-center"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
        <div className="h-0.5 bg-gradient-to-r from-primary via-[#ff8533] to-primary opacity-90" />
      </header>

      {/* Ideal mobile/tablet bottom bar: 5 equal slots, full labels, no horizontal scroll */}
      <nav
        aria-label="Primary"
        className="mobile-bottom-nav lg:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border/70 bg-background/95 dark:bg-card/95 backdrop-blur-xl supports-backdrop-filter:bg-background/80"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-between gap-0.5 px-1.5 pt-1.5 pb-[max(0.4rem,env(safe-area-inset-bottom))]">
          {PRIMARY.map((item) => (
            <BottomTabLink
              key={item.href}
              href={item.href}
              active={item.match(pathname)}
              icon={item.icon}
              label={t(item.labelKey)}
            />
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 transition-colors active:scale-[0.97] ${
              moreActive || moreOpen
                ? "text-primary font-semibold"
                : "text-muted-foreground"
            }`}
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
          >
            <span
              className={`inline-flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                moreActive || moreOpen ? "bg-primary/12 text-primary" : ""
              }`}
            >
              <MoreHorizontal className="h-[22px] w-[22px]" strokeWidth={2.25} />
            </span>
            <span className="max-w-full truncate text-[11px] leading-none font-medium tracking-tight">
              {tp("Ещё")}
            </span>
          </button>
        </div>
      </nav>

      {/* More sheet */}
      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={tp("Ещё")}>
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            aria-label={tp("Закрыть")}
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute bottom-0 inset-x-0 max-h-[min(78dvh,560px)] rounded-t-3xl border border-border/60 bg-background shadow-2xl animate-slide-up pb-safe-bottom">
            <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border/50">
              <div className="flex flex-col">
                <span className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted-foreground/25" aria-hidden />
                <h2 className="text-base font-bold tracking-wide" style={{ fontFamily: "var(--font-oswald)" }}>
                  {tp("Меню")}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="h-10 w-10 rounded-xl border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={tp("Закрыть")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto overscroll-contain p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {MORE.map((item) => {
                const active = item.match(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    onClick={() => setMoreOpen(false)}
                    className={`flex min-h-[72px] flex-col items-start justify-center gap-2 rounded-2xl border px-3.5 py-3 transition-colors active:scale-[0.98] ${
                      active
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border/60 bg-card hover:bg-muted/50 text-foreground"
                    }`}
                  >
                    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${active ? "bg-primary/15" : "bg-muted"}`}>
                      {item.icon}
                    </span>
                    <span className="text-sm font-semibold leading-tight">{t(item.labelKey)}</span>
                  </Link>
                );
              })}
            </div>
            <div className="px-3 pb-3 pt-1">
              <button
                type="button"
                onClick={logout}
                className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-destructive/25 bg-destructive/5 text-destructive font-semibold text-sm active:scale-[0.99]"
              >
                <LogOut className="h-4 w-4" />
                {tp("Выйти")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DesktopNavLink({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      title={label}
      className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[13px] font-medium whitespace-nowrap transition-colors ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-secondary-foreground/80 hover:bg-white/10 hover:text-secondary-foreground"
      }`}
      aria-current={active ? "page" : undefined}
    >
      <span className="opacity-90">{icon}</span>
      {/* Labels from lg — ideal PC/laptop; truncate if cramped */}
      <span className="max-w-[7.5rem] truncate">{label}</span>
    </Link>
  );
}

function BottomTabLink({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={`flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 transition-colors active:scale-[0.97] ${
        active ? "text-primary font-semibold" : "text-muted-foreground"
      }`}
      aria-current={active ? "page" : undefined}
    >
      <span
        className={`inline-flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
          active ? "bg-primary/12 text-primary" : ""
        }`}
      >
        {icon}
      </span>
      <span className="max-w-full truncate px-0.5 text-[11px] leading-none font-medium tracking-tight text-center">
        {label}
      </span>
    </Link>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { createSupplier, deleteSupplier, getSuppliers, updateSupplier, getRawCompanyInfo, updateCompanyInfo } from "@/lib/supabase";
import type { Supplier, SupplierFormData, CompanyInfo } from "@/lib/types";
import { FALLBACK_COMPANY_INFO, companyInfoToLines } from "@/lib/company-settings";
import { Building2, Edit, Languages, Monitor, Moon, Percent, RotateCcw, Save, Search, Shield, Sun, Trash2, X } from "lucide-react";
import { useLanguage } from "@/components/layout/LanguageProvider";
import { useAppAlert } from "@/components/layout/AppAlertProvider";
import { PageHeader } from "@/components/layout/PageHeader";
import type { Language } from "@/lib/i18n";

const emptyForm: SupplierFormData = {
  name: "",
  discount_percent: 0,
  phone: "",
  email: "",
  notes: "",
};

const listPageSize = 60;

const EMPTY_COMPANY_FORM: CompanyInfo = {
  legal_name: "",
  address_line_1: "",
  address_line_2: "",
  phones: "",
  fax: "",
  fiscal_code: "",
  iban: "",
};

export default function SettingsPage() {
  const { language, setLanguage, t, tp } = useLanguage();
  const { showAlert, showConfirm } = useAppAlert();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState<SupplierFormData>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"suppliers" | "company" | "interface" | "security">("suppliers");
  const [kicking, setKicking] = useState(false);

  async function handleKickOthers() {
    const confirmed = await showConfirm(
      tp("Вы уверены, что хотите завершить сеансы на всех остальных устройствах? Все незавершенные действия на тех компьютерах будут прерваны."),
      { destructive: true }
    );
    if (!confirmed) return;

    setKicking(true);
    try {
      const res = await fetch("/api/auth/kick", { method: "POST" });
      if (!res.ok) {
        throw new Error("Failed to kick sessions");
      }
      showAlert(tp("Все другие устройства были мгновенно разлогинены!"), { variant: "success" });
    } catch (err) {
      console.error(err);
      showAlert(tp("Не удалось завершить сеансы на других устройствах. Попробуйте еще раз."), { variant: "error" });
    } finally {
      setKicking(false);
    }
  }
  const [visibleSupplierCount, setVisibleSupplierCount] = useState(listPageSize);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [companyForm, setCompanyForm] = useState<CompanyInfo>(EMPTY_COMPANY_FORM);
  const [companyLoaded, setCompanyLoaded] = useState(false);
  const [companySaving, setCompanySaving] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | "system">(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("crm-theme");
      if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") {
        return savedTheme as "light" | "dark" | "system";
      }
    }
    return "system";
  });

  // Load saved theme from localStorage after component mounts to avoid SSR mismatch
  useEffect(() => {
  const saved = localStorage.getItem("crm-theme");
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  let effectiveTheme: "light" | "dark";
  if (saved === "light" || saved === "dark") {
    effectiveTheme = saved as "light" | "dark";
  } else if (saved === "system") {
    effectiveTheme = systemDark ? "dark" : "light";
  } else {
    effectiveTheme = systemDark ? "dark" : "light";
  }
  document.documentElement.classList.toggle("dark", effectiveTheme === "dark");
}, []);

  useEffect(() => {
    loadSuppliers();
  }, []);

  useEffect(() => {
    if (tab === "company" && !companyLoaded) {
      loadCompany();
    }
  }, [tab, companyLoaded]);

  async function loadCompany() {
    try {
      const info = await getRawCompanyInfo();
      setCompanyForm(info);
    } catch {
      setCompanyForm(FALLBACK_COMPANY_INFO);
    } finally {
      setCompanyLoaded(true);
    }
  }

  function applyTheme(nextTheme: "light" | "dark" | "system") {
    setTheme(nextTheme);
    localStorage.setItem("crm-theme", nextTheme);
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const effectiveTheme = nextTheme === "system" ? (systemDark ? "dark" : "light") : nextTheme;
    document.documentElement.classList.toggle("dark", effectiveTheme === "dark");
  }

  async function loadSuppliers() {
    const data = await getSuppliers();
    setSuppliers(data);
    setVisibleSupplierCount(listPageSize);
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function editSupplier(supplier: Supplier) {
    setEditingId(supplier.id);
    setForm({
      name: supplier.name,
      discount_percent: supplier.discount_percent,
      phone: supplier.phone || "",
      email: supplier.email || "",
      notes: supplier.notes || "",
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      showAlert(t("settings.enterSupplier"), { variant: "warning" });
      return;
    }

    const payload = {
      ...form,
      name: form.name.trim(),
      discount_percent: Math.min(Math.max(Number(form.discount_percent) || 0, 0), 100),
      phone: form.phone || null,
      email: form.email || null,
      notes: form.notes || null,
    };

    setLoading(true);
    try {
      if (editingId) {
        await updateSupplier(editingId, payload);
      } else {
        await createSupplier(payload);
      }
      resetForm();
      await loadSuppliers();
    } catch {
      showAlert(t("settings.saveSupplierError"), { variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function removeSupplier(id: string) {
    const confirmed = await showConfirm(t("settings.deleteSupplierConfirm"), { destructive: true });
    if (!confirmed) return;
    try {
      await deleteSupplier(id);
      await loadSuppliers();
      if (editingId === id) resetForm();
    } catch {
      showAlert(t("settings.deleteSupplierError"), { variant: "error" });
    }
  }

  async function handleCompanySave(e: React.FormEvent) {
    e.preventDefault();
    setCompanySaving(true);
    try {
      await updateCompanyInfo(companyForm);
      showAlert(tp("Реквизиты компании сохранены"), { variant: "success" });
    } catch {
      showAlert(tp("Не удалось сохранить реквизиты компании"), { variant: "error" });
    } finally {
      setCompanySaving(false);
    }
  }

  async function handleCompanyReset() {
    const confirmed = await showConfirm(tp("Вернуть реквизиты компании к значениям по умолчанию?"), { destructive: true });
    if (!confirmed) return;
    setCompanyForm(FALLBACK_COMPANY_INFO);
    try {
      await updateCompanyInfo(FALLBACK_COMPANY_INFO);
      showAlert(tp("Реквизиты компании сброшены к значениям по умолчанию"), { variant: "success" });
    } catch {
      showAlert(tp("Не удалось сохранить реквизиты компании"), { variant: "error" });
    }
  }

  const normalizedSupplierQuery = supplierQuery.trim().toLowerCase();
  const filteredSuppliers = normalizedSupplierQuery
    ? suppliers.filter((supplier) => [
        supplier.name,
        supplier.phone,
        supplier.email,
        supplier.notes,
        `${supplier.discount_percent}`,
      ].filter(Boolean).join(" ").toLowerCase().includes(normalizedSupplierQuery))
    : suppliers;
  const visibleSuppliers = filteredSuppliers.slice(0, visibleSupplierCount);
  const hasMoreSuppliers = visibleSupplierCount < filteredSuppliers.length;

  return (
    <div className="space-y-5 sm:space-y-6 lg:space-y-7 animate-fade-in pb-8 lg:pb-4">
      <PageHeader
        icon={<Building2 className="h-5 w-5" />}
        title={t("settings.title")}
        description={t("settings.subtitle")}
      />

      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {(
          [
            ["suppliers", t("settings.suppliers"), <Percent className="h-4 w-4 shrink-0" key="i" />],
            ["company", tp("Компания"), <Building2 className="h-4 w-4 shrink-0" key="i" />],
            ["interface", t("settings.interface"), <Languages className="h-4 w-4 shrink-0" key="i" />],
            ["security", tp("Безопасность"), <Shield className="h-4 w-4 shrink-0" key="i" />],
          ] as const
        ).map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`min-h-[40px] px-3 sm:px-4 py-2 rounded-xl text-[11px] sm:text-sm font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 sm:gap-2 transition-colors ${
              tab === id
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {icon}
            <span className="leading-tight">{label}</span>
          </button>
        ))}
      </div>

      {tab === "interface" && (
        <Card className="glass-card border-border/80">
          <CardHeader className="border-b border-border/40 bg-secondary/5 p-5 rounded-t-2xl">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">{t("settings.interfaceTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-5 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-3">
                <span className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{t("settings.language")}</span>
                <div className="flex gap-2">
                  {(["ru", "ro"] as Language[]).map((lang) => (
                    <Button
                      key={lang}
                      type="button"
                      variant={language === lang ? "default" : "outline"}
                      onClick={() => setLanguage(lang)}
                      className="h-11 px-5 rounded-xl"
                    >
                      {lang === "ru" ? "Русский" : "Română"}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{t("settings.languageHelp")}</p>
              </div>

              <div className="space-y-3">
                <span className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{t("settings.theme")}</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Button type="button" variant={theme === "light" ? "default" : "outline"} onClick={() => applyTheme("light")} className="h-11 rounded-xl">
                    <Sun className="h-4 w-4" />
                    {t("settings.themeLight")}
                  </Button>
                  <Button type="button" variant={theme === "dark" ? "default" : "outline"} onClick={() => applyTheme("dark")} className="h-11 rounded-xl">
                    <Moon className="h-4 w-4" />
                    {t("settings.themeDark")}
                  </Button>
                  <Button type="button" variant={theme === "system" ? "default" : "outline"} onClick={() => applyTheme("system")} className="h-11 rounded-xl">
                    <Monitor className="h-4 w-4" />
                    {t("settings.themeSystem")}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "security" && (
        <Card className="glass-card border-border/80 animate-fade-in">
          <CardHeader className="border-b border-border/40 bg-secondary/5 p-5 rounded-t-2xl">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">{tp("Управление безопасностью")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-5 space-y-6">
            <div className="max-w-xl space-y-4">
              <div className="space-y-2">
                <h3 className="text-lg font-bold uppercase tracking-wider font-display" style={{ fontFamily: 'var(--font-oswald)' }}>
                  {tp("Завершение сеансов на других устройствах")}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {tp("Если вы вошли в систему на компьютере или других мобильных устройствах, вы можете мгновенно выйти из программы на всех них с помощью одной кнопки. Текущее устройство останется в системе.")}
                </p>
              </div>

              <Button
                type="button"
                onClick={handleKickOthers}
                disabled={kicking}
                className="btn-garage-secondary h-11 px-6 text-sm w-full sm:w-auto text-destructive border-destructive/20 hover:bg-destructive/5 hover:border-destructive/40"
              >
                {kicking ? tp("Выход...") : tp("Выйти на других устройствах")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "company" && (
        <Card className="glass-card border-border/80 animate-fade-in">
          <CardHeader className="border-b border-border/40 bg-secondary/5 p-5 rounded-t-2xl">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">
              {tp("Реквизиты компании")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            {!companyLoaded ? (
              <div className="py-10 text-center text-sm text-muted-foreground">{tp("Загрузка...")}</div>
            ) : (
              <form onSubmit={handleCompanySave} className="space-y-5">
                <p className="text-sm text-muted-foreground">
                  {tp("Эти данные отображаются в шапке PDF и Excel актов выполненных работ. Можно изменить в любой момент.")}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="company-legal-name">{tp("Название компании")}</Label>
                    <Input
                      id="company-legal-name"
                      value={companyForm.legal_name}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, legal_name: e.target.value }))}
                      className="h-11"
                      placeholder={'S.C. "AUTO-STORY" SRL'}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="company-address-1">{tp("Адрес (строка 1)")}</Label>
                    <Input
                      id="company-address-1"
                      value={companyForm.address_line_1}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, address_line_1: e.target.value }))}
                      className="h-11"
                      placeholder="MD 2006, mun. Chisinau,"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="company-address-2">{tp("Адрес (строка 2)")}</Label>
                    <Input
                      id="company-address-2"
                      value={companyForm.address_line_2}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, address_line_2: e.target.value }))}
                      className="h-11"
                      placeholder="str. Stefan cel Mare, 10"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="company-phones">{tp("Телефоны")}</Label>
                    <Input
                      id="company-phones"
                      value={companyForm.phones}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, phones: e.target.value }))}
                      className="h-11"
                      placeholder="Tel.: 0 792-000-77, 0 792-000-55, 0 792-000-43"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="company-fax">{tp("Факс")}</Label>
                    <Input
                      id="company-fax"
                      value={companyForm.fax}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, fax: e.target.value }))}
                      className="h-11"
                      placeholder="Fax: / 022/ 73-81-39"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="company-fiscal">{tp("Фискальный код / TVA")}</Label>
                    <Input
                      id="company-fiscal"
                      value={companyForm.fiscal_code}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, fiscal_code: e.target.value }))}
                      className="h-11"
                      placeholder="c.f. 100390007656, TVA 0200670"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="company-iban">{tp("IBAN")}</Label>
                    <Input
                      id="company-iban"
                      value={companyForm.iban}
                      onChange={(e) => setCompanyForm((f) => ({ ...f, iban: e.target.value }))}
                      className="h-11"
                      placeholder="IBAN:MD57EC000000027842326499"
                    />
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCompanyReset}
                    disabled={companySaving}
                    className="h-11 px-5 text-sm rounded-xl"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {tp("Сбросить к стандартным")}
                  </Button>
                  <Button type="submit" disabled={companySaving} className="btn-garage h-11 px-5 text-sm">
                    <Save className="h-4 w-4" />
                    {companySaving ? tp("Сохранение...") : tp("Сохранить")}
                  </Button>
                </div>

                <div className="rounded-xl border border-border/40 bg-secondary/5 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {tp("Предпросмотр шапки акта")}
                  </div>
                  <div className="text-center space-y-0.5 text-sm">
                    {companyInfoToLines(companyForm).filter((line) => line.trim()).map((line, index) => (
                      <div key={index}>{line}</div>
                    ))}
                  </div>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "suppliers" && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="glass-card border-border/80 lg:col-span-1">
          <CardHeader className="border-b border-border/40 bg-secondary/5 p-5 rounded-t-2xl">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">
              {editingId ? t("settings.supplierEdit") : t("settings.supplierNew")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="supplier-name">{t("settings.name")}</Label>
                <Input id="supplier-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplier-discount">{t("settings.discount")}</Label>
                <NumberInput
                  id="supplier-discount"
                  min="0"
                  max="100"
                  step="1"
                  value={form.discount_percent}
                  onValueChange={(value) => setForm((f) => ({ ...f, discount_percent: value }))}
                  className="h-11"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="supplier-phone">{t("settings.phone")}</Label>
                  <Input id="supplier-phone" type="tel" autoComplete="tel" value={form.phone || ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supplier-email">{t("settings.email")}</Label>
                  <Input id="supplier-email" type="email" autoComplete="email" value={form.email || ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="h-11" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplier-notes">{t("settings.notes")}</Label>
                <Textarea id="supplier-notes" value={form.notes || ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={loading} className="btn-garage h-11 px-5 text-sm flex-1">
                  <Save className="h-4 w-4" />
                  {loading ? t("settings.saving") : t("settings.save")}
                </Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={resetForm} className="h-11 w-11 p-0 rounded-xl">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/80 lg:col-span-2">
          <CardHeader className="border-b border-border/40 bg-secondary/5 p-5 rounded-t-2xl">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">
              {t("settings.suppliers")} ({suppliers.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-4 sm:p-5 border-b border-border/40">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={supplierQuery}
                  onChange={(event) => {
                    setSupplierQuery(event.target.value);
                    setVisibleSupplierCount(listPageSize);
                  }}
                  placeholder={tp("Поиск поставщика, телефона, email...")}
                  className="h-11 pl-9 pr-10"
                />
                {supplierQuery && (
                  <button type="button" aria-label={tp("Очистить поиск")} onClick={() => setSupplierQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {normalizedSupplierQuery && <p className="mt-2 text-xs text-muted-foreground">{tp("Найдено")}: {filteredSuppliers.length}</p>}
            </div>
            {suppliers.length === 0 ? (
              <div className="text-center py-14 text-muted-foreground">
                <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-semibold">{t("settings.emptySuppliers")}</p>
              </div>
            ) : filteredSuppliers.length === 0 ? (
              <div className="text-center py-14 text-muted-foreground">
                <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-semibold">{tp("Ничего не найдено")}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {visibleSuppliers.map((supplier) => (
                  <div key={supplier.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-primary/5 transition-colors [content-visibility:auto] [contain-intrinsic-size:0_104px] [contain:layout_style_paint]">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-bold text-lg">{supplier.name}</div>
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                          {supplier.discount_percent}%
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                        {supplier.phone && <span>{supplier.phone}</span>}
                        {supplier.email && <span>{supplier.email}</span>}
                      </div>
                      {supplier.notes && <p className="text-sm text-muted-foreground">{supplier.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" aria-label={tp("Редактировать поставщика")} onClick={() => editSupplier(supplier)} className="h-10 w-10 rounded-xl">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" aria-label={tp("Удалить поставщика")} onClick={() => removeSupplier(supplier.id)} className="h-10 w-10 rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {hasMoreSuppliers && (
                  <div className="p-4 sm:p-5 text-center">
                    <Button type="button" variant="outline" onClick={() => setVisibleSupplierCount((count) => count + listPageSize)} className="h-10 px-5 text-sm rounded-xl">
                      {tp("Показать еще")} {Math.min(listPageSize, filteredSuppliers.length - visibleSupplierCount)}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createEmployee, deleteEmployee, getEmployees, updateEmployee } from "@/lib/supabase";
import type { Employee, EmployeeFormData } from "@/lib/types";
import { Edit, Save, Search, Trash2, UserRoundCog, X } from "lucide-react";
import { useLanguage } from "@/components/layout/LanguageProvider";
import { useAppAlert } from "@/components/layout/AppAlertProvider";
import { PageHeader, StatCard } from "@/components/layout/PageHeader";

const emptyForm: EmployeeFormData = {
  full_name: "",
  first_name: "",
  last_name: "",
  role: "Механик",
  phone: "",
  active: true,
};

const listPageSize = 60;

export default function EmployeesPage() {
  const { tp } = useLanguage();
  const { showAlert, showConfirm } = useAppAlert();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState<EmployeeFormData>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(listPageSize);
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadEmployees();
  }, []);

  async function loadEmployees() {
    const data = await getEmployees(true);
    setEmployees(data);
    setVisibleCount(listPageSize);
  }

  const stats = useMemo(() => ({
    total: employees.length,
    active: employees.filter((employee) => employee.active).length,
    mechanics: employees.filter((employee) => employee.role.toLowerCase().includes("механ")).length,
  }), [employees]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredEmployees = normalizedQuery
    ? employees.filter((employee) => [
        employee.full_name,
        employee.role,
        employee.phone,
        employee.email,
        employee.notes,
        employee.active ? "active активен" : "inactive не активен",
      ].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery))
    : employees;
  const visibleEmployees = filteredEmployees.slice(0, visibleCount);
  const hasMore = visibleCount < filteredEmployees.length;

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function splitEmployeeName(fullName: string) {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    const [lastName = "", ...rest] = parts;
    return { last_name: lastName, first_name: rest.join(" ") };
  }

  function editEmployee(employee: Employee) {
    const splitName = splitEmployeeName(employee.full_name);
    setEditingId(employee.id);
    setForm({
      full_name: employee.full_name,
      first_name: splitName.first_name,
      last_name: splitName.last_name,
      role: employee.role,
      phone: employee.phone || "",
      active: employee.active,
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fullName = `${form.last_name || ""} ${form.first_name || ""}`.trim();
    if (!fullName) {
      showAlert(tp("Введите фамилию и имя сотрудника"), { variant: "warning" });
      return;
    }

    const payload = {
      full_name: fullName,
      role: form.role.trim() || "Механик",
      phone: form.phone || null,
      active: form.active,
    };

    setLoading(true);
    try {
      if (editingId) {
        await updateEmployee(editingId, payload);
      } else {
        await createEmployee(payload);
      }
      resetForm();
      await loadEmployees();
    } catch {
      showAlert(tp("Ошибка при сохранении сотрудника"), { variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function removeEmployee(id: string) {
    const confirmed = await showConfirm(tp("Удалить сотрудника? В старых заказах имя исполнителя сохранится."), { destructive: true });
    if (!confirmed) return;
    try {
      await deleteEmployee(id);
      await loadEmployees();
      if (editingId === id) resetForm();
    } catch {
      showAlert(tp("Ошибка при удалении сотрудника"), { variant: "error" });
    }
  }

  return (
    <div className="space-y-5 sm:space-y-6 lg:space-y-7 animate-fade-in pb-8 lg:pb-4">
      <PageHeader
        icon={<UserRoundCog className="h-5 w-5" />}
        title={tp("Сотрудники")}
        description={tp("Механики и исполнители работ сервиса")}
      />

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard label={tp("Всего")} value={stats.total} />
        <StatCard label={tp("Активные")} value={stats.active} tone="success" />
        <StatCard label={tp("Механики")} value={stats.mechanics} tone="primary" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="glass-card border-border/80">
          <CardHeader className="border-b border-border/40 bg-secondary/5 p-5 rounded-t-2xl">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">
              {editingId ? tp("Редактировать сотрудника") : tp("Новый сотрудник")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="employee-last-name">{tp("Фамилия")}</Label>
                  <Input id="employee-last-name" autoComplete="family-name" value={form.last_name || ""} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employee-first-name">{tp("Имя")}</Label>
                  <Input id="employee-first-name" autoComplete="given-name" value={form.first_name || ""} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} className="h-11" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="employee-role">{tp("Должность")}</Label>
                <Input id="employee-role" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employee-phone">{tp("Телефон")}</Label>
                <Input id="employee-phone" type="tel" autoComplete="tel" value={form.phone || ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="h-11" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={loading} className="btn-garage h-11 px-5 text-sm flex-1">
                  <Save className="h-4 w-4" />
                  {loading ? tp("Сохранение...") : tp("Сохранить")}
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

        <Card className="glass-card border-border/80 xl:col-span-2">
          <CardHeader className="border-b border-border/40 bg-secondary/5 p-5 rounded-t-2xl">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">{tp("Список сотрудников")} ({employees.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-4 sm:p-5 border-b border-border/40">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setVisibleCount(listPageSize);
                  }}
                  placeholder={tp("Поиск сотрудника, должности, телефона...")}
                  className="h-11 pl-9 pr-10"
                />
                {query && (
                  <button type="button" aria-label={tp("Очистить поиск")} onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {normalizedQuery && <p className="mt-2 text-xs text-muted-foreground">{tp("Найдено")}: {filteredEmployees.length}</p>}
            </div>
            {employees.length === 0 ? (
              <div className="text-center py-14 text-muted-foreground">
                <UserRoundCog className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-semibold">{tp("Сотрудники пока не добавлены")}</p>
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="text-center py-14 text-muted-foreground">
                <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-semibold">{tp("Ничего не найдено")}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {visibleEmployees.map((employee) => (
                  <div key={employee.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-primary/5 transition-colors [content-visibility:auto] [contain-intrinsic-size:0_112px] [contain:layout_style_paint]">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="min-w-0 break-words text-lg font-bold">{employee.full_name}</div>
                        <Badge variant="outline" className={employee.active ? "bg-green-100 text-green-800 border-green-200" : "bg-zinc-200 text-zinc-700 border-zinc-300"}>
                          {employee.active ? tp("Активен") : tp("Не активен")}
                        </Badge>
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                          {employee.role}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {employee.phone && <span className="break-all">{employee.phone}</span>}
                        {employee.email && <span className="break-all">{employee.email}</span>}
                      </div>
                      {employee.notes && <p className="break-words text-sm text-muted-foreground">{employee.notes}</p>}
                    </div>
                    <div className="flex items-center justify-end gap-2 sm:flex-shrink-0">
                      <Button variant="outline" size="icon" aria-label="Редактировать сотрудника" onClick={() => editEmployee(employee)} className="h-10 w-10 rounded-xl">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" aria-label="Удалить сотрудника" onClick={() => removeEmployee(employee.id)} className="h-10 w-10 rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {hasMore && (
                  <div className="p-4 sm:p-5 text-center">
                    <Button type="button" variant="outline" onClick={() => setVisibleCount((count) => count + listPageSize)} className="h-10 w-full rounded-xl px-5 text-sm sm:w-auto">
                      {tp("Показать еще")} {Math.min(listPageSize, filteredEmployees.length - visibleCount)}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

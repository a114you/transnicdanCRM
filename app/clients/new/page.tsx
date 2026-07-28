"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CarAutocompleteInput } from "@/components/fields/CarAutocompleteInput";
import { YearInput } from "@/components/fields/YearInput";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { createClient, createCar } from "@/lib/supabase";
import type { CarFormData } from "@/lib/types";
import { useLanguage } from "@/components/layout/LanguageProvider";
import { useAppAlert } from "@/components/layout/AppAlertProvider";

export default function NewClientPage() {
  const router = useRouter();
  const { tp } = useLanguage();
  const { showAlert } = useAppAlert();
  const [loading, setLoading] = useState(false);
  const [cars, setCars] = useState<CarFormData[]>([]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    try {
      // Создаём клиента
      const client = await createClient({
        full_name: formData.get("full_name") as string,
        phone: formData.get("phone") as string,
        email: formData.get("email") as string || undefined,
        notes: formData.get("notes") as string || undefined,
      });

      // Создаём машины клиента
      for (const car of cars) {
        await createCar({
          ...car,
          client_id: client.id,
        });
      }

      router.push(`/clients/${client.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : tp("Ошибка при создании клиента");
      showAlert(message, { variant: "error" });
      setLoading(false);
    }
  }

  function addCar() {
    setCars([...cars, { brand: "", model: "" }]);
  }

  function updateCar(index: number, field: keyof CarFormData, value: string | number | undefined) {
    const updated = [...cars];
    if (field === 'year' || field === 'mileage') {
      // For number fields, allow empty string to clear the value
      const numValue = value === '' || value === undefined ? undefined : Number(value);
      updated[index] = { ...updated[index], [field]: numValue };
    } else {
      updated[index] = { ...updated[index], [field]: value as string };
    }
    setCars(updated);
  }

  function removeCar(index: number) {
    setCars(cars.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-5 sm:space-y-6 lg:space-y-7 pb-8 lg:pb-4 max-w-4xl">
      <div className="flex items-center gap-3">
        <BackButton href="/clients" label={tp("Назад к списку клиентов")} ariaLabel={tp("Назад к списку клиентов")} />
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{tp("Новый клиент")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{tp("Клиент и автомобили в одном шаге")}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
        <Card className="glass-card border-border/80">
          <CardHeader className="border-b border-border/40 bg-secondary/5 rounded-t-2xl">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">{tp("Информация о клиенте")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">{tp("ФИО *")}</Label>
                <Input id="full_name" name="full_name" autoComplete="name" required placeholder={tp("Иванов Иван Иванович")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">{tp("Телефон *")}</Label>
                <Input id="phone" name="phone" type="tel" autoComplete="tel" required placeholder="+373 69 000 000" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" placeholder={tp("client@example.com")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">{tp("Примечания")}</Label>
              <Textarea id="notes" name="notes" placeholder={tp("Дополнительная информация...")} />
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/80">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/40 bg-secondary/5 rounded-t-2xl">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">{tp("Автомобили")}</CardTitle>
            <Button type="button" variant="outline" onClick={addCar} className="h-11 w-full rounded-xl px-5 text-sm sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              {tp("Добавить авто")}
            </Button>
          </CardHeader>
          <CardContent>
            {cars.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">{tp("Нет добавленных автомобилей")}</p>
            ) : (
              <div className="space-y-4">
                {cars.map((car, index) => (
                  <div key={index} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{tp("Автомобиль #")}{index + 1}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeCar(index)}
                        aria-label={tp("Удалить автомобиль")}
                        className="h-9 w-9 rounded-lg"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor={`car-brand-${index}`} className="text-xs">{tp("Марка *")}</Label>
                        <CarAutocompleteInput id={`car-brand-${index}`} type="make" value={car.brand} onChange={(value) => updateCar(index, "brand", value)} required />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`car-model-${index}`} className="text-xs">{tp("Модель *")}</Label>
                        <CarAutocompleteInput id={`car-model-${index}`} type="model" make={car.brand} value={car.model} onChange={(value) => updateCar(index, "model", value)} required />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`car-year-${index}`} className="text-xs">{tp("Год")}</Label>
                        <YearInput id={`car-year-${index}`} value={car.year} onValueChange={(value) => updateCar(index, "year", value)} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`car-plate-${index}`} className="text-xs">{tp("Гос. номер")}</Label>
                        <Input id={`car-plate-${index}`} value={car.license_plate || ""} onChange={(e) => updateCar(index, "license_plate", e.target.value.toUpperCase())} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor={`car-vin-${index}`} className="text-xs">VIN</Label>
                        <Input id={`car-vin-${index}`} value={car.vin || ""} maxLength={17} onChange={(e) => updateCar(index, "vin", e.target.value.toUpperCase())} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`car-mileage-${index}`} className="text-xs">{tp("Пробег")}</Label>
                        <Input id={`car-mileage-${index}`} type="number" value={car.mileage ?? ""} onChange={(e) => updateCar(index, "mileage", e.target.value === "" ? undefined : Number(e.target.value))} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          <Button type="submit" disabled={loading} className="btn-garage h-11 px-5 text-sm flex-1">
            {loading ? tp("Сохранение...") : tp("Сохранить клиента")}
          </Button>
          <Link href="/clients" className="w-full sm:w-auto">
            <Button type="button" variant="outline" className="h-11 w-full rounded-xl px-5 text-sm sm:w-auto">
              {tp("Отмена")}
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}

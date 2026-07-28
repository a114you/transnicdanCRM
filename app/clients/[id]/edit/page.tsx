"use client";

import { useState, useEffect, use } from "react";
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
import { getClientById, updateClient, createCar, deleteCar, updateCar as saveCar } from "@/lib/supabase";
import type { CarFormData, Car, ClientWithCars } from "@/lib/types";
import { useLanguage } from "@/components/layout/LanguageProvider";
import { useAppAlert } from "@/components/layout/AppAlertProvider";

export default function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { tp } = useLanguage();
  const { showAlert, showConfirm } = useAppAlert();
  const [loading, setLoading] = useState(false);
  const [client, setClient] = useState<ClientWithCars | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [existingCars, setExistingCars] = useState<Car[]>([]);
  const [newCars, setNewCars] = useState<CarFormData[]>([]);

  useEffect(() => {
    Promise.resolve().then(() => {
      setFetchError(false);
    });
    getClientById(id)
      .then((data) => {
        if (data) {
          setClient(data);
          setExistingCars(data.cars || []);
        } else {
          setFetchError(true);
        }
      })
      .catch(() => setFetchError(true));
  }, [id]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!client) return;

    setLoading(true);
    const formData = new FormData(e.currentTarget);

    try {
      // Обновляем клиента
      await updateClient(id, {
        full_name: formData.get("full_name") as string,
        phone: formData.get("phone") as string,
        email: (formData.get("email") as string) || undefined,
        notes: (formData.get("notes") as string) || undefined,
      });

      for (const car of existingCars) {
        await saveCar(car.id, {
          brand: car.brand,
          model: car.model,
          year: car.year,
          vin: car.vin || undefined,
          license_plate: car.license_plate || undefined,
          mileage: car.mileage,
          notes: car.notes || undefined,
        });
      }

      for (const car of newCars) {
        await createCar({ ...car, client_id: id });
      }

      router.push(`/clients/${id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : tp("Ошибка при обновлении клиента");
      showAlert(message, { variant: "error" });
      setLoading(false);
    }
  }

  function addNewCar() {
    setNewCars([...newCars, { brand: "", model: "" }]);
  }

  function updateExistingCar(index: number, field: keyof CarFormData, value: string | number | undefined) {
    const updated = [...existingCars];
    if (field === "year" || field === "mileage") {
      updated[index] = { ...updated[index], [field]: value === "" || value === undefined ? undefined : Number(value) };
    } else {
      updated[index] = { ...updated[index], [field]: value as string };
    }
    setExistingCars(updated);
  }

  function updateNewCar(index: number, field: keyof CarFormData, value: string | number | undefined) {
    const updated = [...newCars];
    if (field === 'year' || field === 'mileage') {
      const numValue = value === '' || value === undefined ? undefined : Number(value);
      updated[index] = { ...updated[index], [field]: numValue };
    } else {
      updated[index] = { ...updated[index], [field]: value as string };
    }
    setNewCars(updated);
  }

  function removeNewCar(index: number) {
    setNewCars(newCars.filter((_, i) => i !== index));
  }

  async function handleDeleteCar(carId: string) {
    const confirmed = await showConfirm(tp("Удалить автомобиль? Это также удалит все связанные заказы!"), { destructive: true });
    if (!confirmed) return;
    if (!client) return;
    try {
      await deleteCar(carId);
      setClient({ ...client, cars: client.cars.filter((c: Car) => c.id !== carId) });
      setExistingCars(existingCars.filter((c) => c.id !== carId));
    } catch {
      showAlert(tp("Ошибка при удалении автомобиля"), { variant: "error" });
    }
  }

  if (fetchError) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-red-500 font-semibold">{tp("Ошибка при обновлении клиента")}</p>
        <Link href="/clients">
          <Button variant="outline" className="h-11 px-5 text-sm rounded-xl">
            {tp("Отмена")}
          </Button>
        </Link>
      </div>
    );
  }

  if (!client) {
    return <div className="p-8 text-center min-h-[800px]">{tp("Загрузка...")}</div>;
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center gap-3 sm:gap-4">
        <BackButton href={`/clients/${id}`} label="Назад к карточке клиента" ariaLabel="Назад к карточке клиента" />
        <h1 className="min-w-0 text-2xl font-bold sm:text-3xl">{tp("Редактирование клиента")}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{tp("Информация о клиенте")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">{tp("ФИО *")}</Label>
                <Input
                  id="full_name"
                  name="full_name"
                  autoComplete="name"
                  defaultValue={client.full_name}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">{tp("Телефон *")}</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  defaultValue={client.phone}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{tp("Email")}</Label>
              <Input id="email" name="email" type="email" autoComplete="email" defaultValue={client.email || ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">{tp("Примечания")}</Label>
              <Textarea id="notes" name="notes" defaultValue={client.notes || ""} />
            </div>
          </CardContent>
        </Card>

        {/* Существующие машины */}
        <Card>
          <CardHeader>
            <CardTitle>{tp("Текущие автомобили")}</CardTitle>
          </CardHeader>
          <CardContent>
            {existingCars.length === 0 ? (
              <p className="text-muted-foreground">{tp("Нет добавленных автомобилей")}</p>
            ) : (
              <div className="space-y-4">
                {existingCars.map((car: Car, index) => (
                  <div key={car.id} className="space-y-3 rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="break-words font-medium">{car.brand || tp("Автомобиль")} {car.model}</div>
                        <div className="text-xs text-muted-foreground">{tp("Можно изменить данные без потери истории ремонтов")}</div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteCar(car.id)}
                        aria-label={tp("Удалить автомобиль")}
                        className="h-9 w-9 rounded-lg"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor={`existing-car-brand-${index}`} className="text-xs">{tp("Марка *")}</Label>
                        <CarAutocompleteInput id={`existing-car-brand-${index}`} type="make" value={car.brand} onChange={(value) => updateExistingCar(index, "brand", value)} required />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`existing-car-model-${index}`} className="text-xs">{tp("Модель *")}</Label>
                        <CarAutocompleteInput id={`existing-car-model-${index}`} type="model" make={car.brand} value={car.model} onChange={(value) => updateExistingCar(index, "model", value)} required />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`existing-car-year-${index}`} className="text-xs">{tp("Год")}</Label>
                        <YearInput id={`existing-car-year-${index}`} value={car.year} onValueChange={(value) => updateExistingCar(index, "year", value)} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`existing-car-plate-${index}`} className="text-xs">{tp("Гос. номер")}</Label>
                        <Input id={`existing-car-plate-${index}`} value={car.license_plate || ""} onChange={(e) => updateExistingCar(index, "license_plate", e.target.value.toUpperCase())} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor={`existing-car-vin-${index}`} className="text-xs">VIN</Label>
                        <Input id={`existing-car-vin-${index}`} value={car.vin || ""} maxLength={17} onChange={(e) => updateExistingCar(index, "vin", e.target.value.toUpperCase())} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`existing-car-mileage-${index}`} className="text-xs">{tp("Пробег")}</Label>
                        <Input id={`existing-car-mileage-${index}`} type="number" min="0" value={car.mileage ?? ""} onChange={(e) => updateExistingCar(index, "mileage", e.target.value === "" ? undefined : Number(e.target.value))} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`existing-car-notes-${index}`} className="text-xs">{tp("Примечания")}</Label>
                      <Textarea id={`existing-car-notes-${index}`} value={car.notes || ""} onChange={(e) => updateExistingCar(index, "notes", e.target.value)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Новые машины */}
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{tp("Добавить автомобили")}</CardTitle>
            <Button type="button" variant="outline" onClick={addNewCar} className="h-11 w-full rounded-xl px-5 text-sm sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              {tp("Добавить авто")}
            </Button>
          </CardHeader>
          <CardContent>
            {newCars.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">{tp("Нет новых автомобилей для добавления")}</p>
            ) : (
              <div className="space-y-4">
                {newCars.map((car, index) => (
                  <div key={index} className="space-y-3 rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 break-words font-medium">{tp("Новый автомобиль")} #{index + 1}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeNewCar(index)}
                        aria-label={tp("Удалить автомобиль")}
                        className="h-9 w-9 rounded-lg"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor={`new-car-brand-${index}`} className="text-xs">{tp("Марка *")}</Label>
                        <CarAutocompleteInput id={`new-car-brand-${index}`} type="make" value={car.brand} onChange={(value) => updateNewCar(index, "brand", value)} required />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`new-car-model-${index}`} className="text-xs">{tp("Модель *")}</Label>
                        <CarAutocompleteInput id={`new-car-model-${index}`} type="model" make={car.brand} value={car.model} onChange={(value) => updateNewCar(index, "model", value)} required />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`new-car-year-${index}`} className="text-xs">{tp("Год")}</Label>
                        <YearInput id={`new-car-year-${index}`} value={car.year} onValueChange={(value) => updateNewCar(index, "year", value)} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`new-car-plate-${index}`} className="text-xs">{tp("Гос. номер")}</Label>
                        <Input id={`new-car-plate-${index}`} value={car.license_plate || ""} onChange={(e) => updateNewCar(index, "license_plate", e.target.value.toUpperCase())} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor={`new-car-vin-${index}`} className="text-xs">VIN</Label>
                        <Input id={`new-car-vin-${index}`} value={car.vin || ""} maxLength={17} onChange={(e) => updateNewCar(index, "vin", e.target.value.toUpperCase())} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`new-car-mileage-${index}`} className="text-xs">{tp("Пробег")}</Label>
                        <Input id={`new-car-mileage-${index}`} type="number" value={car.mileage ?? ""} onChange={(e) => updateNewCar(index, "mileage", e.target.value === "" ? undefined : Number(e.target.value))} />
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
            {loading ? tp("Сохранение...") : tp("Сохранить изменения")}
          </Button>
          <Link href={`/clients/${id}`} className="w-full sm:w-auto">
            <Button type="button" variant="outline" className="h-11 w-full rounded-xl px-5 text-sm sm:w-auto">
              {tp("Отмена")}
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}

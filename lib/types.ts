// CRM для автосервиса - TypeScript типы

// Реквизиты компании (для шапки PDF/Excel)
export type { CompanyInfo } from "./company-settings";

// Клиент
export interface Client {
  id: string;
  full_name: string;
  phone: string;
  email?: string;
  notes?: string;
  created_at: string;
}

export interface ClientWithCars extends Client {
  cars: Car[];
}

// Автомобиль
export interface Car {
  id: string;
  client_id: string;
  brand: string;
  model: string;
  year?: number;
  vin?: string;
  license_plate?: string;
  mileage?: number;
  notes?: string;
  created_at: string;
}

export interface CarWithClient extends Car {
  client: Client;
}

// Заказ (ремонт)
export type OrderStatus = 'Новый' | 'В работе' | 'Готов' | 'Выдан';
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'mixed';
export type PaymentEntryMethod = Exclude<PaymentMethod, 'mixed'>;
export type PaymentStatus = 'paid' | 'partial' | 'unpaid';

export interface PaymentEntry {
  id: string;
  method: PaymentEntryMethod;
  amount: number;
  paid_at: string;
  note?: string;
}

export interface Order {
  id: string;
  client_id: string;
  car_id: string;
  car_mileage?: number | null;
  order_date: string;
  status: OrderStatus;
  total_amount: number;
  payment_method?: PaymentMethod;
  payment_entries?: PaymentEntry[];
  paid_amount?: number;
  debt_amount?: number;
  debt_started_at?: string | null;
  payment_status?: PaymentStatus;
  referrer_id?: string | null;
  referrer_name?: string | null;
  referrer_reward?: number;
  referrer_reward_works?: number;
  notes?: string;
  created_at: string;
}

export interface OrderWithDetails extends Order {
  client: Client;
  car: Car;
  items: OrderItem[];
}

// Позиция заказа
export type OrderItemType = 'work' | 'part';
export type PartSource = 'manual' | 'warehouse';

export interface OrderItem {
  id: string;
  order_id: string;
  type: OrderItemType;
  mechanic_id?: string | null;
  mechanic_name?: string | null;
  source?: PartSource;
  warehouse_part_id?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  name: string;
  code?: string;
  brand?: string;
  quantity: number;
  selling_price: number;
  cost_price?: number;
  total_price: number;
  cost_total?: number;
  profit_amount?: number;
  supplier_discount_percent?: number;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  discount_percent: number;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface Employee {
  id: string;
  full_name: string;
  role: string;
  phone?: string | null;
  email?: string | null;
  active: boolean;
  notes?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface EmployeeFormData {
  full_name: string;
  first_name?: string;
  last_name?: string;
  role: string;
  phone?: string;
  email?: string;
  active: boolean;
  notes?: string;
}

export interface SupplierFormData {
  name: string;
  discount_percent: number;
  phone?: string;
  email?: string;
  notes?: string;
}

export interface WorkTemplate {
  id: string;
  name: string;
  code?: string | null;
  default_price: number;
  category?: string | null;
  created_at: string;
}

export interface WorkTemplateFormData {
  name: string;
  code?: string;
  default_price: number;
  category?: string;
}

export interface WarehousePart {
  id: string;
  name: string;
  code?: string | null;
  brand?: string | null;
  supplier_id?: string | null;
  quantity: number;
  min_quantity: number;
  purchase_price: number;
  selling_price: number;
  location?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface WarehousePartFormData {
  name: string;
  code?: string;
  brand?: string;
  supplier_id?: string;
  quantity: number;
  min_quantity: number;
  purchase_price: number;
  selling_price: number;
  location?: string;
  notes?: string;
}

export type WarehouseMovementType = 'order_consume' | 'order_return' | 'manual_add' | 'manual_remove' | 'manual_adjust' | 'initial';

export interface WarehouseMovement {
  id: string;
  warehouse_part_id: string;
  part_name: string;
  part_code?: string | null;
  part_brand?: string | null;
  delta: number;
  quantity_before: number;
  quantity_after: number;
  movement_type: WarehouseMovementType;
  order_id?: string | null;
  order_number?: string | null;
  client_name?: string | null;
  car_info?: string | null;
  note?: string | null;
  created_at: string;
}

// Формы
export interface ClientFormData {
  full_name: string;
  phone: string;
  email?: string;
  notes?: string;
}

export interface CarFormData {
  brand: string;
  model: string;
  year?: number;
  vin?: string;
  license_plate?: string;
  mileage?: number;
  notes?: string;
}

export interface OrderFormData {
  client_id: string;
  car_id: string;
  car_mileage?: number;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_entries?: PaymentEntry[];
  paid_amount: number;
  debt_started_at?: string;
  referrer_id?: string | null;
  referrer_name?: string | null;
  referrer_reward?: number;
  referrer_reward_works?: number;
  notes?: string;
  items: OrderItemFormData[];
}

export interface OrderItemFormData {
  type: OrderItemType;
  mechanic_id?: string;
  mechanic_name?: string;
  source?: PartSource;
  warehouse_part_id?: string;
  supplier_id?: string;
  supplier_name?: string;
  name: string;
  code?: string;
  brand?: string;
  quantity: number;
  selling_price: number;
  cost_price?: number;
  supplier_discount_percent?: number;
  tempId?: string;
}

// Поиск
export interface SearchResult {
  clients: ClientWithCars[];
  cars: CarWithClient[];
  orders?: OrderWithDetails[];
  orderItems?: (OrderItem & { order?: OrderWithDetails })[];
  warehouseParts?: WarehousePart[];
  suppliers?: Supplier[];
  employees?: Employee[];
}

// Рефереры (партнёры, приводящие клиентов)
export type ReferrerRewardType = "fixed" | "percent";

export interface Referrer {
  id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  reward_type: ReferrerRewardType;
  reward_fixed: number;
  reward_percent: number;
  notes?: string | null;
  active: boolean;
  created_at: string;
}

export interface ReferrerFormData {
  full_name: string;
  phone?: string;
  email?: string;
  reward_type: ReferrerRewardType;
  reward_fixed: number;
  reward_percent: number;
  notes?: string;
  active: boolean;
}

// Отчёты
export interface DailyReport {
  date: string;
  total_amount: number;
  orders_count: number;
}

export interface MonthlyReport {
  month: string;
  total_amount: number;
  orders_count: number;
}

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type {
  Client,
  Car,
  Order,
  OrderItem,
  OrderWithDetails,
  ClientWithCars,
  PaymentEntry,
  Employee,
  Supplier,
  WarehousePart,
  WarehouseMovement,
  WarehouseMovementType,
  Referrer,
  ReferrerFormData,
  WorkTemplate,
} from './types';
import { getDebtAmount, getItemTotals, getPaidAmountFromEntries, getPaymentMethodFromEntries, getPaymentStatus, money } from './finance';
import { normalizeVehicleCode } from './act-report';
import { createId } from './utils';
import {
  getCompanyInfo as getCompanyInfoFromDb,
  getRawCompanyInfo as getRawCompanyInfoFromDb,
  updateCompanyInfo as updateCompanyInfoInDb,
  FALLBACK_COMPANY_INFO,
  companyInfoToLines,
  type CompanyInfo,
} from './company-settings';

export { FALLBACK_COMPANY_INFO, companyInfoToLines };
export type { CompanyInfo };

export async function getCompanyInfo(): Promise<string[]> {
  if (shouldProxyToServer()) return serverAction<string[]>('getCompanyInfo');
  return getCompanyInfoFromDb();
}

export async function getRawCompanyInfo(): Promise<CompanyInfo> {
  if (shouldProxyToServer()) return serverAction<CompanyInfo>('getRawCompanyInfo');
  return getRawCompanyInfoFromDb();
}

export async function updateCompanyInfo(info: CompanyInfo): Promise<void> {
  if (shouldProxyToServer()) return serverAction<void>('updateCompanyInfo', [info]);
  return updateCompanyInfoInDb(info);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  typeof window === 'undefined'
    ? process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

async function serverAction<T>(action: string, args: unknown[] = []): Promise<T> {
  const response = await fetch('/api/db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || payload?.message || 'Database request failed');
  }

  return response.json() as Promise<T>;
}

function shouldProxyToServer() {
  return typeof window !== 'undefined';
}

// Клиенты
export async function getClients(): Promise<ClientWithCars[]> {
  if (shouldProxyToServer()) return serverAction<ClientWithCars[]>('getClients');
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('*, cars(*)')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  } catch {
    return [];
  }
}

export async function getClientsList(limit = 40, offset = 0): Promise<ClientWithCars[]> {
  if (shouldProxyToServer()) return serverAction<ClientWithCars[]>('getClientsList', [limit, offset]);
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('id, full_name, phone, email, notes, created_at, cars(id, client_id, brand, model, year, vin, license_plate, mileage, notes, created_at)')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data || [];
  } catch {
    return [];
  }
}

export async function getClientsCount(): Promise<number> {
  if (shouldProxyToServer()) return serverAction<number>('getClientsCount');
  try {
    const { count, error } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true });

    if (error) throw error;
    return count || 0;
  } catch {
    return 0;
  }
}

export async function getDashboardCounts(): Promise<{
  clientsCount: number;
  carsCount: number;
  activeOrdersCount: number;
  completedOrdersCount: number;
}> {
  if (shouldProxyToServer()) return serverAction('getDashboardCounts');
  try {
    const [clients, cars, activeOrders, completedOrders] = await Promise.all([
      supabase.from('clients').select('id', { count: 'exact', head: true }),
      supabase.from('cars').select('id', { count: 'exact', head: true }),
      supabase.from('orders').select('id', { count: 'exact', head: true }).in('status', ['Новый', 'В работе']),
      supabase.from('orders').select('id', { count: 'exact', head: true }).in('status', ['Готов', 'Выдан']),
    ]);

    return {
      clientsCount: clients.count || 0,
      carsCount: cars.count || 0,
      activeOrdersCount: activeOrders.count || 0,
      completedOrdersCount: completedOrders.count || 0,
    };
  } catch {
    return {
      clientsCount: 0,
      carsCount: 0,
      activeOrdersCount: 0,
      completedOrdersCount: 0,
    };
  }
}

export async function searchClients(query: string): Promise<ClientWithCars[]> {
  if (shouldProxyToServer()) return serverAction<ClientWithCars[]>('searchClients', [query]);
  try {
    const term = normalizeSearchTerm(query);
    if (!term) return [];

    const [nameResult, phoneResult] = await Promise.all([
      supabase
        .from('clients')
        .select('*, cars(*)')
        .ilike('full_name', `%${term}%`)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('clients')
        .select('*, cars(*)')
        .ilike('phone', `%${term}%`)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    if (nameResult.error) throw nameResult.error;
    if (phoneResult.error) throw phoneResult.error;
    return uniqueById([...(nameResult.data || []), ...(phoneResult.data || [])]).slice(0, 20);
  } catch {
    return [];
  }
}

export async function getClientById(id: string): Promise<ClientWithCars | null> {
  if (shouldProxyToServer()) return serverAction<ClientWithCars | null>('getClientById', [id]);
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('*, cars(*)')
      .eq('id', id)
      .single();
    
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

export async function createClient(client: Omit<Client, 'id' | 'created_at'>): Promise<Client> {
  if (shouldProxyToServer()) return serverAction<Client>('createClient', [client]);

  // Проверка на дубликат по имени
  const { data: existing } = await supabase
    .from('clients')
    .select('id, full_name')
    .ilike('full_name', client.full_name.trim())
    .limit(1);

  if (existing && existing.length > 0) {
    throw new Error(`Клиент с именем «${existing[0].full_name}» уже существует в системе`);
  }

  const { data, error } = await supabase
    .from('clients')
    .insert(client)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function updateClient(id: string, client: Partial<Client>): Promise<Client> {
  if (shouldProxyToServer()) return serverAction<Client>('updateClient', [id, client]);
  const { data, error } = await supabase
    .from('clients')
    .update(client)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function deleteClient(id: string): Promise<void> {
  if (shouldProxyToServer()) return serverAction<void>('deleteClient', [id]);

  // Перед удалением: помечаем все движения запчастей по заказам этого клиента
  try {
    const { data: client } = await supabase.from('clients').select('full_name, phone').eq('id', id).single();
    const clientName = client?.full_name || 'Неизвестный';
    const clientPhone = client?.phone || '';

    const { data: clientOrders } = await supabase.from('orders').select('id').eq('client_id', id);
    const orderIds = (clientOrders || []).map((o) => o.id);

    if (orderIds.length > 0) {
      // Получаем движения с информацией о запчастях
      const { data: movements } = await supabase
        .from('warehouse_movements')
        .select('id, part_name, part_code, delta, note')
        .in('order_id', orderIds);

      if (movements && movements.length > 0) {
        for (const mov of movements) {
          const existingNote = mov.note || '';
          const newNote = `КЛИЕНТ УДАЛЁН: ${clientName}${clientPhone ? ` (${clientPhone})` : ''} | Запчасть: ${mov.part_name}${mov.part_code ? ` [${mov.part_code}]` : ''} | Списано: ${Math.abs(mov.delta)} шт. | ${existingNote}`;
          await supabase
            .from('warehouse_movements')
            .update({ note: newNote })
            .eq('id', mov.id);
        }
      }
    }
  } catch (err) {
    console.error('[deleteClient] failed to log warehouse movements:', err);
  }

  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) throw error;
}

// Машины
export async function getCarsByClientId(clientId: string): Promise<Car[]> {
  if (shouldProxyToServer()) return serverAction<Car[]>('getCarsByClientId', [clientId]);
  const { data, error } = await supabase
    .from('cars')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function getCarById(id: string): Promise<Car | null> {
  if (shouldProxyToServer()) return serverAction<Car | null>('getCarById', [id]);
  const { data, error } = await supabase
    .from('cars')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) return null;
  return data;
}

export async function createCar(car: Omit<Car, 'id' | 'created_at'>): Promise<Car> {
  if (shouldProxyToServer()) return serverAction<Car>('createCar', [car]);
  const payload = {
    ...car,
    license_plate: normalizeVehicleCode(car.license_plate),
    vin: normalizeVehicleCode(car.vin),
  };

  // Проверка на дубликат по VIN
  if (payload.vin) {
    const { data: existingVin } = await supabase
      .from('cars')
      .select('id, brand, model, license_plate')
      .ilike('vin', payload.vin)
      .limit(1);

    if (existingVin && existingVin.length > 0) {
      throw new Error(`Автомобиль с VIN «${payload.vin}» уже существует (${existingVin[0].brand} ${existingVin[0].model}${existingVin[0].license_plate ? `, ${existingVin[0].license_plate}` : ''})`);
    }
  }

  // Проверка на дубликат по госномеру
  if (payload.license_plate) {
    const { data: existingPlate } = await supabase
      .from('cars')
      .select('id, brand, model, vin')
      .ilike('license_plate', payload.license_plate)
      .limit(1);

    if (existingPlate && existingPlate.length > 0) {
      throw new Error(`Автомобиль с госномером «${payload.license_plate}» уже существует (${existingPlate[0].brand} ${existingPlate[0].model})`);
    }
  }

  const { data, error } = await supabase
    .from('cars')
    .insert(payload)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function updateCar(id: string, car: Partial<Car>): Promise<Car> {
  if (shouldProxyToServer()) return serverAction<Car>('updateCar', [id, car]);
  const payload = {
    ...car,
    ...(car.license_plate !== undefined ? { license_plate: normalizeVehicleCode(car.license_plate) } : {}),
    ...(car.vin !== undefined ? { vin: normalizeVehicleCode(car.vin) } : {}),
  };

  // Проверка на дубликат по VIN (исключая текущий автомобиль)
  if (payload.vin) {
    const { data: existingVin } = await supabase
      .from('cars')
      .select('id, brand, model, license_plate')
      .ilike('vin', payload.vin)
      .neq('id', id)
      .limit(1);

    if (existingVin && existingVin.length > 0) {
      throw new Error(`Автомобиль с VIN «${payload.vin}» уже существует (${existingVin[0].brand} ${existingVin[0].model}${existingVin[0].license_plate ? `, ${existingVin[0].license_plate}` : ''})`);
    }
  }

  // Проверка на дубликат по госномеру (исключая текущий автомобиль)
  if (payload.license_plate) {
    const { data: existingPlate } = await supabase
      .from('cars')
      .select('id, brand, model')
      .ilike('license_plate', payload.license_plate)
      .neq('id', id)
      .limit(1);

    if (existingPlate && existingPlate.length > 0) {
      throw new Error(`Автомобиль с госномером «${payload.license_plate}» уже существует (${existingPlate[0].brand} ${existingPlate[0].model})`);
    }
  }

  const { data, error } = await supabase
    .from('cars')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function deleteCar(id: string): Promise<void> {
  if (shouldProxyToServer()) return serverAction<void>('deleteCar', [id]);
  const { error } = await supabase.from('cars').delete().eq('id', id);
  if (error) throw error;
}

export async function transferCar(carId: string, newClientId: string): Promise<void> {
  if (shouldProxyToServer()) return serverAction<void>('transferCar', [carId, newClientId]);
  // Обновляем владельца машины
  const { error: carError } = await supabase
    .from('cars')
    .update({ client_id: newClientId })
    .eq('id', carId);
  if (carError) throw carError;

  // Переносим все заказы этой машины на нового клиента
  const { error: orderError } = await supabase
    .from('orders')
    .update({ client_id: newClientId })
    .eq('car_id', carId);
  if (orderError) throw orderError;
}

// Заказы (ремонты)
export async function getOrders(limit = 50): Promise<OrderWithDetails[]> {
  if (shouldProxyToServer()) return serverAction<OrderWithDetails[]>('getOrders', [limit]);
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*, client:clients(*), car:cars(*), items:order_items(*)')
      .order('order_date', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  } catch {
    return [];
  }
}

export async function getOrdersByClientId(clientId: string): Promise<OrderWithDetails[]> {
  if (shouldProxyToServer()) return serverAction<OrderWithDetails[]>('getOrdersByClientId', [clientId]);
  const { data, error } = await supabase
    .from('orders')
    .select('*, client:clients(*), car:cars(*), items:order_items(*)')
    .eq('client_id', clientId)
    .order('order_date', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function getOrderById(id: string): Promise<OrderWithDetails | null> {
  if (shouldProxyToServer()) return serverAction<OrderWithDetails | null>('getOrderById', [id]);
  const { data, error } = await supabase
    .from('orders')
    .select('*, client:clients(*), car:cars(*), items:order_items(*)')
    .eq('id', id)
    .single();
  
  if (error) return null;
  return data;
}

export async function getTodaysOrders(): Promise<OrderWithDetails[]> {
  if (shouldProxyToServer()) return serverAction<OrderWithDetails[]>('getTodaysOrders');
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from('orders')
      .select('*, client:clients(*), car:cars(*), items:order_items(*)')
      .gte('order_date', start.toISOString())
      .lte('order_date', end.toISOString())
      .order('order_date', { ascending: false });
    
    if (error) throw error;
    return data || [];
  } catch {
    return [];
  }
}

export async function getOrdersByDateRange(startDate: string, endDate: string): Promise<OrderWithDetails[]> {
  if (shouldProxyToServer()) return serverAction<OrderWithDetails[]>('getOrdersByDateRange', [startDate, endDate]);
  const { data, error } = await supabase
    .from('orders')
    .select('*, client:clients(*), car:cars(*), items:order_items(*)')
    .gte('order_date', startDate)
    .lte('order_date', endDate)
    .order('order_date', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function createOrder(
  order: Omit<Order, 'id' | 'created_at' | 'total_amount'>,
  items: Omit<OrderItem, 'id' | 'order_id' | 'created_at' | 'total_price'>[]
): Promise<OrderWithDetails> {
  if (shouldProxyToServer()) return serverAction<OrderWithDetails>('createOrder', [order, items]);
  const total_amount = money(items.reduce((sum, item) => sum + (item.quantity * item.selling_price), 0));
  const payment = buildPaymentPayload(order, total_amount);
  await validateWarehouseAvailability([], items);

  // Создаём заказ
  // Strip new columns if DB migration hasn't been applied yet
  const orderPayload = stripNewOrderColumns({ ...order, ...payment, total_amount });
  const { data: newOrder, error: orderError } = await supabase
    .from('orders')
    .insert(orderPayload)
    .select('*, client:clients(*), car:cars(*)')
    .single();
  
  if (orderError) throw orderError;

  // Создаём позиции заказа
  if (items.length > 0) {
    const itemsWithOrderId = items.map(item => {
      const itemData = { ...item } as Omit<OrderItem, 'id' | 'order_id' | 'created_at' | 'total_price'> & { tempId?: string };
      delete itemData.tempId;
      return buildOrderItemPayload(newOrder.id, itemData);
    });

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(itemsWithOrderId);
    
    if (itemsError) throw itemsError;
  }

  await applyWarehouseDeltas([], items, {
    orderId: newOrder.id,
    orderNumber: newOrder.id.slice(0, 8),
    clientName: newOrder.client?.full_name || '',
    carInfo: newOrder.car ? `${newOrder.car.brand} ${newOrder.car.model}${newOrder.car.license_plate ? ` (${newOrder.car.license_plate})` : ''}` : '',
  });
  await updateCarMileageIfNewer(order.car_id, order.car_mileage);

  // Получаем полный заказ с позициями
  const fullOrder = await getOrderById(newOrder.id);
  if (!fullOrder) throw new Error('Failed to fetch created order');
  
  return fullOrder;
}

export async function updateOrder(
  id: string,
  order: Partial<Order>,
  items?: Omit<OrderItem, 'id' | 'order_id' | 'created_at' | 'total_price'>[]
): Promise<OrderWithDetails> {
  if (shouldProxyToServer()) return serverAction<OrderWithDetails>('updateOrder', [id, order, items]);
  const existingOrder = items ? await getOrderById(id) : null;
  const total_amount = items ? money(items.reduce((sum, item) => sum + (item.quantity * item.selling_price), 0)) : undefined;
  const payment = total_amount !== undefined ? buildPaymentPayload(order, total_amount, existingOrder || undefined) : {};

  if (items) {
    await validateWarehouseAvailability(existingOrder?.items || [], items);
  }

  // Обновляем заказ
  // Strip new columns if DB migration hasn't been applied yet
  const updatePayload = stripNewOrderColumns({ ...order, ...payment, ...(total_amount !== undefined && { total_amount }) });
  const { error: orderError } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq('id', id)
    .select('*, client:clients(*), car:cars(*)')
    .single();
  
  if (orderError) throw orderError;

  // Если переданы позиции - обновляем их
  if (items) {
    // Удаляем старые позиции
    await supabase.from('order_items').delete().eq('order_id', id);
    
    // Создаём новые позиции
    if (items.length > 0) {
      const itemsWithOrderId = items.map(item => {
        const itemData = { ...item } as Omit<OrderItem, 'id' | 'order_id' | 'created_at' | 'total_price'> & { tempId?: string };
        delete itemData.tempId;
        return buildOrderItemPayload(id, itemData);
      });

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(itemsWithOrderId);
      
      if (itemsError) throw itemsError;
    }

    await applyWarehouseDeltas(existingOrder?.items || [], items, {
      orderId: id,
      orderNumber: id.slice(0, 8),
      clientName: existingOrder?.client?.full_name,
      carInfo: existingOrder?.car ? `${existingOrder.car.brand} ${existingOrder.car.model}${existingOrder.car.license_plate ? ` (${existingOrder.car.license_plate})` : ''}` : '',
    });
  }

  await updateCarMileageIfNewer(order.car_id || existingOrder?.car_id, order.car_mileage ?? existingOrder?.car_mileage);

  // Получаем полный заказ
  const fullOrder = await getOrderById(id);
  if (!fullOrder) throw new Error('Failed to fetch updated order');
  
  return fullOrder;
}

export async function deleteOrder(id: string): Promise<void> {
  if (shouldProxyToServer()) return serverAction<void>('deleteOrder', [id]);
  const existingOrder = await getOrderById(id);
  await supabase.from('order_items').delete().eq('order_id', id);
  if (existingOrder?.items) {
    await applyWarehouseDeltas(existingOrder.items, [], {
      orderId: id,
      orderNumber: id.slice(0, 8),
      clientName: existingOrder?.client?.full_name || 'Неизвестный клиент',
      carInfo: existingOrder?.car ? `${existingOrder.car.brand} ${existingOrder.car.model}${existingOrder.car.license_plate ? ` (${existingOrder.car.license_plate})` : ''}` : '',
      note: `Заказ #${id.slice(0, 8)} удалён — ${existingOrder?.client?.full_name || ''}${existingOrder?.car ? `, ${existingOrder.car.brand} ${existingOrder.car.model}` : ''}`,
    });
  }
  const { error } = await supabase.from('orders').delete().eq('id', id);
  if (error) throw error;
}

// Сотрудники / механики
export async function getEmployees(includeInactive = false): Promise<Employee[]> {
  if (shouldProxyToServer()) return serverAction<Employee[]>('getEmployees', [includeInactive]);
  try {
    let query = supabase
      .from('employees')
      .select('*')
      .order('active', { ascending: false })
      .order('full_name', { ascending: true });

    if (!includeInactive) {
      query = query.eq('active', true);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch {
    return [];
  }
}

export async function createEmployee(employee: Omit<Employee, 'id' | 'created_at' | 'updated_at'>): Promise<Employee> {
  if (shouldProxyToServer()) return serverAction<Employee>('createEmployee', [employee]);
  const { data, error } = await supabase
    .from('employees')
    .insert(cleanEmptyStrings(employee))
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateEmployee(id: string, employee: Partial<Employee>): Promise<Employee> {
  if (shouldProxyToServer()) return serverAction<Employee>('updateEmployee', [id, employee]);
  const { data, error } = await supabase
    .from('employees')
    .update(cleanEmptyStrings({ ...employee, updated_at: new Date().toISOString() }))
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteEmployee(id: string): Promise<void> {
  if (shouldProxyToServer()) return serverAction<void>('deleteEmployee', [id]);
  const { error } = await supabase.from('employees').delete().eq('id', id);
  if (error) throw error;
}

// Поставщики
export async function getSuppliers(): Promise<Supplier[]> {
  if (shouldProxyToServer()) return serverAction<Supplier[]>('getSuppliers');
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch {
    return [];
  }
}

export async function createSupplier(supplier: Omit<Supplier, 'id' | 'created_at'>): Promise<Supplier> {
  if (shouldProxyToServer()) return serverAction<Supplier>('createSupplier', [supplier]);
  const { data, error } = await supabase
    .from('suppliers')
    .insert(supplier)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateSupplier(id: string, supplier: Partial<Supplier>): Promise<Supplier> {
  if (shouldProxyToServer()) return serverAction<Supplier>('updateSupplier', [id, supplier]);
  const { data, error } = await supabase
    .from('suppliers')
    .update(supplier)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSupplier(id: string): Promise<void> {
  if (shouldProxyToServer()) return serverAction<void>('deleteSupplier', [id]);
  const { error } = await supabase.from('suppliers').delete().eq('id', id);
  if (error) throw error;
}

// Рефереры (партнёры, приводящие клиентов)
export async function getReferrers(includeInactive = false): Promise<Referrer[]> {
  if (shouldProxyToServer()) return serverAction<Referrer[]>('getReferrers', [includeInactive]);
  try {
    let query = supabase
      .from('referrers')
      .select('*')
      .order('active', { ascending: false })
      .order('full_name', { ascending: true });

    if (!includeInactive) {
      query = query.eq('active', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Referrer[];
  } catch {
    return [];
  }
}

export async function createReferrer(referrer: ReferrerFormData): Promise<Referrer> {
  if (shouldProxyToServer()) return serverAction<Referrer>('createReferrer', [referrer]);
  const payload = cleanEmptyStrings({
    ...referrer,
    reward_fixed: money(Number(referrer.reward_fixed) || 0),
    reward_percent: Math.min(Math.max(Number(referrer.reward_percent) || 0, 0), 100),
  });
  const { data, error } = await supabase.from('referrers').insert(payload).select().single();
  if (error) throw error;
  return data as Referrer;
}

export async function updateReferrer(id: string, referrer: Partial<ReferrerFormData>): Promise<Referrer> {
  if (shouldProxyToServer()) return serverAction<Referrer>('updateReferrer', [id, referrer]);
  const payload: Record<string, unknown> = cleanEmptyStrings({ ...referrer });
  if (typeof referrer.reward_fixed === "number") payload.reward_fixed = money(referrer.reward_fixed);
  if (typeof referrer.reward_percent === "number") payload.reward_percent = Math.min(Math.max(referrer.reward_percent, 0), 100);
  const { data, error } = await supabase.from('referrers').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data as Referrer;
}

export async function deleteReferrer(id: string): Promise<void> {
  if (shouldProxyToServer()) return serverAction<void>('deleteReferrer', [id]);
  const { error } = await supabase.from('referrers').delete().eq('id', id);
  if (error) throw error;
}

// Склад запчастей
export async function getWarehouseParts(): Promise<WarehousePart[]> {
  if (shouldProxyToServer()) return serverAction<WarehousePart[]>('getWarehouseParts');
  try {
    const { data, error } = await supabase
      .from('warehouse_parts')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch {
    return [];
  }
}

export async function createWarehousePart(part: Omit<WarehousePart, 'id' | 'created_at' | 'updated_at'>): Promise<WarehousePart> {
  if (shouldProxyToServer()) return serverAction<WarehousePart>('createWarehousePart', [part]);
  const { data, error } = await supabase
    .from('warehouse_parts')
    .insert(cleanEmptyStrings(part))
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateWarehousePart(id: string, part: Partial<WarehousePart>): Promise<WarehousePart> {
  if (shouldProxyToServer()) return serverAction<WarehousePart>('updateWarehousePart', [id, part]);
  const { data, error } = await supabase
    .from('warehouse_parts')
    .update(cleanEmptyStrings(part))
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteWarehousePart(id: string): Promise<void> {
  if (shouldProxyToServer()) return serverAction<void>('deleteWarehousePart', [id]);
  const { error } = await supabase.from('warehouse_parts').delete().eq('id', id);
  if (error) throw error;
}

// Движения запчастей на складе
export async function getWarehouseMovements(partId?: string, limit = 200): Promise<WarehouseMovement[]> {
  if (shouldProxyToServer()) return serverAction<WarehouseMovement[]>('getWarehouseMovements', [partId, limit]);
  try {
    let query = supabase
      .from('warehouse_movements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (partId) {
      query = query.eq('warehouse_part_id', partId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch {
    return [];
  }
}

export async function createWarehouseMovement(movement: Omit<WarehouseMovement, 'id' | 'created_at'>): Promise<WarehouseMovement> {
  if (shouldProxyToServer()) return serverAction<WarehouseMovement>('createWarehouseMovement', [movement]);
  const { data, error } = await supabase
    .from('warehouse_movements')
    .insert(movement)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function logWarehouseMovement(
  partId: string,
  partName: string,
  partCode: string | null | undefined,
  partBrand: string | null | undefined,
  delta: number,
  quantityBefore: number,
  quantityAfter: number,
  movementType: WarehouseMovementType,
  context?: {
    orderId?: string;
    orderNumber?: string;
    clientName?: string;
    carInfo?: string;
    note?: string;
  }
) {
  try {
    await supabase.from('warehouse_movements').insert({
      warehouse_part_id: partId,
      part_name: partName,
      part_code: partCode || null,
      part_brand: partBrand || null,
      delta,
      quantity_before: quantityBefore,
      quantity_after: quantityAfter,
      movement_type: movementType,
      order_id: context?.orderId || null,
      order_number: context?.orderNumber || null,
      client_name: context?.clientName || null,
      car_info: context?.carInfo || null,
      note: context?.note || null,
    });
  } catch (err) {
    console.error('[warehouse] failed to log movement:', err);
  }
}

// Шаблоны работ
export async function getWorkTemplates(): Promise<WorkTemplate[]> {
  if (shouldProxyToServer()) return serverAction<WorkTemplate[]>('getWorkTemplates');
  try {
    const { data, error } = await supabase
      .from('work_templates')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch {
    return [];
  }
}

export async function createWorkTemplate(template: Omit<WorkTemplate, 'id' | 'created_at'>): Promise<WorkTemplate> {
  if (shouldProxyToServer()) return serverAction<WorkTemplate>('createWorkTemplate', [template]);
  const { data, error } = await supabase
    .from('work_templates')
    .insert(cleanEmptyStrings(template))
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateWorkTemplate(id: string, template: Partial<WorkTemplate>): Promise<WorkTemplate> {
  if (shouldProxyToServer()) return serverAction<WorkTemplate>('updateWorkTemplate', [id, template]);
  const { data, error } = await supabase
    .from('work_templates')
    .update(cleanEmptyStrings(template))
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteWorkTemplate(id: string): Promise<void> {
  if (shouldProxyToServer()) return serverAction<void>('deleteWorkTemplate', [id]);
  const { error } = await supabase.from('work_templates').delete().eq('id', id);
  if (error) throw error;
}

// Глобальный поиск
export async function globalSearch(query: string): Promise<{
  clients: ClientWithCars[];
  cars: Car[];
  orders: OrderWithDetails[];
  orderItems: (OrderItem & { order?: OrderWithDetails })[];
  warehouseParts: WarehousePart[];
  suppliers: Supplier[];
  employees: Employee[];
}> {
  if (shouldProxyToServer()) return serverAction('globalSearch', [query]);
  try {
    const term = normalizeSearchTerm(query);
    if (!term) return { clients: [], cars: [], orders: [], orderItems: [], warehouseParts: [], suppliers: [], employees: [] };

    const [
      clientNames,
      clientPhones,
      carPlates,
      carVins,
      carBrands,
      carModels,
      orderIds,
      orderClientNames,
      orderCarPlates,
      itemNames,
      itemCodes,
      warehouseNames,
      warehouseCodes,
      supplierNames,
      employeeNames,
      employeePhones,
    ] = await Promise.allSettled([
      supabase
        .from('clients')
        .select('*, cars(*)')
        .ilike('full_name', `%${term}%`)
        .limit(8),
      supabase
        .from('clients')
        .select('*, cars(*)')
        .ilike('phone', `%${term}%`)
        .limit(8),
      supabase
        .from('cars')
        .select('*')
        .ilike('license_plate', `%${term}%`)
        .limit(8),
      supabase
        .from('cars')
        .select('*')
        .ilike('vin', `%${term}%`)
        .limit(8),
      supabase
        .from('cars')
        .select('*')
        .ilike('brand', `%${term}%`)
        .limit(8),
      supabase
        .from('cars')
        .select('*')
        .ilike('model', `%${term}%`)
        .limit(8),
      supabase
        .from('orders')
        .select('*, client:clients(*), car:cars(*), items:order_items(*)')
        .ilike('id', `%${term}%`)
        .order('order_date', { ascending: false })
        .limit(8),
      supabase
        .from('orders')
        .select('*, client:clients!inner(*), car:cars(*), items:order_items(*)')
        .ilike('clients.full_name', `%${term}%`)
        .order('order_date', { ascending: false })
        .limit(8),
      supabase
        .from('orders')
        .select('*, client:clients(*), car:cars!inner(*), items:order_items(*)')
        .ilike('cars.license_plate', `%${term}%`)
        .order('order_date', { ascending: false })
        .limit(8),
      supabase
        .from('order_items')
        .select('*, order:orders(*, client:clients(*), car:cars(*), items:order_items(*))')
        .ilike('name', `%${term}%`)
        .limit(10),
      supabase
        .from('order_items')
        .select('*, order:orders(*, client:clients(*), car:cars(*), items:order_items(*))')
        .ilike('code', `%${term}%`)
        .limit(10),
      supabase
        .from('warehouse_parts')
        .select('*')
        .ilike('name', `%${term}%`)
        .limit(8),
      supabase
        .from('warehouse_parts')
        .select('*')
        .ilike('code', `%${term}%`)
        .limit(8),
      supabase
        .from('suppliers')
        .select('*')
        .ilike('name', `%${term}%`)
        .limit(8),
      supabase
        .from('employees')
        .select('*')
        .ilike('full_name', `%${term}%`)
        .limit(8),
      supabase
        .from('employees')
        .select('*')
        .ilike('phone', `%${term}%`)
        .limit(8),
    ]);

    return {
      clients: uniqueById([...settledData<ClientWithCars>(clientNames), ...settledData<ClientWithCars>(clientPhones)]).slice(0, 10),
      cars: uniqueById([...settledData<Car>(carPlates), ...settledData<Car>(carVins), ...settledData<Car>(carBrands), ...settledData<Car>(carModels)]).slice(0, 10),
      orders: uniqueById([...settledData<OrderWithDetails>(orderIds), ...settledData<OrderWithDetails>(orderClientNames), ...settledData<OrderWithDetails>(orderCarPlates)]).slice(0, 10),
      orderItems: uniqueById([...settledData<OrderItem & { order?: OrderWithDetails }>(itemNames), ...settledData<OrderItem & { order?: OrderWithDetails }>(itemCodes)]).slice(0, 12),
      warehouseParts: uniqueById([...settledData<WarehousePart>(warehouseNames), ...settledData<WarehousePart>(warehouseCodes)]).slice(0, 10),
      suppliers: uniqueById(settledData<Supplier>(supplierNames)).slice(0, 8),
      employees: uniqueById([...settledData<Employee>(employeeNames), ...settledData<Employee>(employeePhones)]).slice(0, 8),
    };
  } catch {
    return { clients: [], cars: [], orders: [], orderItems: [], warehouseParts: [], suppliers: [], employees: [] };
  }
}

function settledData<T>(result: PromiseSettledResult<{ data: T[] | null }>) {
  return result.status === 'fulfilled' ? result.value.data || [] : [];
}

function normalizeSearchTerm(query: string) {
  return query.trim().replace(/[%_\\]/g, "\\$&").slice(0, 80);
}

function uniqueById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function buildPaymentPayload(order: Partial<Order>, totalAmount: number, existingOrder?: Partial<Order>) {
  const hasIncomingEntries = Array.isArray(order.payment_entries);
  const rawEntries = hasIncomingEntries ? order.payment_entries : existingOrder?.payment_entries ?? [];
  const entries = normalizePaymentEntries(rawEntries ?? [], totalAmount);
  const rawPaid = entries.length > 0
    ? getPaidAmountFromEntries(entries)
    : hasIncomingEntries
      ? 0
      : order.paid_amount ?? existingOrder?.paid_amount ?? 0;
  const paid_amount = money(Math.min(Math.max(Number(rawPaid) || 0, 0), totalAmount));
  const debt_amount = getDebtAmount(totalAmount, paid_amount);
  const payment_status = getPaymentStatus(totalAmount, paid_amount);

  return {
    payment_method: getPaymentMethodFromEntries(entries, order.payment_method || existingOrder?.payment_method || 'cash'),
    payment_entries: entries,
    paid_amount,
    debt_amount,
    payment_status,
    debt_started_at: debt_amount > 0 ? order.debt_started_at || existingOrder?.debt_started_at || new Date().toISOString() : null,
  };
}

function normalizePaymentEntries(entries: PaymentEntry[] = [], totalAmount: number): PaymentEntry[] {
  let remaining = money(totalAmount);

  return entries
    .filter((entry) => money(entry.amount) > 0)
    .map((entry) => {
      const amount = money(Math.min(entry.amount, remaining));
      remaining = money(remaining - amount);

      return {
        id: entry.id || createId(),
        method: entry.method,
        amount,
        paid_at: entry.paid_at || new Date().toISOString().slice(0, 10),
        note: entry.note || '',
      };
    })
    .filter((entry) => entry.amount > 0);
}

function buildOrderItemPayload(
  orderId: string,
  item: Omit<OrderItem, 'id' | 'order_id' | 'created_at' | 'total_price'>
) {
  const totals = getItemTotals(item);
  const isPart = item.type === 'part';

  // Strip new columns if DB migration hasn't been applied yet
  return stripNewItemColumns(cleanEmptyStrings({
    type: item.type,
    mechanic_id: item.type === 'work' ? item.mechanic_id || null : null,
    mechanic_name: item.type === 'work' ? item.mechanic_name || null : null,
    source: isPart ? item.source || 'manual' : 'manual',
    warehouse_part_id: isPart && item.source === 'warehouse' ? item.warehouse_part_id || null : null,
    supplier_id: isPart ? item.supplier_id || null : null,
    supplier_name: isPart ? item.supplier_name || null : null,
    name: item.name,
    code: isPart ? item.code || null : null,
    brand: isPart ? item.brand || null : null,
    quantity: Number(item.quantity) || 0,
    selling_price: money(item.selling_price),
    cost_price: totals.costPrice,
    total_price: totals.totalPrice,
    cost_total: totals.costTotal,
    profit_amount: totals.profitAmount,
    supplier_discount_percent: isPart ? money(item.supplier_discount_percent) : 0,
    order_id: orderId,
  }));
}

function cleanEmptyStrings<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, item === '' ? null : item])
  ) as T;
}

async function updateCarMileageIfNewer(carId?: string | null, mileage?: number | null) {
  const nextMileage = Number(mileage) || 0;
  if (!carId || nextMileage <= 0) return;

  const currentCar = await getCarById(carId);
  const currentMileage = Number(currentCar?.mileage) || 0;
  if (nextMileage <= currentMileage) return;

  await supabase
    .from('cars')
    .update({ mileage: nextMileage })
    .eq('id', carId);
}

// Strip columns that were added by the CRM migration.
// This prevents PGRST204 errors when the DB schema hasn't been updated yet.
// Since the migration has been applied, these helpers return the payload as is.
function stripNewOrderColumns<T extends object>(payload: T): T {
  return payload;
}

function stripNewItemColumns<T extends object>(payload: T): T {
  return payload;
}

function collectWarehouseUsage(items: Array<Partial<OrderItem>>): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    if (item.type !== 'part' || !item.warehouse_part_id) return acc;
    acc[item.warehouse_part_id] = money((acc[item.warehouse_part_id] || 0) + (Number(item.quantity) || 0));
    return acc;
  }, {});
}

function getWarehouseDeltas(
  oldItems: Array<Partial<OrderItem>>,
  newItems: Array<Partial<OrderItem>>
): Record<string, number> {
  const oldUsage = collectWarehouseUsage(oldItems);
  const newUsage = collectWarehouseUsage(newItems);
  const ids = new Set([...Object.keys(oldUsage), ...Object.keys(newUsage)]);
  const deltas: Record<string, number> = {};

  ids.forEach((partId) => {
    deltas[partId] = money((oldUsage[partId] || 0) - (newUsage[partId] || 0));
  });

  return deltas;
}

async function validateWarehouseAvailability(
  oldItems: Array<Partial<OrderItem>>,
  newItems: Array<Partial<OrderItem>>
) {
  const deltas = getWarehouseDeltas(oldItems, newItems);

  for (const [partId, delta] of Object.entries(deltas)) {
    if (delta >= 0) continue;

    const { data, error } = await supabase
      .from('warehouse_parts')
      .select('quantity, name')
      .eq('id', partId)
      .single();

    if (error) {
      // Part may have been deleted from warehouse; skip validation if not needed
      continue;
    }
    const nextQuantity = money((Number(data?.quantity) || 0) + delta);
    if (nextQuantity < 0) {
      throw new Error(`Недостаточно на складе: ${data?.name || partId}`);
    }
  }
}

async function applyWarehouseDeltas(
  oldItems: Array<Partial<OrderItem>>,
  newItems: Array<Partial<OrderItem>>,
  orderContext?: {
    orderId?: string;
    orderNumber?: string;
    clientName?: string;
    carInfo?: string;
    note?: string;
  }
) {
  const deltas = getWarehouseDeltas(oldItems, newItems);

  for (const [partId, delta] of Object.entries(deltas)) {
    if (delta === 0) continue;

    const { data, error } = await supabase
      .from('warehouse_parts')
      .select('quantity, name, code, brand')
      .eq('id', partId)
      .single();

    if (error) {
      // Part may have been deleted; nothing to update
      continue;
    }

    const quantityBefore = Number(data?.quantity) || 0;
    const nextQuantity = money(Math.max(0, quantityBefore + delta));
    const { error: updateError } = await supabase
      .from('warehouse_parts')
      .update({ quantity: nextQuantity, updated_at: new Date().toISOString() })
      .eq('id', partId);

    if (updateError) throw updateError;

    const movementType: WarehouseMovementType = delta < 0 ? 'order_consume' : 'order_return';
    const clientName = orderContext?.clientName || 'Неизвестный клиент';
    const carInfo = orderContext?.carInfo || '';
    const orderNumber = orderContext?.orderNumber || '';
    const defaultNote = delta < 0
      ? `Списание по заказу #${orderNumber} — ${clientName}${carInfo ? `, ${carInfo}` : ''}`
      : `Возврат из заказа #${orderNumber} — ${clientName}${carInfo ? `, ${carInfo}` : ''}`;

    await logWarehouseMovement(
      partId,
      data?.name || '',
      data?.code,
      data?.brand,
      delta,
      quantityBefore,
      nextQuantity,
      movementType,
      {
        ...orderContext,
        clientName,
        carInfo,
        note: orderContext?.note || defaultNote,
      }
    );
  }
}

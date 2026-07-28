CREATE TABLE warehouse_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_part_id UUID NOT NULL,
    part_name TEXT NOT NULL,
    part_code TEXT,
    part_brand TEXT,
    delta DECIMAL(12,2) NOT NULL,
    quantity_before DECIMAL(12,2) NOT NULL DEFAULT 0,
    quantity_after DECIMAL(12,2) NOT NULL DEFAULT 0,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('order_consume', 'order_return', 'manual_add', 'manual_remove', 'manual_adjust', 'initial')),
    order_id UUID,
    order_number TEXT,
    client_name TEXT,
    car_info TEXT,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_warehouse_movements_part_id ON warehouse_movements(warehouse_part_id);
CREATE INDEX idx_warehouse_movements_order_id ON warehouse_movements(order_id);
CREATE INDEX idx_warehouse_movements_created_at ON warehouse_movements(created_at);
CREATE INDEX idx_warehouse_movements_movement_type ON warehouse_movements(movement_type);

ALTER TABLE warehouse_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON warehouse_movements FOR ALL USING (true) WITH CHECK (true);

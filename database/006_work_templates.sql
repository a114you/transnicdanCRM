CREATE TABLE work_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    default_price DECIMAL(12,2) DEFAULT 0,
    category TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_work_templates_name ON work_templates(name);

ALTER TABLE work_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON work_templates FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE work_templates ADD COLUMN code TEXT;
CREATE INDEX idx_work_templates_code ON work_templates(code);

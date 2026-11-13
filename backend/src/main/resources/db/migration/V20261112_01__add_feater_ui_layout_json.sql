-- Persist per-user customizable UI layout and button placement preferences.
ALTER TABLE feater ADD COLUMN IF NOT EXISTS ui_layout_json LONGTEXT NULL;

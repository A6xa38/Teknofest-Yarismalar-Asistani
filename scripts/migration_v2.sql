-- v2: itiraz formuna takım ID / başvuru ID alanları eklendi
ALTER TABLE tickets ADD COLUMN team_id TEXT;
ALTER TABLE tickets ADD COLUMN application_id TEXT;

-- Add thumbnail_url and speaker to broadcasts
ALTER TABLE broadcasts ADD COLUMN thumbnail_url TEXT;
ALTER TABLE broadcasts ADD COLUMN speaker TEXT;

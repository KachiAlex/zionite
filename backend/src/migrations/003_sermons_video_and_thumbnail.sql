-- Add video_url and thumbnail_url to sermons
ALTER TABLE sermons ADD COLUMN video_url TEXT;
ALTER TABLE sermons ADD COLUMN thumbnail_url TEXT;

-- V1.8.2: Add EXIF metadata JSONB column to photos table
ALTER TABLE photos ADD COLUMN exif_data JSONB;

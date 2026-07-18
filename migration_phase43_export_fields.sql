-- Migration: Add export columns to profiles
-- Description: Stores user preferences for the Custom Excel export feature.

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS export_columns JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS export_include_items BOOLEAN DEFAULT true;

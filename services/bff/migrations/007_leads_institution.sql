-- Add institution column to tbl_leads (optional; links to HCO).
ALTER TABLE tbl_leads ADD COLUMN IF NOT EXISTS institution TEXT;

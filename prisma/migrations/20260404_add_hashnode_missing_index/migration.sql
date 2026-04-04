-- Add missing index on HashnodeExport.projectId declared in schema but omitted
-- from the 20260403_replace_medium_with_hashnode migration. Safe to run multiple
-- times — CREATE INDEX IF NOT EXISTS is a no-op when the index already exists.
CREATE INDEX IF NOT EXISTS "HashnodeExport_projectId_idx" ON "HashnodeExport"("projectId");

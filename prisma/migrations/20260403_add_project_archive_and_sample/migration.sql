-- Add archivedAt column to Project (nullable timestamp for soft-delete)
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- Add isSample column to Project (boolean flag for sample/demo projects)
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "isSample" BOOLEAN NOT NULL DEFAULT false;

-- Add archivedAt column to Project (nullable timestamp for soft-delete)
ALTER TABLE "Project" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- Add isSample column to Project (boolean flag for sample/demo projects)
ALTER TABLE "Project" ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false;

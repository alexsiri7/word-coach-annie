-- AlterTable
ALTER TABLE "WritingTask" ALTER COLUMN "projectId" DROP NOT NULL,
ADD COLUMN     "userId" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'Draft',
ADD COLUMN     "capacity" TEXT NOT NULL DEFAULT 'Full',
ADD COLUMN     "dueDate" TIMESTAMP(3);

-- Backfill: a project task is owned by its project's owner
UPDATE "WritingTask" t SET "userId" = p."userId" FROM "Project" p WHERE t."projectId" = p."id";

-- CreateIndex
CREATE INDEX "WritingTask_userId_completed_idx" ON "WritingTask"("userId", "completed");

-- AddForeignKey
ALTER TABLE "WritingTask" ADD CONSTRAINT "WritingTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "WritingTask" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sceneId" TEXT,
    "name" TEXT NOT NULL,
    "whatIsNeeded" TEXT NOT NULL DEFAULT '',
    "importance" TEXT NOT NULL DEFAULT 'Medium',
    "size" TEXT NOT NULL DEFAULT 'Medium',
    "energy" TEXT NOT NULL DEFAULT 'Technical',
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WritingTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WritingTask_projectId_idx" ON "WritingTask"("projectId");

-- CreateIndex
CREATE INDEX "WritingTask_sceneId_idx" ON "WritingTask"("sceneId");

-- CreateIndex
CREATE INDEX "WritingTask_projectId_completed_idx" ON "WritingTask"("projectId", "completed");

-- AddForeignKey
ALTER TABLE "WritingTask" ADD CONSTRAINT "WritingTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingTask" ADD CONSTRAINT "WritingTask_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "StructureNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

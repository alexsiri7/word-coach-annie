-- CreateTable
CREATE TABLE "WritingSession" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "nodeId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "wordsWritten" INTEGER NOT NULL DEFAULT 0,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "date" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "WritingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WritingSession_projectId_date_idx" ON "WritingSession"("projectId", "date");

-- CreateIndex
CREATE INDEX "WritingSession_date_idx" ON "WritingSession"("date");

-- AddForeignKey
ALTER TABLE "WritingSession" ADD CONSTRAINT "WritingSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingSession" ADD CONSTRAINT "WritingSession_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "StructureNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;


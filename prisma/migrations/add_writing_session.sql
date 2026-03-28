-- Add WritingSession model for writing momentum tracking
-- an-29e: UX Phase 4 - Writing Momentum

CREATE TABLE IF NOT EXISTS "WritingSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "nodeId" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "wordsWritten" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "WritingSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE,
    CONSTRAINT "WritingSession_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "StructureNode" ("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "WritingSession_projectId_startedAt_idx" ON "WritingSession"("projectId", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "WritingSession_nodeId_idx" ON "WritingSession"("nodeId");

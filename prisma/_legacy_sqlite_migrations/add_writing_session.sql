CREATE TABLE IF NOT EXISTS "WritingSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "nodeId" TEXT,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" DATETIME,
  "wordsWritten" INTEGER NOT NULL DEFAULT 0,
  "durationSeconds" INTEGER NOT NULL DEFAULT 0,
  "date" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "WritingSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WritingSession_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "StructureNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "WritingSession_projectId_date_idx" ON "WritingSession"("projectId", "date");
CREATE INDEX IF NOT EXISTS "WritingSession_date_idx" ON "WritingSession"("date");

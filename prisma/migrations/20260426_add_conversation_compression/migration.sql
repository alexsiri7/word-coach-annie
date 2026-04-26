-- Create Conversation table
CREATE TABLE "Conversation" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'New chat',
  "summary" TEXT,
  "summarizedThroughMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Conversation_projectId_createdAt_idx" ON "Conversation"("projectId", "createdAt");

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- For each distinct projectId in ChatMessage, create a default Conversation
INSERT INTO "Conversation" ("id", "projectId", "title", "updatedAt")
SELECT gen_random_uuid()::text, sub."projectId", 'Chat', NOW()
FROM (SELECT DISTINCT "projectId" FROM "ChatMessage") sub;

-- Add conversationId to ChatMessage (nullable first for data migration)
ALTER TABLE "ChatMessage" ADD COLUMN "conversationId" TEXT;

-- Populate conversationId from the default conversation per project
UPDATE "ChatMessage" cm
SET "conversationId" = c."id"
FROM "Conversation" c
WHERE c."projectId" = cm."projectId";

-- Make conversationId NOT NULL now that it's populated
ALTER TABLE "ChatMessage" ALTER COLUMN "conversationId" SET NOT NULL;

-- Drop the old index and projectId FK
DROP INDEX "ChatMessage_projectId_createdAt_idx";
ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_projectId_fkey";
ALTER TABLE "ChatMessage" DROP COLUMN "projectId";

-- Add new index and FK
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add compression settings to UserAiSettings
ALTER TABLE "UserAiSettings" ADD COLUMN "chatWindowSize" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "UserAiSettings" ADD COLUMN "messagesUntilCompression" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "UserAiSettings" ADD COLUMN "compressionModel" TEXT NOT NULL DEFAULT '';

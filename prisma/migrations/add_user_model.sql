-- Add User model for Google Login authentication
-- an-3e2: Add userId foreign key to Project and Universe

CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "googleId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "picture" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId");

-- Add userId to Project (nullable for backwards compatibility)
ALTER TABLE "Project" ADD COLUMN "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "Project_userId_idx" ON "Project"("userId");

-- Add userId to Universe (nullable for backwards compatibility)
ALTER TABLE "Universe" ADD COLUMN "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "Universe_userId_idx" ON "Universe"("userId");

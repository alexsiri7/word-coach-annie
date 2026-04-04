-- Rename MediumCredential to HashnodeCredential
-- SQLite-compatible: recreate tables with new names, migrate data

-- Step 1: Create new HashnodeCredential table
CREATE TABLE "HashnodeCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL DEFAULT '',
    "username" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HashnodeCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HashnodeCredential_userId_key" ON "HashnodeCredential"("userId");

-- Step 2: Create new HashnodeExport table
CREATE TABLE "HashnodeExport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "nodeId" TEXT,
    "hashnodePostId" TEXT NOT NULL,
    "hashnodePostUrl" TEXT NOT NULL,
    "publishStatus" TEXT NOT NULL DEFAULT 'draft',
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "credentialId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HashnodeExport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HashnodeExport_projectId_nodeId_credentialId_key" ON "HashnodeExport"("projectId", "nodeId", "credentialId");
CREATE INDEX "HashnodeExport_projectId_idx" ON "HashnodeExport"("projectId");

-- AddForeignKey: HashnodeExport -> Project
ALTER TABLE "HashnodeExport" ADD CONSTRAINT "HashnodeExport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: HashnodeExport -> HashnodeCredential
ALTER TABLE "HashnodeExport" ADD CONSTRAINT "HashnodeExport_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "HashnodeCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 3: Drop old tables (no data migration needed — Medium tokens are unusable for Hashnode)
DROP TABLE IF EXISTS "MediumExport";
DROP TABLE IF EXISTS "MediumCredential";

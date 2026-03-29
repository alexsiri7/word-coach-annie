-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Annotation" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "range" TEXT NOT NULL DEFAULT '',
    "selectedText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Annotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentVersion" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "googleId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "picture" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "universeId" TEXT,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL DEFAULT '',
    "synopsis" TEXT NOT NULL DEFAULT '',
    "genre" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectType" TEXT NOT NULL DEFAULT 'FICTION',

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relationship" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "fromNodeId" TEXT,
    "fromObjectId" TEXT,
    "fromWorldObjectId" TEXT,
    "toNodeId" TEXT,
    "toObjectId" TEXT,
    "toWorldObjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryObject" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "role" TEXT,
    "tags" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StructureNode" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "synopsis" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'OUTLINE',
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StructureNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Universe" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Universe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldObject" (
    "id" TEXT NOT NULL,
    "universeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldObjectTimelineEntry" (
    "id" TEXT NOT NULL,
    "worldObjectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "attributes" TEXT NOT NULL DEFAULT '',
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldObjectTimelineEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleCredential" (
    "id" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "baseUrl" TEXT NOT NULL DEFAULT '',
    "apiKey" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAiSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL DEFAULT '',
    "apiKey" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAiSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleDocExport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "universeId" TEXT,
    "exportMode" TEXT NOT NULL,
    "googleDocId" TEXT NOT NULL,
    "googleDocUrl" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleDocExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Annotation_nodeId_idx" ON "Annotation"("nodeId");

-- CreateIndex
CREATE INDEX "ContentVersion_nodeId_createdAt_idx" ON "ContentVersion"("nodeId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE INDEX "Relationship_toObjectId_idx" ON "Relationship"("toObjectId");

-- CreateIndex
CREATE INDEX "Relationship_toNodeId_idx" ON "Relationship"("toNodeId");

-- CreateIndex
CREATE INDEX "Relationship_toWorldObjectId_idx" ON "Relationship"("toWorldObjectId");

-- CreateIndex
CREATE INDEX "Relationship_fromObjectId_idx" ON "Relationship"("fromObjectId");

-- CreateIndex
CREATE INDEX "Relationship_fromNodeId_idx" ON "Relationship"("fromNodeId");

-- CreateIndex
CREATE INDEX "Relationship_fromWorldObjectId_idx" ON "Relationship"("fromWorldObjectId");

-- CreateIndex
CREATE INDEX "StoryObject_projectId_type_idx" ON "StoryObject"("projectId", "type");

-- CreateIndex
CREATE INDEX "StructureNode_parentId_orderIndex_idx" ON "StructureNode"("parentId", "orderIndex");

-- CreateIndex
CREATE INDEX "StructureNode_projectId_idx" ON "StructureNode"("projectId");

-- CreateIndex
CREATE INDEX "Universe_userId_idx" ON "Universe"("userId");

-- CreateIndex
CREATE INDEX "WorldObject_universeId_type_idx" ON "WorldObject"("universeId", "type");

-- CreateIndex
CREATE INDEX "WorldObjectTimelineEntry_worldObjectId_orderIndex_idx" ON "WorldObjectTimelineEntry"("worldObjectId", "orderIndex");

-- CreateIndex
CREATE INDEX "ChatMessage_projectId_createdAt_idx" ON "ChatMessage"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserAiSettings_userId_key" ON "UserAiSettings"("userId");

-- CreateIndex
CREATE INDEX "GoogleDocExport_projectId_idx" ON "GoogleDocExport"("projectId");

-- CreateIndex
CREATE INDEX "GoogleDocExport_universeId_idx" ON "GoogleDocExport"("universeId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleDocExport_projectId_universeId_exportMode_key" ON "GoogleDocExport"("projectId", "universeId", "exportMode");

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "StructureNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentVersion" ADD CONSTRAINT "ContentVersion_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "StructureNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_universeId_fkey" FOREIGN KEY ("universeId") REFERENCES "Universe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_toObjectId_fkey" FOREIGN KEY ("toObjectId") REFERENCES "StoryObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "StructureNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_toWorldObjectId_fkey" FOREIGN KEY ("toWorldObjectId") REFERENCES "WorldObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_fromObjectId_fkey" FOREIGN KEY ("fromObjectId") REFERENCES "StoryObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "StructureNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_fromWorldObjectId_fkey" FOREIGN KEY ("fromWorldObjectId") REFERENCES "WorldObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryObject" ADD CONSTRAINT "StoryObject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StructureNode" ADD CONSTRAINT "StructureNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StructureNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StructureNode" ADD CONSTRAINT "StructureNode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Universe" ADD CONSTRAINT "Universe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldObject" ADD CONSTRAINT "WorldObject_universeId_fkey" FOREIGN KEY ("universeId") REFERENCES "Universe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldObjectTimelineEntry" ADD CONSTRAINT "WorldObjectTimelineEntry_worldObjectId_fkey" FOREIGN KEY ("worldObjectId") REFERENCES "WorldObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAiSettings" ADD CONSTRAINT "UserAiSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleDocExport" ADD CONSTRAINT "GoogleDocExport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleDocExport" ADD CONSTRAINT "GoogleDocExport_universeId_fkey" FOREIGN KEY ("universeId") REFERENCES "Universe"("id") ON DELETE SET NULL ON UPDATE CASCADE;


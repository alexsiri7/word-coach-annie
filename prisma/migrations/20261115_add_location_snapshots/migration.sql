-- CreateTable
CREATE TABLE "LocationSnapshot" (
    "id" TEXT NOT NULL,
    "storyObjectId" TEXT NOT NULL,
    "build" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "things" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnapshotAnnotation" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "kind" TEXT NOT NULL,
    "thingKey" TEXT,
    "region" JSONB,
    "text" TEXT NOT NULL,
    "storyObjectId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SnapshotAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocationSnapshot_storyObjectId_createdAt_idx" ON "LocationSnapshot"("storyObjectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SnapshotAnnotation_locationId_status_idx" ON "SnapshotAnnotation"("locationId", "status");

-- CreateIndex
CREATE INDEX "SnapshotAnnotation_snapshotId_idx" ON "SnapshotAnnotation"("snapshotId");

-- CreateIndex
CREATE INDEX "SnapshotAnnotation_storyObjectId_idx" ON "SnapshotAnnotation"("storyObjectId");

-- AddForeignKey
ALTER TABLE "LocationSnapshot" ADD CONSTRAINT "LocationSnapshot_storyObjectId_fkey" FOREIGN KEY ("storyObjectId") REFERENCES "StoryObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnapshotAnnotation" ADD CONSTRAINT "SnapshotAnnotation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StoryObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnapshotAnnotation" ADD CONSTRAINT "SnapshotAnnotation_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "LocationSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnapshotAnnotation" ADD CONSTRAINT "SnapshotAnnotation_storyObjectId_fkey" FOREIGN KEY ("storyObjectId") REFERENCES "StoryObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

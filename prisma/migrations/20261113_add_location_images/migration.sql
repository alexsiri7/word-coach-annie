-- CreateTable
CREATE TABLE "LocationImage" (
    "id" TEXT NOT NULL,
    "storyObjectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'reference',
    "caption" TEXT NOT NULL DEFAULT '',
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "storagePath" TEXT NOT NULL,
    "thumbPath" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocationImage_storyObjectId_orderIndex_idx" ON "LocationImage"("storyObjectId", "orderIndex");

-- AddForeignKey
ALTER TABLE "LocationImage" ADD CONSTRAINT "LocationImage_storyObjectId_fkey" FOREIGN KEY ("storyObjectId") REFERENCES "StoryObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

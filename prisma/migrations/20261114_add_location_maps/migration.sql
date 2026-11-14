-- CreateTable
CREATE TABLE "LocationMap" (
    "id" TEXT NOT NULL,
    "storyObjectId" TEXT NOT NULL,
    "widthM" DOUBLE PRECISION NOT NULL,
    "heightM" DOUBLE PRECISION NOT NULL,
    "backgroundImageId" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LocationMap_storyObjectId_key" ON "LocationMap"("storyObjectId");

-- CreateIndex
CREATE INDEX "LocationMap_backgroundImageId_idx" ON "LocationMap"("backgroundImageId");

-- AddForeignKey
ALTER TABLE "LocationMap" ADD CONSTRAINT "LocationMap_storyObjectId_fkey" FOREIGN KEY ("storyObjectId") REFERENCES "StoryObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationMap" ADD CONSTRAINT "LocationMap_backgroundImageId_fkey" FOREIGN KEY ("backgroundImageId") REFERENCES "LocationImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add externalId to Annotation for tracking imported Google Docs comment IDs
ALTER TABLE "Annotation" ADD COLUMN "externalId" TEXT;
CREATE UNIQUE INDEX "Annotation_externalId_key" ON "Annotation"("externalId") WHERE "externalId" IS NOT NULL;

-- Add lastCommentSyncAt to GoogleDocExport for tracking last comment sync time
ALTER TABLE "GoogleDocExport" ADD COLUMN "lastCommentSyncAt" TIMESTAMP(3);

-- Add userId to GoogleCredential for per-user credential isolation.
-- Existing rows (if any) are assigned to 'local' (single-user default),
-- matching the HashnodeCredential convention used elsewhere in this codebase.

ALTER TABLE "GoogleCredential" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'local';

CREATE UNIQUE INDEX "GoogleCredential_userId_key" ON "GoogleCredential"("userId");

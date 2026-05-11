-- AlterTable (idempotent — safe to re-apply)
ALTER TABLE "OAuthClient" ADD COLUMN IF NOT EXISTS "registrationIp" TEXT;
ALTER TABLE "OAuthClient" ADD COLUMN IF NOT EXISTS "registrationUserId" TEXT;

-- CreateIndex (idempotent — safe to re-apply)
CREATE INDEX IF NOT EXISTS "OAuthClient_registrationIp_createdAt_idx" ON "OAuthClient"("registrationIp", "createdAt");

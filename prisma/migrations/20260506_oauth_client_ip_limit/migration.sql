-- AlterTable
ALTER TABLE "OAuthClient" ADD COLUMN "registrationIp" TEXT;
ALTER TABLE "OAuthClient" ADD COLUMN "registrationUserId" TEXT;

-- CreateIndex
CREATE INDEX "OAuthClient_registrationIp_createdAt_idx" ON "OAuthClient"("registrationIp", "createdAt");

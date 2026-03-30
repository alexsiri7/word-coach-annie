-- CreateTable
CREATE TABLE "OAuthClient" (
    "id" TEXT NOT NULL,
    "clientName" TEXT NOT NULL DEFAULT '',
    "redirectUris" TEXT NOT NULL,
    "grantTypes" TEXT NOT NULL DEFAULT '["authorization_code","refresh_token"]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthClient_pkey" PRIMARY KEY ("id")
);

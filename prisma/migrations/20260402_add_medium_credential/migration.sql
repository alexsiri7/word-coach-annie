-- CreateTable: MediumCredential for Medium integration token storage
CREATE TABLE "MediumCredential" (
    "id" TEXT NOT NULL,
    "integrationToken" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MediumCredential_pkey" PRIMARY KEY ("id")
);

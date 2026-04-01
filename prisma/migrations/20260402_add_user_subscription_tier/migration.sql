-- Add subscription tier and per-user project limit to User table
ALTER TABLE "User" ADD COLUMN "subscriptionTier" TEXT NOT NULL DEFAULT 'FREE';
ALTER TABLE "User" ADD COLUMN "maxProjects" INTEGER NOT NULL DEFAULT 3;

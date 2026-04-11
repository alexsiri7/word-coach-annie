-- Add projectLimit column to User table (free tier defaults to 3 active projects)
ALTER TABLE "User" ADD COLUMN "projectLimit" INTEGER NOT NULL DEFAULT 3;

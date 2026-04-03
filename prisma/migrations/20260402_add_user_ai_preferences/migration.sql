-- AlterTable: Add per-user AI behavior preferences
ALTER TABLE "UserAiSettings" ADD COLUMN "customInstructions" TEXT NOT NULL DEFAULT '';
ALTER TABLE "UserAiSettings" ADD COLUMN "coachingStyle" TEXT NOT NULL DEFAULT 'balanced';
ALTER TABLE "UserAiSettings" ADD COLUMN "responseLength" TEXT NOT NULL DEFAULT 'moderate';

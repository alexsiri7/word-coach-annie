-- Change Project.userId and Universe.userId FK from SET NULL to CASCADE
-- This ensures all user-owned data is deleted when a User is deleted (GDPR Article 17)

-- Project
ALTER TABLE "Project" DROP CONSTRAINT "Project_userId_fkey";
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Universe
ALTER TABLE "Universe" DROP CONSTRAINT "Universe_userId_fkey";
ALTER TABLE "Universe" ADD CONSTRAINT "Universe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Add ON DELETE CASCADE to Project.userId -> User.id
ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_userId_fkey";
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Add ON DELETE CASCADE to Universe.userId -> User.id
ALTER TABLE "Universe" DROP CONSTRAINT IF EXISTS "Universe_userId_fkey";
ALTER TABLE "Universe" ADD CONSTRAINT "Universe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

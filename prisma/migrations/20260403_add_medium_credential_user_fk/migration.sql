-- AddForeignKey: MediumCredential -> User
ALTER TABLE "MediumCredential" ADD CONSTRAINT "MediumCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

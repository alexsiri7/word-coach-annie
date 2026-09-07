-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "providerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "closeDate" TIMESTAMP(3) NOT NULL,
    "reviewDate" TIMESTAMP(3),
    "rulesUrl" TEXT,
    "entryFee" TEXT,
    "wordLimit" INTEGER,
    "lineLimit" INTEGER,
    "genreRestrictions" TEXT,
    "eligibilityNotes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'found',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityCandidate" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'candidate',
    "notes" TEXT,
    "submissionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpportunityCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Opportunity_userId_idx" ON "Opportunity"("userId");

-- CreateIndex
CREATE INDEX "Opportunity_providerId_idx" ON "Opportunity"("providerId");

-- CreateIndex
CREATE INDEX "OpportunityCandidate_projectId_idx" ON "OpportunityCandidate"("projectId");

-- CreateIndex
CREATE INDEX "OpportunityCandidate_submissionId_idx" ON "OpportunityCandidate"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityCandidate_opportunityId_projectId_key" ON "OpportunityCandidate"("opportunityId", "projectId");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityCandidate" ADD CONSTRAINT "OpportunityCandidate_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityCandidate" ADD CONSTRAINT "OpportunityCandidate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityCandidate" ADD CONSTRAINT "OpportunityCandidate_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ContestSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

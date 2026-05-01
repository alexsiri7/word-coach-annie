-- Create PeerReview table
CREATE TABLE "PeerReview" (
  "id"        TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "publisher" JSONB NOT NULL,
  "reader"    JSONB NOT NULL,
  "writer"    JSONB NOT NULL,
  "consensus" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PeerReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PeerReview_projectId_createdAt_idx"
  ON "PeerReview"("projectId", "createdAt" DESC);

ALTER TABLE "PeerReview" ADD CONSTRAINT "PeerReview_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

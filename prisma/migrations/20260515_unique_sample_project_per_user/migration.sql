-- Deduplication: remove extra sample projects per user, keeping the oldest one
DELETE FROM "Project"
WHERE "isSample" = true
  AND id NOT IN (
    SELECT MIN(id) FROM "Project" WHERE "isSample" = true GROUP BY "userId"
  );

-- Add partial unique index to prevent duplicate sample projects per user
CREATE UNIQUE INDEX "unique_sample_project_per_user"
  ON "Project" ("userId")
  WHERE "isSample" = true AND "userId" IS NOT NULL;

-- Backfill legacy NULL userId — assign unowned projects/universes to admin
-- an-82p: Critical for multi-tenant data separation
--
-- Assigns all projects and universes with NULL userId to the earliest-created
-- user (admin). If no users exist yet, these are no-ops (subquery returns NULL).

UPDATE "Project"
SET "userId" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "userId" IS NULL;

UPDATE "Universe"
SET "userId" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "userId" IS NULL;

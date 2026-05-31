-- DropIndex
-- The unique constraint on jti already creates a B-tree index (RevokedToken_jti_key).
-- The non-unique @@index([jti]) was redundant and added unnecessary write overhead.
DROP INDEX "RevokedToken_jti_idx";

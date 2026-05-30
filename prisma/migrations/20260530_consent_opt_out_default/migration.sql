-- Change consentGiven default from true to false (GDPR Article 7 — opt-in, not opt-out)
-- Existing rows are unaffected; only new rows without an explicit value will default to false.
ALTER TABLE "UserConsent" ALTER COLUMN "consentGiven" SET DEFAULT false;

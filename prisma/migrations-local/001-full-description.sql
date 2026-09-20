-- Adds the pasted full advert text to Job.
--
-- Job boards return a 500-character extract (see docs/adzuna.md), which caps
-- the quality of every analysis and match score built from it. This lets a
-- user paste the real advert in from the original posting.
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "fullDescription" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "fullDescriptionAddedAt" TIMESTAMP(3);
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "fullDescriptionAddedBy" TEXT;

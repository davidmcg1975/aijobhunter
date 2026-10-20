-- Jobs a user added by hand from an advert they found elsewhere. Private to
-- them; null means shared reference data, as every provider job is.
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "addedByUserId" TEXT;
CREATE INDEX IF NOT EXISTS "Job_addedByUserId_idx" ON "Job"("addedByUserId");

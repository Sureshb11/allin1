-- Ball intelligence: loft as an attribute, and ranking feedback.
--
-- All three are nullable and additive, so this is safe to apply to a live
-- database ahead of the code that reads them: existing rows keep working and
-- every new column reads as "not recorded" until something writes it.
ALTER TABLE "BallIntelligence" ADD COLUMN "lofted" BOOLEAN;
ALTER TABLE "BallIntelligence" ADD COLUMN "selectedShotRank" INTEGER;
ALTER TABLE "BallIntelligence" ADD COLUMN "rankingEngineVersion" INTEGER;

-- A written line for the handful of deliveries worth a model call.
--
-- One nullable column on a table this feature owns. Stored rather than generated
-- on read because a spectator's screen refetches every six seconds, and calling
-- a model on each of those is precisely what this feature is designed not to do.
-- Null for almost every ball; those get a template line composed on read.
ALTER TABLE "BallIntelligence" ADD COLUMN     "aiCommentary" TEXT;

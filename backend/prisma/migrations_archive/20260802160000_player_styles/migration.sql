-- How a player bats and bowls, and a per-match vice-captain.
--
-- battingStyle / bowlingStyle: the Edit Player screen has asked for both since
-- it was written and never sent either, because there was nowhere to store
-- them. Nullable — every existing player has said nothing.
--
-- MatchPlayer.isViceCaptain: captain and keeper were already recorded per
-- match; vice-captain was not, so the trio could only be completed from the
-- player's standing record. All three belong to the match.
ALTER TABLE "Player" ADD COLUMN "battingStyle" TEXT;
ALTER TABLE "Player" ADD COLUMN "bowlingStyle" TEXT;
ALTER TABLE "MatchPlayer" ADD COLUMN "isViceCaptain" BOOLEAN NOT NULL DEFAULT false;

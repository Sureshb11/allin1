-- How hard the dropped chance was: 'easy' | 'difficult'.
--
-- Recorded alongside droppedBy because "dropped" alone tells a spectator
-- nothing — a shelled dolly and a diving fingertip chance are different events,
-- and the commentary should say which.
ALTER TABLE "Ball" ADD COLUMN "dropDifficulty" TEXT;

-- Who dropped a catch off this delivery.
--
-- Not a wicket and not part of CricHeroes' MVP algorithm, which only scores
-- wickets taken. A dropped catch is a real event in a real match and there was
-- nowhere to put it; this is the record, not a points change.
ALTER TABLE "Ball" ADD COLUMN "droppedBy" TEXT;

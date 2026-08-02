-- Whether a run out was a direct hit.
--
-- CricHeroes' MVP algorithm gives a run-out fielder full points for the wicket
-- "if it is a direct hit". Nothing in this schema recorded it, so every run out
-- was paid as though it were one.
--
-- Nullable: null means "not recorded", which every existing ball is, and is
-- deliberately distinct from false. Scoring treats null as it always has.
ALTER TABLE "Ball" ADD COLUMN "directHit" BOOLEAN;

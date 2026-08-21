-- Everything the Create Tournament screen collects.
--
-- The screen asked for a logo and a banner from the day it was written. There
-- were no columns for them and the create route's zod schema didn't list them,
-- so zod stripped both keys and the upload was thrown away on save. Those two
-- columns are a bug fix, not a feature.
--
-- The rest is configuration, and it is grouped rather than flattened
-- (docs/TOURNAMENT_DESIGN.md §1.4). Forty boolean columns would mean a
-- migration per rule and nowhere to keep a rule's value. Each Json block below
-- sits on the boundary the design doc gives to a future table, so promoting one
-- is a data move.
--
-- Every column is nullable and additive: safe to apply while the API is
-- serving, and old rows keep working with all of them null.

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "shortName" TEXT,
                         ADD COLUMN     "category" TEXT,
                         ADD COLUMN     "city" TEXT,
                         ADD COLUMN     "logoUrl" TEXT,
                         ADD COLUMN     "banner" TEXT,
                         ADD COLUMN     "contact" JSONB,
                         ADD COLUMN     "location" JSONB,
                         ADD COLUMN     "regWindow" JSONB,
                         ADD COLUMN     "registration" JSONB,
                         ADD COLUMN     "rules" JSONB,
                         ADD COLUMN     "pointsRules" JSONB,
                         ADD COLUMN     "prizes" JSONB,
                         ADD COLUMN     "flags" JSONB;

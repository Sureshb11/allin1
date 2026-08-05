-- Team gains a short code and a website.
--
-- Both nullable and additive: every existing row keeps working untouched, and
-- nothing reads them until a team fills them in. Written by hand rather than by
-- `migrate dev` because there is no shadow database here — the only Postgres is
-- production (CLAUDE.md), so this is applied with `migrate deploy`.
ALTER TABLE "Team" ADD COLUMN "shortName" TEXT;
ALTER TABLE "Team" ADD COLUMN "website" TEXT;

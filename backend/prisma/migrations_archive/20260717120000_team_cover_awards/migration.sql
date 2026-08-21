-- Team profile enhancement: a cover/banner photo (distinct from the logo) and a
-- structured list of awards the team admin can add. Both are additive/nullable,
-- so existing rows are untouched. Images live in Vercel Blob; only their URLs
-- are stored here.

-- AlterTable
ALTER TABLE "Team" ADD COLUMN "coverUrl" TEXT;
ALTER TABLE "Team" ADD COLUMN "awards" JSONB;

-- Team admins: a member (Player linked to a user) can be promoted to admin by
-- the team owner/another admin, giving them the same management rights (logo,
-- cover, members, awards, gallery). The owner is always an admin implicitly.

-- AlterTable
ALTER TABLE "Player" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;

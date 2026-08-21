-- Who created each match. scorerId is transferable, so once scoring is handed
-- over it stops telling you who made the match; createdBy is set once at
-- creation and never changes.

-- AlterTable
ALTER TABLE "Match" ADD COLUMN "createdBy" TEXT;

-- CreateIndex
CREATE INDEX "Match_createdBy_idx" ON "Match"("createdBy");

-- Backfill existing rows: scorerId defaults to the creator, so for matches whose
-- scoring was never transferred this is exact. (Any that WERE transferred will
-- name the current scorer instead — the best signal available, since creation was
-- not recorded before this column. Rows with no scorer stay NULL.)
UPDATE "Match" SET "createdBy" = "scorerId" WHERE "createdBy" IS NULL AND "scorerId" IS NOT NULL;

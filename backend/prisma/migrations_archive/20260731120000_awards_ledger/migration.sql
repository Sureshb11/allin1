-- Awards ledger.
--
-- MatchMVP existed but nothing ever wrote to it: match awards (Man of the Match,
-- Fighter, Best Batter / Bowler / Fielder) were computed for the post-match popup
-- and discarded, so `momCount` on every profile counted rows that never existed.
--
-- MatchMVP becomes the points ledger — one row per squad player per match, which
-- is what makes a series award a sum rather than a re-read of every ball in the
-- tournament. MatchAward records who won what: an award belongs to a (match,
-- kind), and one player routinely wins several in the same match.

-- AlterTable
ALTER TABLE "MatchMVP" ADD COLUMN     "playerName" TEXT,
                       ADD COLUMN     "points" DOUBLE PRECISION NOT NULL DEFAULT 0,
                       ADD COLUMN     "bat" DOUBLE PRECISION NOT NULL DEFAULT 0,
                       ADD COLUMN     "bowl" DOUBLE PRECISION NOT NULL DEFAULT 0,
                       ADD COLUMN     "field" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Re-running the awards for a match must not duplicate anyone. The table is
-- empty in every environment (nothing has ever inserted into it), so this can be
-- added without deduplicating first.
-- CreateIndex
CREATE UNIQUE INDEX "MatchMVP_matchId_playerId_key" ON "MatchMVP"("matchId", "playerId");

-- CreateIndex
CREATE INDEX "MatchMVP_playerId_idx" ON "MatchMVP"("playerId");

-- CreateIndex
CREATE INDEX "MatchMVP_matchId_idx" ON "MatchMVP"("matchId");

-- CreateTable
CREATE TABLE "MatchAward" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "playerName" TEXT,
    "teamId" TEXT,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "MatchAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchAward_matchId_kind_key" ON "MatchAward"("matchId", "kind");

-- CreateIndex
CREATE INDEX "MatchAward_playerId_kind_idx" ON "MatchAward"("playerId", "kind");

-- CreateTable
CREATE TABLE "TournamentAward" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tournamentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "playerName" TEXT,
    "teamName" TEXT,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "detail" TEXT,

    CONSTRAINT "TournamentAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TournamentAward_tournamentId_kind_key" ON "TournamentAward"("tournamentId", "kind");

-- CreateIndex
CREATE INDEX "TournamentAward_playerId_idx" ON "TournamentAward"("playerId");

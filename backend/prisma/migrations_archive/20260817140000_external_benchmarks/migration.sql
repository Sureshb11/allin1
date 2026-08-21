-- External benchmarking: comparing a club player against a licensed benchmark.
--
-- Three tables and NOTHING ELSE. No existing table is touched, so this is safe
-- to apply at any time and safe to leave unapplied — the code that reads these
-- catches and returns null, because a benchmark is enrichment and must never be
-- able to take down a player's profile.
--
-- Nothing in this app fetches anybody's statistics. These tables exist so that
-- the day a licensed provider is available, integrating it is a loader and a
-- mapping, not a scraper and a lawsuit. `licenceNote` sits on the source row so
-- the terms live next to the data, where the next person will actually read it.

CREATE TABLE "PlayerStatSource" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "licenceNote" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerStatSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalPlayerStat" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalPlayerId" TEXT,
    "playerId" TEXT,
    "playerName" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "format" TEXT,
    "matches" INTEGER,
    "innings" INTEGER,
    "runs" INTEGER,
    "balls" INTEGER,
    "average" DOUBLE PRECISION,
    "strikeRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalPlayerStat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalPlayerShotStat" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalPlayerId" TEXT,
    "playerId" TEXT,
    "level" TEXT NOT NULL,
    "shotType" TEXT,
    "shotZone" TEXT,
    "balls" INTEGER NOT NULL,
    "runs" INTEGER NOT NULL,
    "strikeRate" DOUBLE PRECISION,
    "dismissals" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalPlayerShotStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerStatSource_key_key" ON "PlayerStatSource"("key");

CREATE INDEX "ExternalPlayerStat_playerId_idx" ON "ExternalPlayerStat"("playerId");

CREATE INDEX "ExternalPlayerStat_level_idx" ON "ExternalPlayerStat"("level");

CREATE UNIQUE INDEX "ExternalPlayerStat_sourceId_externalPlayerId_level_format_key" ON "ExternalPlayerStat"("sourceId", "externalPlayerId", "level", "format");

CREATE INDEX "ExternalPlayerShotStat_playerId_idx" ON "ExternalPlayerShotStat"("playerId");

CREATE INDEX "ExternalPlayerShotStat_shotType_idx" ON "ExternalPlayerShotStat"("shotType");

CREATE INDEX "ExternalPlayerShotStat_shotZone_idx" ON "ExternalPlayerShotStat"("shotZone");

CREATE UNIQUE INDEX "ExternalPlayerShotStat_sourceId_externalPlayerId_level_shot_key" ON "ExternalPlayerShotStat"("sourceId", "externalPlayerId", "level", "shotType", "shotZone");

ALTER TABLE "ExternalPlayerStat" ADD CONSTRAINT "ExternalPlayerStat_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "PlayerStatSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExternalPlayerShotStat" ADD CONSTRAINT "ExternalPlayerShotStat_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "PlayerStatSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- CreateTable
CREATE TABLE "RummyGame" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "totalScore" INTEGER NOT NULL DEFAULT 250,
    "openDrop" INTEGER NOT NULL DEFAULT 25,
    "middleDrop" INTEGER NOT NULL DEFAULT 50,
    "fullCount" INTEGER NOT NULL DEFAULT 80,
    "adjustReentry" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "RummyGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RummyPlayer" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RummyPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RummyRound" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gameId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,

    CONSTRAINT "RummyRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RummyScore" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "RummyScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RummyGame_userId_createdAt_idx" ON "RummyGame"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RummyGame_status_idx" ON "RummyGame"("status");

-- CreateIndex
CREATE INDEX "RummyPlayer_gameId_idx" ON "RummyPlayer"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "RummyRound_gameId_roundNumber_key" ON "RummyRound"("gameId", "roundNumber");

-- CreateIndex
CREATE INDEX "RummyScore_roundId_idx" ON "RummyScore"("roundId");

-- CreateIndex
CREATE INDEX "RummyScore_playerId_idx" ON "RummyScore"("playerId");

-- AddForeignKey
ALTER TABLE "RummyPlayer" ADD CONSTRAINT "RummyPlayer_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "RummyGame"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RummyRound" ADD CONSTRAINT "RummyRound_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "RummyGame"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RummyScore" ADD CONSTRAINT "RummyScore_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "RummyRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RummyScore" ADD CONSTRAINT "RummyScore_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "RummyPlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


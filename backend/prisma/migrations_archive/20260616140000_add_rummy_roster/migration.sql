-- CreateTable
CREATE TABLE "RummyRosterPlayer" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "name" TEXT NOT NULL,

    CONSTRAINT "RummyRosterPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RummyRosterPlayer_userId_idx" ON "RummyRosterPlayer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RummyRosterPlayer_userId_name_key" ON "RummyRosterPlayer"("userId", "name");


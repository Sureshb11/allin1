-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "grantedBy" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchRole" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "grantedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastSession" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "broadcasterUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pairingCode" TEXT,
    "pairingTokenHash" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "pairAttempts" INTEGER NOT NULL DEFAULT 0,
    "overlayTokenHash" TEXT,
    "youtubeBroadcastId" TEXT,
    "youtubeStreamId" TEXT,
    "youtubeVideoId" TEXT,
    "requestedAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "revokeReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BroadcastSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastAuditLog" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "broadcastSessionId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BroadcastAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserRole_userId_status_idx" ON "UserRole"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_role_key" ON "UserRole"("userId", "role");

-- CreateIndex
CREATE INDEX "MatchRole_userId_status_idx" ON "MatchRole"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MatchRole_matchId_userId_role_key" ON "MatchRole"("matchId", "userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastSession_pairingTokenHash_key" ON "BroadcastSession"("pairingTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastSession_overlayTokenHash_key" ON "BroadcastSession"("overlayTokenHash");

-- CreateIndex
CREATE INDEX "BroadcastSession_matchId_status_idx" ON "BroadcastSession"("matchId", "status");

-- CreateIndex
CREATE INDEX "BroadcastSession_status_tokenExpiresAt_idx" ON "BroadcastSession"("status", "tokenExpiresAt");

-- CreateIndex
CREATE INDEX "BroadcastAuditLog_matchId_createdAt_idx" ON "BroadcastAuditLog"("matchId", "createdAt");

-- CreateIndex
CREATE INDEX "BroadcastAuditLog_broadcastSessionId_createdAt_idx" ON "BroadcastAuditLog"("broadcastSessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "MatchRole" ADD CONSTRAINT "MatchRole_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastSession" ADD CONSTRAINT "BroadcastSession_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;


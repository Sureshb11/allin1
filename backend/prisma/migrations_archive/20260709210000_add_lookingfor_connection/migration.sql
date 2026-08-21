-- CreateTable
CREATE TABLE "LookingForConnection" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "listingId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "posterId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "chatRoomId" TEXT,
    CONSTRAINT "LookingForConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LookingForConnection_listingId_requesterId_key" ON "LookingForConnection"("listingId", "requesterId");
CREATE INDEX "LookingForConnection_posterId_status_idx" ON "LookingForConnection"("posterId", "status");
CREATE INDEX "LookingForConnection_requesterId_idx" ON "LookingForConnection"("requesterId");

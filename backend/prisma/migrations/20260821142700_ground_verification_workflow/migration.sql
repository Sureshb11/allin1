-- AlterTable
ALTER TABLE "Ground" ADD COLUMN     "adminNotes" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedBy" TEXT,
ALTER COLUMN "status" SET DEFAULT 'PENDING_VERIFICATION';

-- CreateTable
CREATE TABLE "GroundVerification" (
    "id" TEXT NOT NULL,
    "groundId" TEXT NOT NULL,
    "adminId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroundVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroundVerification_groundId_idx" ON "GroundVerification"("groundId");

-- CreateIndex
CREATE INDEX "GroundVerification_adminId_idx" ON "GroundVerification"("adminId");

-- AddForeignKey
ALTER TABLE "GroundVerification" ADD CONSTRAINT "GroundVerification_groundId_fkey" FOREIGN KEY ("groundId") REFERENCES "Ground"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroundVerification" ADD CONSTRAINT "GroundVerification_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


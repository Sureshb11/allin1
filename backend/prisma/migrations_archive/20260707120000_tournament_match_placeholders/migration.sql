-- AlterTable
ALTER TABLE "TournamentMatch" ADD COLUMN     "placeholder1" TEXT,
ADD COLUMN     "placeholder2" TEXT,
ALTER COLUMN "team1Id" DROP NOT NULL,
ALTER COLUMN "team2Id" DROP NOT NULL;

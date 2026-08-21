-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sport" TEXT NOT NULL DEFAULT 'cricket',
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "team" TEXT,
    "text" TEXT NOT NULL,
    "likes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Post_sport_createdAt_idx" ON "Post"("sport", "createdAt");


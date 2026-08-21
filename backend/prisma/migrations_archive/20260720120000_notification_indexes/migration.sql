-- Notification reads are always "mine, newest first" (bell screen) and
-- "mine, unread" (badge count). Without these both are sequential scans over
-- the whole table, which grows with every match event fanned out to a circle.
-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

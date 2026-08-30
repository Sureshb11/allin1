-- Chat polls.
--
-- Additive only: two columns on an existing table, one with a default and one
-- nullable, so every row already in ChatMessage is valid the moment this lands
-- and nothing is rewritten. No table is created — votes live in the polymorphic
-- "Like" table under targetType 'poll_vote', the same way saved posts and
-- player follows do.
ALTER TABLE "ChatMessage" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'text';
ALTER TABLE "ChatMessage" ADD COLUMN "poll" JSONB;

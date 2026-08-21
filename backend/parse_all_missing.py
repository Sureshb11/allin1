import re

known_tables = [
    "User", "Notification", "Team", "Player", "Match", "News", "Product", "Badge", "UserBadge", "Tournament", "Stream",
    "UserSport", "SportEvent", "Post", "Comment", "RummyGame", "RummyPlayer", "RummyRound", "RummyScore", 
    "RummyRosterPlayer", "LookingForConnection", "TeamJoinRequest", "DeviceToken", "MatchAward", "TournamentAward", 
    "UserRole", "MatchRole", "BroadcastSession", "BroadcastAuditLog", "BallIntelligence", "PlayerStatSource", 
    "ExternalPlayerStat", "ExternalPlayerShotStat", "GroundSport", "_prisma_migrations"
]

with open("all_tables.sql", "r") as f:
    sql = f.read()

# Find all tables in all_tables.sql
all_schema_tables = re.findall(r'CREATE TABLE "([^"]+)"', sql)

missing_tables = [t for t in all_schema_tables if t not in known_tables]
print("Missing tables:", missing_tables)

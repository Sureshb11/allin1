import re

with open("all_tables.sql", "r") as f:
    sql = f.read()

tables_to_find = ["Ball", "Over", "Booking", "MatchPlayer", "Ground", "GroundImage", "GroundOpeningHours", "GroundAmenity", "GroundFavourite", "GroundReview", "MatchOfficial"]

out = []
for table in tables_to_find:
    pattern = r'(CREATE TABLE "' + table + r'" \([\s\S]*?\);)'
    match = re.search(pattern, sql)
    if match:
        out.append(match.group(1).replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'))

with open("missing_tables.sql", "w") as f:
    f.write("\n\n".join(out))

import re

with open("all_tables.sql", "r") as f:
    sql = f.read()

tables_to_find = ["Ball", "Over", "Booking", "MatchPlayer", "Ground", "GroundImage", "GroundOpeningHours", "GroundAmenity", "GroundFavourite", "GroundReview", "MatchOfficial"]

out = []
for table in tables_to_find:
    # Find all ALTER TABLE "table" ADD CONSTRAINT ...
    pattern = r'ALTER TABLE "' + table + r'" ADD CONSTRAINT "[^"]+" FOREIGN KEY \([^)]+\) REFERENCES "[^"]+"\([^)]+\)[^;]*;'
    matches = re.findall(pattern, sql)
    for match in matches:
        out.append(match)

with open("missing_fks.sql", "w") as f:
    f.write("\n".join(out))

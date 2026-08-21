import re

with open("missing_tables.sql", "r") as f:
    sql = f.read()

# Ball table removals
sql = re.sub(r'\s*"bowlerId"\s+TEXT,?', '', sql)
sql = re.sub(r'\s*"directHit"\s+BOOLEAN,?', '', sql)
sql = re.sub(r'\s*"droppedBy"\s+TEXT,?', '', sql)
sql = re.sub(r'\s*"dropDifficulty"\s+TEXT,?', '', sql)

# MatchPlayer table removals
sql = re.sub(r'\s*"isViceCaptain"\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+false,?', '', sql)

# Ground table removals
sql = re.sub(r'\s*"sport"\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+\'cricket\',?', '', sql)

with open("missing_tables_cleaned.sql", "w") as f:
    f.write(sql)

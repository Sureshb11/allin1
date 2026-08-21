import re

with open("missing_fks.sql", "r") as f:
    lines = f.readlines()

out = []
for line in lines:
    line = line.strip()
    if not line:
        continue
        
    if "Ball_bowlerId_fkey" in line:
        continue
        
    # Extract constraint name
    match = re.search(r'ADD CONSTRAINT "([^"]+)"', line)
    if match:
        constraint_name = match.group(1)
        # Extract table name
        table_match = re.search(r'ALTER TABLE "([^"]+)"', line)
        table_name = table_match.group(1)
        
        block = f"""DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{constraint_name}') THEN
        {line}
    END IF;
END $$;
"""
        out.append(block)

with open("missing_fks_idempotent.sql", "w") as f:
    f.write("\n".join(out))

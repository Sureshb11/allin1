import re

with open("backend/prisma/schema.prisma", "r") as f:
    content = f.read()

# Comment out GroundSport model
content = re.sub(r'model GroundSport \{[^}]+\}', r'/*\n\g<0>\n*/', content)

# Comment out GroundSport relation inside Ground model
content = re.sub(r'(sports\s+GroundSport\[\])', r'// \1', content)

with open("backend/prisma/schema.prisma", "w") as f:
    f.write(content)

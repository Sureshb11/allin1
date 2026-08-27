import re

with open('frontend/src/screens/StatisticsScreen.js', 'r') as f:
    content = f.read()

content = re.sub(
    r'\{searchQuery\.trim\(\)\s*\?\s*\'No one matches that search\'\s*:\s*`No \$\{tab\.toLowerCase\(\)\} ranked by \$\{board\.label\.toLowerCase\(\)\} yet`\}',
    r"{searchQuery.trim() ? 'No one matches that search' : 'Rankings not available yet'}",
    content
)

with open('frontend/src/screens/StatisticsScreen.js', 'w') as f:
    f.write(content)


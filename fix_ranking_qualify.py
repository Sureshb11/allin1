import re

with open('frontend/src/sports/careerStats.js', 'r') as f:
    content = f.read()

# Replace `qualify: () => true` with `qualify: (row) => (row.matches || row.stats?.matches || 0) > 0`
content = content.replace('qualify: () => true,', 'qualify: (row) => (row.matches || row.stats?.matches || 0) > 0,')

with open('frontend/src/sports/careerStats.js', 'w') as f:
    f.write(content)

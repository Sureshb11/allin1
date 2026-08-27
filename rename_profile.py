import re

with open('frontend/src/screens/PlayerProfileScreen.js', 'r') as f:
    content = f.read()

# 1. Change Component Name
content = content.replace('export default function PlayerInsightsScreen', 'export default function PlayerProfileScreen')

# 2. Remove Scout Insights UI
# We need to remove the "Analysis" and "Recommendations" sections.
# Let's just find the Section blocks and remove them.
# The string looks like `{/* The scouting read`
content = re.sub(r'\{/\* The scouting read.*?</Section>\s*\)}', '', content, flags=re.DOTALL)

# And remove recommendations
content = re.sub(r'\{!loading && recs\.length > 0.*?</Section>\s*\)}', '', content, flags=re.DOTALL)

with open('frontend/src/screens/PlayerProfileScreen.js', 'w') as f:
    f.write(content)


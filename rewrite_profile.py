with open('frontend/src/screens/PlayerInsightsScreen.js', 'r') as f:
    content = f.read()

import re

# 1. Change Component Name
content = content.replace('export default function PlayerInsightsScreen', 'export default function PlayerProfileScreen')

# 2. Remove Scout Insights UI
# The string looks like `{/* The scouting read`
content = re.sub(r'\{/\* The scouting read.*?</Section>\s*\)}', '', content, flags=re.DOTALL)

# And remove recommendations
content = re.sub(r'\{!loading && recs\.length > 0.*?</Section>\s*\)}', '', content, flags=re.DOTALL)

# Let's also remove `const [insights, setInsights]` and the associated logic since it's not needed.
content = re.sub(r'const \[insights, setInsights\] = useState\(\{\}\);', '', content)
content = re.sub(r'legendsApi\.getPlayerInsights\(playerId\),', '', content)
content = re.sub(r'\]\)\.then\(\(\[c, ins, sh\]\) => \{', ']).then(([c, sh]) => {', content)
content = re.sub(r'if \(ins\.success\) setInsights\(ins\.data\);', '', content)

# Remove the insights derivation
content = re.sub(r'const perf = shotData\?\.insights \|\| insights;.*?(?=return \()', '', content, flags=re.DOTALL)


with open('frontend/src/screens/PlayerProfileScreen.js', 'w') as f:
    f.write(content)


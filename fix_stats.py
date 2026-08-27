import re

with open('frontend/src/screens/StatisticsScreen.js', 'r') as f:
    content = f.read()

# Change navigation for Rankings Player
content = re.sub(
    r"if \(tab === 'Players'\) navigation\?\.navigate\('PlayerInsights', \{",
    r"if (tab === 'Players') navigation?.navigate('PlayerProfile', {",
    content
)

with open('frontend/src/screens/StatisticsScreen.js', 'w') as f:
    f.write(content)


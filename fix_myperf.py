import re

with open('frontend/src/screens/MyPerformanceScreen.js', 'r') as f:
    content = f.read()

# Let's find how stats is set
# const [stats, setStats] = useState(null);
# const [careerStatus, setCareerStatus] = useState('AVAILABLE'); // We should add this

# Actually, let's just use re.sub on the rendering block.

old_mine_line = r"const mine = hasCareer\(statsToPass, sportId\);"
new_mine_line = r"const mine = (careerStatus !== 'NOT_AVAILABLE' && careerStatus !== 'INSUFFICIENT_DATA') && hasCareer(statsToPass, sportId);"

# We need to extract careerStatus from getUserStats response
old_fetch = r"if \(res\.success\) \{\s*setStats\(res\.data\.stats\);"
new_fetch = r"if (res.success) {\n        setStats(res.data.stats);\n        setCareerStatus(res.data.status);"

# Add state
old_state = r"const \[stats, setStats\] = useState\(null\);"
new_state = r"const [stats, setStats] = useState(null);\n  const [careerStatus, setCareerStatus] = useState('AVAILABLE');"

content = re.sub(old_state, new_state, content)
content = re.sub(old_fetch, new_fetch, content)
content = re.sub(old_mine_line, new_mine_line, content)

with open('frontend/src/screens/MyPerformanceScreen.js', 'w') as f:
    f.write(content)

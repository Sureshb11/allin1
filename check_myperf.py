import re

with open('frontend/src/screens/MyPerformanceScreen.js', 'r') as f:
    content = f.read()

# Let's see what MyPerformanceScreen renders for hasCareer
# Wait, MyPerformanceScreen calls getUserStats() which returns { stats: { matches: 0 } }
# Let's check how it uses hasCareer
match = re.search(r'hasCareer\([^)]+\)\s*\?.*?:\s*\(\s*<View.*?emptyTitle.*?\}', content, flags=re.DOTALL)
if match:
    print("Found empty state in MyPerformanceScreen")

import re

with open('frontend/src/services/LegendsApi.js', 'r') as f:
    content = f.read()

match = re.search(r'getUserProfile.*?\{', content, flags=re.DOTALL)
if match:
    print("getUserProfile found")

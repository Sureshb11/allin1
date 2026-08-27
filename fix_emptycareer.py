import re

with open('backend/src/lib/playerCareer.js', 'r') as f:
    content = f.read()

content = content.replace("export const emptyCareer = (sport = null) => ({ stats: { ...BASE }, sport, linked: false });", "export const emptyCareer = (sport = null) => ({ stats: { ...BASE }, sport, linked: false, status: 'NOT_AVAILABLE' });")

with open('backend/src/lib/playerCareer.js', 'w') as f:
    f.write(content)

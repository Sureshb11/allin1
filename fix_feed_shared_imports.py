with open("frontend/src/components/FeedShared.js", "r") as f:
    content = f.read()

content = content.replace("from '../components/Toast'", "from './Toast'")
content = content.replace("from '../components/BrandLogo'", "from './BrandLogo'")
content = content.replace("from '../components/AppHeader'", "from './AppHeader'")
content = content.replace("from '../components/HexAvatar'", "from './HexAvatar'")
content = content.replace("from '../components/AutoHideTabBar'", "from './AutoHideTabBar'")
content = content.replace("from './MyMatchesScreen'", "from '../screens/MyMatchesScreen'")

with open("frontend/src/components/FeedShared.js", "w") as f:
    f.write(content)

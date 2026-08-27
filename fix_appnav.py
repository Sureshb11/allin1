with open('frontend/src/navigation/AppNavigator.js', 'r') as f:
    content = f.read()

content = content.replace("import PlayerInsightsScreen from '../screens/PlayerInsightsScreen';", "import PlayerInsightsScreen from '../screens/PlayerInsightsScreen';\nimport PlayerProfileScreen from '../screens/PlayerProfileScreen';")

content = content.replace("<Stack.Screen name=\"PlayerProfile\" component={PlaceholderScreen} initialParams={{title: 'Player Profile'}} />", "<Stack.Screen name=\"PlayerProfile\" component={PlayerProfileScreen} initialParams={{title: 'Player Profile'}} />")

with open('frontend/src/navigation/AppNavigator.js', 'w') as f:
    f.write(content)


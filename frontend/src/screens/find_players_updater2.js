const fs = require('fs');

let content = fs.readFileSync('frontend/src/screens/FindPlayersScreen.js', 'utf8');

// Remove SPORTS array
content = content.replace(
  `// Sport tabs shown at the top.
const SPORTS = [
{ id: 'cricket', label: 'Cricket' },
{ id: 'football', label: 'Football' },
{ id: 'badminton', label: 'Badminton' }];`,
  ``
);

// We need to remove the tabs from rendering
const tabsRegex = /\{\/\* sport tabs \*\/\}(.|\n)*?\<\/\View\>/m;
const match = content.match(/\{\/\* sport tabs \*\/\}[\s\S]*?<\/View>/);

if (match) {
  content = content.replace(match[0], '');
}

// Add an empty state check if `sport` is null
content = content.replace(
  `  return (
    <View style={s.container}>`,
  `  if (!sport) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <StatusBar barStyle="light-content" backgroundColor={DS.bg} />
        <View style={s.header}>
          <TouchableOpacity hitSlop={8} onPress={() => navigation.goBack()} style={s.backBtn}>
            <Icon name="arrow-left" size={24} color={DS.textPrimary} />
          </TouchableOpacity>
          <Text style={s.title}>Find Players</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Icon name="account-search-outline" size={48} color={DS.textMuted} style={{ marginBottom: 16 }} />
          <Text style={{ color: DS.text, fontSize: 16, textAlign: 'center', marginBottom: 20 }}>
            Your sport preference is required to use Scout.
          </Text>
          <TouchableOpacity 
            style={{ backgroundColor: DS.lime, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }} 
            onPress={() => navigation.navigate('MySports')}>
            <Text style={{ color: DS.surface, fontWeight: '700' }}>Update Profile</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>`
);

fs.writeFileSync('frontend/src/screens/FindPlayersScreen.js', content);

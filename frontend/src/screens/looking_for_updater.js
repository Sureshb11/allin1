const fs = require('fs');

let content = fs.readFileSync('frontend/src/screens/LookingForScreen.js', 'utf8');

content = content.replace(
  `  const sportFilter = route?.params?.sport || getSelectedSport().sport?.id || null;`,
  `  const sportFilter = route?.params?.sport || getSelectedSport().sport?.id || null;

  if (!sportFilter) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <Icon name="account-search-outline" size={48} color={DS.textMuted} style={{ marginBottom: 16 }} />
        <Text style={{ color: DS.text, fontSize: 16, textAlign: 'center', marginBottom: 20 }}>
          Your sport preference is required to use Scout.
        </Text>
        <PrimaryButton label="Update Profile" onPress={() => navigation.navigate('MySports')} />
      </View>
    );
  }`
);

// We also need to fix default sport being passed when creating a post
// In the LookingForScreen, search for `sport: getSelectedSport().sport?.id || 'cricket',` 
// and replace it with `sport: getSelectedSport().sport?.id,`
content = content.replace(/sport: getSelectedSport\(\).sport\?\.id \|\| 'cricket',/g, `sport: getSelectedSport().sport?.id,`);

// Same for formats and subtypes
content = content.replace(/getScout\(getSelectedSport\(\).sport\?\.id \|\| 'cricket'\)/g, `getScout(sportFilter)`);

fs.writeFileSync('frontend/src/screens/LookingForScreen.js', content);

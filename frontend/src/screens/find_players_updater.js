const fs = require('fs');

let content = fs.readFileSync('frontend/src/screens/FindPlayersScreen.js', 'utf8');

// The line is: const [sport, setSport] = useState(route?.params?.sport || 'cricket');
// It should be: const sport = route?.params?.sport || getSelectedSport().sport?.id || null;
// Wait, we need to import getSelectedSport.
// Wait, it says: "use selected Scout sport"
content = content.replace(
  `  const [sport, setSport] = useState(route?.params?.sport || 'cricket');`,
  `  const [sport, setSport] = useState(route?.params?.sport || getSelectedSport().sport?.id);`
);

if (!content.includes('getSelectedSport')) {
  content = content.replace(
    `import { getFind } from '../sports/find';`,
    `import { getFind } from '../sports/find';\nimport { getSelectedSport } from '../utils/selectedSport';`
  );
}

// Ensure getScout is imported
if (!content.includes('getScout')) {
  content = content.replace(
    `import { getFind } from '../sports/find';`,
    `import { getFind } from '../sports/find';\nimport { getScout } from '../sports/scout';`
  );
}

// Read roles from getScout
content = content.replace(
  `  const cfg = getFind(sport);
  const FILTERS = ['All', ...cfg.roles];`,
  `  const cfg = getFind(sport);
  const scoutConfig = getScout(sport);
  const FILTERS = ['All', ...(scoutConfig.subtypes?.player || [])];`
);

// Empty State handling
// Look for empty state block, currently looks like:
// <Text style={s.emptySub}>Nobody in {sport} matched your search.</Text>
// Or something. Let's see what it has.
fs.writeFileSync('frontend/src/screens/FindPlayersScreen.js', content);

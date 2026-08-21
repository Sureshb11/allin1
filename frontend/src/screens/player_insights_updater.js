const fs = require('fs');

let content = fs.readFileSync('frontend/src/screens/PlayerInsightsScreen.js', 'utf8');

// Ensure sportId doesn't fallback to cricket if it shouldn't?
// Actually `const sportId = career?.sport || passed?.sport || 'cricket';` is already what's there. Let's make it `const sportId = passed?.sport || career?.sport;`
content = content.replace(
  `const sportId = career?.sport || passed?.sport || 'cricket';`,
  `const sportId = passed?.sport || career?.sport;`
);

// We need to handle sportId possibly being undefined? Well, it's better to default to the selected sport if it's not set.
// Wait, no, we just use passed?.sport || career?.sport. If undefined, we can maybe leave it undefined, and CareerBoard will fallback to generic.

content = content.replace(
  `{!loading && !!shotData?.shots?.length && (`,
  `{!loading && sportId === 'cricket' && !!shotData?.shots?.length && (`
);

content = content.replace(
  `{!loading && (strong.length > 0 || improve.length > 0) && (
            <Section title="Analysis" icon="chart-donut">`,
  `{!loading && sportId === 'cricket' && (strong.length > 0 || improve.length > 0) && (
            <Section title="Analysis" icon="chart-donut">`
);

// We should also add the non-cricket empty state for Analysis
const analysisBlockEnd = `                </View>
              </View>
            </Section>
          )}`;

content = content.replace(
  analysisBlockEnd,
  analysisBlockEnd + `
          
          {!loading && sportId && sportId !== 'cricket' && (
            <View style={[styles.empty, { marginTop: 16 }]}>
              <Icon name="chart-donut" size={44} color={DS.textMuted} />
              <Text style={styles.emptyTitle}>Analysis not available</Text>
              <Text style={styles.emptySub}>Advanced statistics and insights are coming soon for {sportId}.</Text>
            </View>
          )}`
);

fs.writeFileSync('frontend/src/screens/PlayerInsightsScreen.js', content);

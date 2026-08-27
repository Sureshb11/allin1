import re

with open('frontend/src/screens/PlayerInsightsScreen.js', 'r') as f:
    content = f.read()

# Replace CareerBoard with Compact Summary
summary_jsx = """
          {!loading && (
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryValue}>{stats?.matches || 0}</Text>
                  <Text style={styles.summaryLabel}>Matches</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryValue}>{stats?.wins || 0}</Text>
                  <Text style={styles.summaryLabel}>Wins</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryValue}>{stats?.winPercent != null ? `${stats.winPercent}%` : '-'}</Text>
                  <Text style={styles.summaryLabel}>Win Rate</Text>
                </View>
              </View>
              <TouchableOpacity 
                style={styles.fullStatsBtn} 
                activeOpacity={0.8}
                onPress={() => navigation.navigate('PlayerProfile', { playerId, player: passed, standing, boardLabel })}
              >
                <Text style={styles.fullStatsBtnText}>View Full Stats</Text>
                <Icon name="arrow-right" size={16} color={DS.lime} />
              </TouchableOpacity>
            </View>
          )}
"""

content = re.sub(r'\{\s*loading \? \(.*?\) : hasCareer\(stats, sportId\) \? \(.*?</View>\s*\)}', summary_jsx, content, flags=re.DOTALL)

# Remove ShotBoard
content = re.sub(r'\{!loading && sportId === \'cricket\' && !!shotData\?\.shots\?\.length && \(.*?</ShotBoard>\s*\)}', '', content, flags=re.DOTALL)

# Add styles for summary
styles_add = """
  summaryCard: { backgroundColor: DS.surface, borderRadius: 16, borderWidth: 1, borderColor: DS.border, padding: 16, gap: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12 },
  summaryStat: { alignItems: 'center', gap: 4 },
  summaryValue: { fontSize: 24, fontWeight: '900', color: DS.textPrimary },
  summaryLabel: { fontSize: 11, fontWeight: '700', color: DS.textMuted, textTransform: 'uppercase' },
  fullStatsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: DS.surfaceHigh, paddingVertical: 12, borderRadius: 12 },
  fullStatsBtnText: { fontSize: 13, fontWeight: '800', color: DS.lime },
"""

content = content.replace('body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32, gap: 10 },', 'body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32, gap: 10 },\n' + styles_add)

with open('frontend/src/screens/PlayerInsightsScreen.js', 'w') as f:
    f.write(content)

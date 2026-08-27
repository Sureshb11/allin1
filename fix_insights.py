import re

with open('frontend/src/screens/PlayerInsightsScreen.js', 'r') as f:
    content = f.read()

# Replace the summary section
old_summary = r"\{\!loading && \(\s*<View style=\{styles\.summaryCard\}>\s*<View style=\{styles\.summaryRow\}>\s*<View style=\{styles\.summaryStat\}>\s*<Text style=\{styles\.summaryValue\}>\{stats\?\.matches \|\| 0\}</Text>\s*<Text style=\{styles\.summaryLabel\}>Matches</Text>\s*</View>\s*<View style=\{styles\.summaryStat\}>\s*<Text style=\{styles\.summaryValue\}>\{stats\?\.wins \|\| 0\}</Text>\s*<Text style=\{styles\.summaryLabel\}>Wins</Text>\s*</View>\s*<View style=\{styles\.summaryStat\}>\s*<Text style=\{styles\.summaryValue\}>\{stats\?\.winPercent \!\= null \? `\$\{stats\.winPercent\}%` : '-'\}\s*</Text>\s*<Text style=\{styles\.summaryLabel\}>Win Rate</Text>\s*</View>\s*</View>\s*<TouchableOpacity \s*style=\{styles\.fullStatsBtn\} \s*activeOpacity=\{0\.8\}\s*onPress=\{\(\) => navigation\.navigate\('PlayerProfile', \{ playerId, player: passed, standing, boardLabel \}\)\}\s*>\s*<Text style=\{styles\.fullStatsBtnText\}>View Full Stats</Text>\s*<Icon name=\"arrow-right\" size=\{16\} color=\{DS\.lime\} />\s*</TouchableOpacity>\s*</View>\s*\)\}"

new_summary = """
          {!loading && (career?.status === 'NOT_AVAILABLE' || career?.status === 'INSUFFICIENT_DATA') ? (
            <View style={styles.empty}>
              <Icon name="chart-donut" size={44} color={DS.textMuted} />
              <Text style={styles.emptyTitle}>
                {career.status === 'NOT_AVAILABLE' ? 'Statistics not available yet' : 'Not enough match data'}
              </Text>
              <Text style={styles.emptySub}>{name} hasn't played a scored match on Local Legends.</Text>
            </View>
          ) : !loading && (
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

content = re.sub(old_summary, new_summary.strip(), content, flags=re.DOTALL)

with open('frontend/src/screens/PlayerInsightsScreen.js', 'w') as f:
    f.write(content)

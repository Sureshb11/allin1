import re

with open('frontend/src/screens/PlayerProfileScreen.js', 'r') as f:
    content = f.read()

old_career = r"\{\s*loading \? \(\s*<BoardSkeleton DS=\{DS\} />\s*\) : hasCareer\(stats, sportId\) \? \(\s*<CareerBoard stats=\{stats\} sportId=\{sportId\} navigation=\{navigation\} />\s*\) : \(\s*<View style=\{styles\.empty\}>\s*<Icon name=\"chart-line\" size=\{44\} color=\{DS\.textMuted\} />\s*<Text style=\{styles\.emptyTitle\}>No career numbers yet</Text>\s*<Text style=\{styles\.emptySub\}>\{name\} hasn't played a scored match on Local Legends\.</Text>\s*</View>\s*\)\s*\}"

new_career = """
          {loading ? (
            <BoardSkeleton DS={DS} />
          ) : (career?.status === 'NOT_AVAILABLE' || career?.status === 'INSUFFICIENT_DATA') || !hasCareer(stats, sportId) ? (
            <View style={styles.empty}>
              <Icon name="chart-line" size={44} color={DS.textMuted} />
              <Text style={styles.emptyTitle}>
                {career?.status === 'NOT_AVAILABLE' ? 'Statistics not available yet' 
                 : career?.status === 'INSUFFICIENT_DATA' ? 'Not enough match data' 
                 : 'No career numbers yet'}
              </Text>
              <Text style={styles.emptySub}>{name} hasn't played a scored match on Local Legends.</Text>
            </View>
          ) : (
            <CareerBoard stats={stats} sportId={sportId} navigation={navigation} />
          )}
"""

content = re.sub(old_career, new_career.strip(), content, flags=re.DOTALL)

with open('frontend/src/screens/PlayerProfileScreen.js', 'w') as f:
    f.write(content)

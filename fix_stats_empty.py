import re

with open('frontend/src/screens/StatisticsScreen.js', 'r') as f:
    content = f.read()

empty_state = """
              {data.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 64, gap: 8 }}>
                  <Icon name="chart-bar" size={44} color={DS.textMuted} />
                  <Text style={{ fontSize: 15, fontWeight: '700', color: DS.textVariant, marginTop: 6 }}>
                    Rankings not available yet
                  </Text>
                  <Text style={{ fontSize: 12.5, color: DS.textMuted, textAlign: 'center', paddingHorizontal: 28, lineHeight: 18 }}>
                    Not enough match data to rank players in {sportId}.
                  </Text>
                </View>
              ) : (
                <Animated.View style={{ opacity: fadeAnim }}>
                  {myStanding && myStanding.standing === 0 && <ConfettiCannon />}
                  <Podium rows={data.slice(0, 3)} board={board} myId={myId}
                    onPress={openDetail} styles={styles} DS={DS} />
                </Animated.View>
              )}
"""

# Find where Podium is rendered inside the FlatList ListHeaderComponent
# Actually, Podium is inside Animated.View inside ListHeaderComponent
# Let's see how ListHeaderComponent is defined.

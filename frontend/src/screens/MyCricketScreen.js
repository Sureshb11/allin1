import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const DS = {
  bg: '#0f131f', surfaceLow: '#171b28', surfaceHigh: '#262a37', surfaceHighest: '#313442',
  lime: '#abd600', textPrimary: '#dfe2f3', textVariant: '#c3c5d9', textMuted: '#8d90a2',
};

const TILES = [
  { icon: 'cricket',       label: 'My Matches',   sub: 'View all matches',        screen: 'MyMatches',      color: DS.lime    },
  { icon: 'trophy',        label: 'Tournaments',   sub: 'Join & track',            screen: 'Tournaments',    color: '#f59e0b'  },
  { icon: 'account-group', label: 'My Teams',      sub: 'Manage squads',           screen: 'TeamManagement', color: '#3b82f6'  },
  { icon: 'chart-bar',     label: 'Statistics',    sub: 'Player & team stats',     screen: 'Statistics',     color: '#a855f7'  },
  { icon: 'video-outline', label: 'Highlights',    sub: 'Watch & analyse',         screen: 'VideoAnalysis',  color: '#d97706'  },
  { icon: 'chart-line',    label: 'My Performance',sub: 'Batting & bowling',       screen: 'MyPerformance',  color: '#22c55e'  },
  { icon: 'telescope',     label: 'Looking For',   sub: 'Find players & teams',    screen: 'LookingFor',     color: '#f97316'  },
  { icon: 'teach',         label: 'Coaching',      sub: 'Book a coach',            screen: 'Coaching',       color: '#ef4444'  },
];

export default function MyCricketScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={DS.bg} />
      <View style={styles.hero}>
        <Icon name="cricket" size={20} color={DS.textMuted} />
        <Text style={styles.heroTitle}>My Cricket</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          {TILES.map(t => (
            <TouchableOpacity
              key={t.screen}
              style={styles.tile}
              onPress={() => navigation.navigate(t.screen)}
              activeOpacity={0.82}
            >
              <View style={[styles.tileIconWrap, { backgroundColor: t.color + '22' }]}>
                <Icon name={t.icon} size={26} color={t.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tileLabel}>{t.label}</Text>
                <Text style={styles.tileSub}>{t.sub}</Text>
              </View>
              <Icon name="chevron-right" size={14} color={DS.surfaceHighest} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16,
  },
  heroTitle: { fontSize: 20, fontWeight: '800', color: DS.textPrimary },
  grid: { padding: 16, gap: 10 },
  tile: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 14,
  },
  tileIconWrap: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontSize: 15, fontWeight: '800', color: DS.textPrimary },
  tileSub: { fontSize: 11, color: DS.textMuted, marginTop: 2 },
});

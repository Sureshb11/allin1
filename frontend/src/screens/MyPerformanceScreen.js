import React, { useEffect, useState, useLayoutEffect, useRef, useCallback } from 'react';
import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import { useHideTabBarOnScroll, useTabBarClearance } from "../components/AutoHideTabBar";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, RefreshControl, Share } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import RNShare from 'react-native-share';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { getSelectedSport } from '../utils/selectedSport';
import { getSport } from '../sports';
import { getCareerPanels, readStat, hasCareer } from '../sports/careerStats';
import SegmentedControl from '../components/SegmentedControl';
import { pav } from '../theme/pavilion';
import CareerBoard from '../components/CareerBoard';
import { useCurrentUser } from '../utils/currentUser';

// Shape-matching placeholder: the career line, then the stat table. The spinner
// it replaces said "something is coming" but not what, so the screen jumped.
function StatsSkeleton({ DS }) {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.75, duration: 900, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const Bar = ({ w, h, r = 6, mt = 0 }) => (
    <Animated.View style={{ width: w, height: h, borderRadius: r, marginTop: mt, backgroundColor: DS.surfaceHigh, opacity: pulse }} />
  );
  return (
    <View style={{ gap: 10 }}>
      <View style={{ backgroundColor: DS.surface, borderRadius: 16, borderWidth: 1, borderColor: DS.border, padding: 13, gap: 12 }}>
        <Bar w="45%" h={10} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[0, 1, 2, 3, 4].map((i) => <Bar key={i} w={28} h={28} r={14} />)}
        </View>
      </View>
      <View style={{ backgroundColor: DS.surface, borderRadius: 16, borderWidth: 1, borderColor: DS.border, padding: 13 }}>
        {[0, 1, 2].map((r) => (
          <View key={r} style={{ flexDirection: 'row', paddingVertical: 9 }}>
            {[0, 1, 2].map((c) => (
              <View key={c} style={{ flex: 1, gap: 6 }}>
                <Bar w="55%" h={16} />
                <Bar w="72%" h={8} />
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

export default function MyPerformanceScreen({ navigation, inline, onRegisterFab }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);const hideTabBar = useHideTabBarOnScroll();const tabClear = useTabBarClearance();
  const meUser = useCurrentUser();
  const [stats, setStats] = useState(null);
  const sportId = getSelectedSport().sport?.id || 'cricket';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ballType, setBallType] = useState('overall'); // 'overall', 'leather', 'tennis'
  const shotRef = useRef(null);

  useLayoutEffect(() => {
    if (!inline) {
      // Own hero below, like every other screen in this stack — the navigator's
      // default header stacked a light system bar above it and repeated the
      // title. Fourth instance of this pattern in the codebase.
      navigation.setOptions({ headerShown: false });
    }
  }, [navigation, inline]);

  const fetchStats = useCallback(() =>
    legendsApi.getUserStats(getSelectedSport().sport?.id).then((res) => {
      if (res.success) setStats(res.data);
    }), []);

  useEffect(() => { fetchStats().finally(() => setLoading(false)); }, [fetchStats]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchStats().finally(() => setRefreshing(false));
  }, [fetchStats]);

  // Capture the stat card as an image and share it (falls back to plain text if
  // the capture fails). Registered as the Pavilion "Share Card" FAB action.
  const shareCard = useCallback(async () => {
    const sportName = getSport(sportId)?.name || 'Cricket';
    const caption = `📊 ${meUser?.name || 'My'} ${sportName} stats\nvia Local Legends`;
    try {
      const uri = await captureRef(shotRef, { format: 'png', quality: 0.95, result: 'tmpfile' });
      await RNShare.open({ url: uri, type: 'image/png', message: caption, failOnCancel: false });
    } catch (e) {
      try { await Share.share({ message: caption }); } catch {}
    }
  }, [sportId, meUser]);

  const statsToPass = ballType === 'overall' ? stats : (stats?.[ballType] || {});
  const mine = hasCareer(statsToPass, sportId);

  useEffect(() => {
    // Only offer the share action once there is a card to share — with no
    // career the capture target isn't even mounted.
    if (inline && mine) onRegisterFab?.(shareCard);
  }, [inline, mine, onRegisterFab, shareCard]);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false} {...hideTabBar} contentContainerStyle={{ paddingBottom: tabClear }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} colors={[DS.lime]} />}>
      {/* Hero */}
      {!inline && (
        <View style={styles.hero}>
          {/* The hero had no back affordance — it leaned on the navigator's, so
              hiding that without this would strand the standalone route. */}
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
            <Icon name="arrow-left" size={22} color={DS.textPrimary} />
          </TouchableOpacity>
          <Icon name="chart-bar" size={20} color={DS.lime} />
          <Text style={styles.heroTitle}>My Performance</Text>
        </View>
      )}

      <View style={styles.body}>
        {/* Only show the toggle if it's cricket (which uses ball types). Football etc don't need it. */}
        {sportId === 'cricket' && stats && (
          <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 }}>
            <SegmentedControl
              options={[
                { id: 'overall', label: 'OVERALL' },
                { id: 'leather', label: 'LEATHER' },
                { id: 'tennis', label: 'TENNIS' },
              ]}
              value={ballType}
              onChange={setBallType}
            />
          </View>
        )}

        {loading ? (
          <StatsSkeleton DS={DS} />
        ) : mine ? (
          <CareerBoard stats={statsToPass} sportId={sportId} navigation={navigation} captureRef={shotRef}>
            {/* Branding footer — only meaningful once the card is shared out,
                but harmless (and a subtle attribution) in-app. The icon follows
                the sport; it was a cricket bat on a footballer's card. */}
            <View style={styles.shareBrand}>
              <Icon name={getSport(sportId)?.icon || 'cricket'} size={13} color={DS.textMuted} />
              <Text style={styles.shareBrandText}>{meUser?.name ? `${meUser.name} · ` : ''}Local Legends</Text>
            </View>
          </CareerBoard>
        ) : (
          <View style={styles.centered}>
            <Icon name="chart-line" size={48} color={DS.textMuted} />
            <Text style={styles.emptyText}>No stats available yet</Text>
            <Text style={styles.emptySub}>Score or play a match and your career stats show up here.</Text>
            <TouchableOpacity style={styles.emptyCta} onPress={() => navigation.navigate('StreamingLanding')} activeOpacity={0.85}>
              <Icon name="broadcast" size={16} color={DS.live} />
              <Text style={styles.emptyCtaText}>Score a live match</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>);
}

const makeStyles = (DS) => StyleSheet.create({
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: DS.bg, paddingTop: 52, paddingBottom: 12, paddingHorizontal: 16
  },
  heroTitle: { fontSize: 24, fontWeight: '900', color: DS.textPrimary, letterSpacing: 0.5 },
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 },
  shareBrand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 4 },
  shareBrandText: { fontSize: 11, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.4 },
  emptyText: { fontSize: 16, color: DS.textVariant, marginTop: 12, fontWeight: '600' },
  emptySub: { fontSize: 13, color: DS.textMuted, marginTop: 6, textAlign: 'center', paddingHorizontal: 32, lineHeight: 19 },
  emptyCta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 24, borderWidth: 1.5, borderColor: DS.live },
  emptyCtaText: { fontSize: 14, fontWeight: '800', color: DS.live, letterSpacing: 0.3 }
});

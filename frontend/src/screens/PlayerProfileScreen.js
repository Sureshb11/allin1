import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Animated, RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import CareerBoard, { hasCareer } from '../components/CareerBoard';
import ShotBoard from '../components/ShotBoard';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { showToast } from '../components/Toast';
import { useCurrentUser } from '../utils/currentUser';
import { roleLabel } from '../utils/squadOrder';

// A player's career, opened from Rankings.
//
// It draws the SAME board as My Stats (components/CareerBoard) off the SAME
// payload (/players/:id/career → backend lib/playerCareer.js). It used to draw
// its own: colour-tinted bento tiles in Batting / Bowling / Fielding sections,
// fed by /players/:id/insights, which computed cricket a third way and got a
// two-ball over counted as a whole over. So the same career read differently
// depending on whether you were looking at yourself or at someone else, and
// there was no way to tell which screen was right.
//
// What stays particular to this screen: the hero (who this is), the standing
// carried in from the board you tapped, and the scouting read underneath.

const makeTrendConfig = (DS) => ({
  upward:   { icon: 'trending-up',      color: DS.lime,  label: 'Improving' },
  downward: { icon: 'trending-down',    color: DS.live,  label: 'Declining' },
  stable:   { icon: 'trending-neutral', color: DS.coral, label: 'Stable'    },
});

// Module scope, not inside the skeleton's render body. Declared there it was a
// new component type every render, so React remounted every bar instead of
// updating it — which restarts the shimmer, so the one continuous sweep this
// is meant to be was stuttering back to the start.
const Bar = ({ w, h, r = 6, DS, pulse }) => (
  <Animated.View style={{ width: w, height: h, borderRadius: r, backgroundColor: DS.surfaceHigh, opacity: pulse }} />
);

function Section({ title, icon, children }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {icon && <Icon name={icon} size={16} color={DS.lime} />}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

// Same shape-matching placeholder as My Stats, so both screens settle the same way.
function BoardSkeleton({ DS }) {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.75, duration: 900, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={{ gap: 10 }}>
      <View style={{ backgroundColor: DS.surface, borderRadius: 16, borderWidth: 1, borderColor: DS.border, padding: 13, gap: 12 }}>
        <Bar DS={DS} pulse={pulse} w="45%" h={10} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[0, 1, 2, 3, 4].map((i) => <Bar DS={DS} pulse={pulse} key={i} w={28} h={28} r={14} />)}
        </View>
      </View>
      <View style={{ backgroundColor: DS.surface, borderRadius: 16, borderWidth: 1, borderColor: DS.border, padding: 13 }}>
        {[0, 1, 2].map((r) => (
          <View key={r} style={{ flexDirection: 'row', paddingVertical: 9 }}>
            {[0, 1, 2].map((c) => (
              <View key={c} style={{ flex: 1, gap: 6 }}>
                <Bar DS={DS} pulse={pulse} w="55%" h={16} />
                <Bar DS={DS} pulse={pulse} w="72%" h={8} />
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

export default function PlayerProfileScreen({ route, navigation }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const { playerId, player: passed, standing, boardLabel } = route.params || {};
  const meUser = useCurrentUser();

  const [career, setCareer] = useState(null);
  // Follow state is the server's answer, seeded from the career response so the
  // button paints correctly on open instead of flashing "Follow" for someone you
  // already follow. Toggling is optimistic, then reconciled.
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  // Whether the career has answered yet. Until it has we do not know if this is
  // your OWN profile, and `isMe` reads false by default — so the Follow pill
  // painted on open and then vanished a moment later on your own page.
  const [identityKnown, setIdentityKnown] = useState(false);
  const followFade = useRef(new Animated.Value(0)).current;
  
  const [shotData, setShotData] = useState(null);   // { shots, analytics, insights, player }
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useLayoutEffect(() => {
    // This screen draws its own hero — back button, avatar, name, role and team —
    // so the navigator's default header was a second bar above it, in the light
    // system styling every other screen in this stack opts out of.
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const load = useCallback(() => {
    const careerReq = legendsApi.getPlayerCareer(playerId);
    // Gate the Follow pill on the CAREER settling rather than on `loading`,
    // which also waits for the shot fetch below. Waiting for both would hold the
    // pill back long after we already knew the answer.
    careerReq.finally(() => setIdentityKnown(true));

    return Promise.all([
      careerReq,
      
      // Kept a SEPARATE fetch from the career on purpose: shot data covers only
      // the deliveries somebody chose to capture, which for a long time will be a
      // thin and uneven slice. Folding it into the career board would make those
      // numbers quietly mean something different depending on whether a scorer
      // happened to switch the feature on that day.
      legendsApi.getPlayerShots(playerId),
    ]).then(([c, sh]) => {
      if (c.success) { setCareer(c.data); setFollowing(!!c.data?.following); }
      
      if (sh.success) setShotData(sh.data);
    });
  }, [playerId]);

  const toggleFollow = useCallback(async () => {
    if (!playerId || followBusy) return;
    setFollowBusy(true);
    const next = !following;
    setFollowing(next);                       // optimistic
    // The header counts THIS player's followers, and you are one of them the
    // moment you tap. Without moving it, the pill said Following while the
    // number beside it still read the old total until a pull-to-refresh.
    const bump = (d) => setCareer((c) => (c ? { ...c, followerCount: Math.max(0, (c.followerCount || 0) + d) } : c));
    bump(next ? 1 : -1);
    const res = await legendsApi.toggleFollowPlayer(playerId);
    if (res.success) {
      setFollowing(res.following);
      // Reconcile against what the server actually did, in case it disagreed
      // with the optimistic guess (a double tap, or a stale `following`).
      if (res.following !== next) bump(res.following ? 1 : -1);
      showToast(res.following ? `Following ${name}` : `Unfollowed ${name}`, 'success');
    } else {
      setFollowing(!next);                    // put it back
      bump(next ? -1 : 1);
      showToast('Could not update follow', 'error');
    }
    setFollowBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, following, followBusy]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const stats = career?.stats || null;

  // Who this is. The tapped row already carries most of it, so the hero paints
  // before the fetch returns.
  // Your own profile: the career response carries the player's linked userId.
  const isMe = !!meUser?.id && career?.player?.userId === meUser.id;
  const name = passed?.name || career?.player?.name || 'Player';
  const teamName = passed?.team || career?.team || '';
  const sportId = passed?.sport || career?.sport;

  // The same fold every squad list uses. This screen was the one place printing
  // the role raw, so a player read "Wicket Keeper" here and "Wicketkeeper" in
  // the squad two taps away.
  const role = roleLabel(passed?.role || career?.role || career?.player?.role, sportId);

  // What to write under the name — and nothing at all when we know nothing. The
  // fallback used to be the literal string 'Cricketer', which printed under
  // badminton players; the sport-aware version of it is no better, because
  // `competitorLabel` is a word for a SLOT ("Team" by default, "Player" for
  // badminton), not a description of anybody. An empty line is the honest
  // answer, and it is the one the squad lists already give.
  const heroSub = [role, teamName].filter(Boolean).join(' · ');

  // Counts ride along on the career response, so they cost nothing extra here.
  // Only drawn once it has answered: painting 0/0 first and then correcting is
  // the same flicker the Follow pill had.
  const followCounts = career
    ? [
        ['posts', career.postCount || 0, (career.postCount === 1) ? 'Post' : 'Posts'],
        ['followers', career.followerCount || 0, (career.followerCount === 1) ? 'Follower' : 'Followers'],
        ['following', career.followingCount || 0, 'Following'],
      ]
    : null;
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  // Rankings passes the row through, which carries the linked account's photo.
  const avatarUrl = passed?.avatarUrl || passed?.user?.avatarUrl || career?.player?.avatarUrl || null;

  // Fade in rather than snap: the pill is deliberately withheld for the length
  // of one request, so it lands after the hero has already painted.
  //
  // `meUser?.id` is part of the gate for the same reason as `identityKnown`:
  // opening a profile cold (from a push, say) can land the career before the
  // cached identity, and `isMe` reads false while we are still id-less. Waiting
  // for both means the pill paints once, in its final state. Never learning who
  // you are means staying hidden, which is right — following needs an account.
  const showFollow = !!playerId && identityKnown && !!meUser?.id && !isMe;
  useEffect(() => {
    Animated.timing(followFade, {
      toValue: showFollow ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [showFollow, followFade]);


  return (
    <View style={styles.container}>
      {/* Hero — who this is, and why you opened them */}
      <View style={styles.hero}>
        {navigation && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
            <Icon name="arrow-left" size={22} color={DS.textPrimary} />
          </TouchableOpacity>
        )}
        {avatarUrl
          ? <Image source={{ uri: avatarUrl }} style={styles.heroAvatarImg} />
          : <View style={styles.heroAvatar}><Text style={styles.heroAvatarTxt}>{initials}</Text></View>}
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle} numberOfLines={1}>{name}</Text>
          {!!heroSub && <Text style={styles.heroSub} numberOfLines={1}>{heroSub}</Text>}
        </View>
        {/* Carried from Rankings — the reason you opened this profile. */}
        {standing != null && (
          <View style={styles.rankPill}>
            <Text style={styles.rankPillNum}>#{standing}</Text>
            <Text style={styles.rankPillLbl} numberOfLines={1}>{(boardLabel || '').toLowerCase()}</Text>
          </View>
        )}
        {/* Following a player puts their matches in your circle feed — the same
            place the teams you follow appear. Hidden on your own profile: you
            cannot follow yourself, and the button would be nonsense there. */}
        {showFollow && (
          <Animated.View style={{ opacity: followFade }}>
          <TouchableOpacity
            style={[styles.followBtn, following && styles.followBtnOn]}
            onPress={toggleFollow}
            disabled={followBusy}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ selected: following }}
            accessibilityLabel={following ? `Unfollow ${name}` : `Follow ${name}`}
          >
            <Icon name={following ? 'account-check' : 'account-plus-outline'}
                  size={14} color={following ? DS.bg : DS.lime} />
            <Text style={[styles.followTxt, following && styles.followTxtOn]}>
              {following ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
          </Animated.View>
        )}
      </View>

      {/* Followers · Following, under the hero rather than in it: the hero row is
          already back arrow, avatar, name, an optional rank pill and the Follow
          button, and a phone has no width left in it. */}
      {!!followCounts && !!playerId && (
        <View style={styles.followStats}>
          {followCounts.map(([key, count, label], i) => (
            <View key={key} style={styles.followStatWrap}>
              {i > 0 && <View style={styles.followDivider} />}
              <TouchableOpacity
                style={styles.followStat}
                activeOpacity={0.7}
                onPress={() => (key === 'posts'
                  // career.sport first, not sportId: the count was taken in the
                  // player's OWN sport server-side, while sportId prefers what
                  // the row that opened this screen carried. When those differ
                  // the header and the list it opens disagree.
                  ? navigation.navigate('PlayerPosts', { playerId, name, sport: career?.sport || sportId })
                  : navigation.navigate('FollowList', { playerId, name, initialTab: key }))}
                accessibilityRole="button"
                accessibilityLabel={`${count} ${label}`}>
                <Text style={styles.followStatNum}>{count}</Text>
                <Text style={styles.followStatLbl}>{label}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} colors={[DS.lime]} />}>
        <View style={styles.body}>
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

          {/* Where this batter actually scores. Rendered only when there is shot
              data at all — the feature is optional, so an empty wagon wheel on
              every player who has never been tracked would be noise, not a gap
              they need telling about. */}
          {!loading && sportId === 'cricket' && !!shotData?.shots?.length && (
            <ShotBoard
              shots={shotData.shots}
              summary={{
                topZones: shotData.analytics?.byZone?.slice(0, 5) || [],
                topShots: shotData.analytics?.byShot?.slice(0, 5) || [],
              }}
              insights={shotData.insights}
              dna={shotData.dna}
              benchmark={shotData.benchmark}
              hand={shotData.player?.hand || 'right'}
              showHand   // one player, so naming the hand is the fact that makes the wheel readable
              title="SHOT PROFILE"
              subtitle="Across every tracked innings"
              style={{ marginTop: 16 }}
            />
          )}

          
          
          {!loading && sportId && sportId !== 'cricket' && (
            <View style={[styles.empty, { marginTop: 16 }]}>
              <Icon name="chart-donut" size={44} color={DS.textMuted} />
              <Text style={styles.emptyTitle}>Analysis not available</Text>
              <Text style={styles.emptySub}>Advanced statistics and insights are coming soon for {sportId}.</Text>
            </View>
          )}

          
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 18, paddingHorizontal: 16,
  },
  backBtn: { padding: 4 },

  followStats: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: DS.surfaceLow, paddingBottom: 14, paddingHorizontal: 12,
  },
  followStatWrap: { flexDirection: 'row', alignItems: 'center' },
  followStat: { alignItems: 'center', paddingHorizontal: 18, paddingVertical: 4 },
  followStatNum: { fontSize: 18, fontWeight: '900', color: DS.textPrimary, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  followStatLbl: { fontSize: 10.5, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.6, marginTop: 1 },
  followDivider: { width: StyleSheet.hairlineWidth, height: 24, backgroundColor: DS.surfaceHighest },

  heroAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center' },
  heroAvatarImg: { width: 44, height: 44, borderRadius: 22, backgroundColor: DS.surfaceHighest },
  heroAvatarTxt: { color: DS.onLime, fontWeight: '800', fontSize: 16 },
  heroTitle: { fontSize: 20, fontWeight: '800', color: DS.textPrimary },
  heroSub: { fontSize: 12, color: DS.textMuted, marginTop: 2 },
  rankPill: {
    alignItems: 'center', justifyContent: 'center', minWidth: 54,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: DS.lime + '1f', borderRadius: 12, borderWidth: 1, borderColor: DS.lime,
  },
  rankPillNum: { fontSize: 16, fontWeight: '900', color: DS.lime, letterSpacing: -0.4 },
  followBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: DS.lime, backgroundColor: 'transparent',
  },
  followBtnOn: { backgroundColor: DS.lime },
  followTxt: { fontSize: 12.5, fontWeight: '800', color: DS.lime },
  followTxtOn: { color: DS.bg },
  rankPillLbl: { fontSize: 8.5, fontWeight: '800', color: DS.lime, letterSpacing: 0.4, textTransform: 'uppercase' },

  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32, gap: 10 },

  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: DS.textVariant, marginTop: 6 },
  emptySub: { fontSize: 12.5, color: DS.textMuted, textAlign: 'center', paddingHorizontal: 28, lineHeight: 18 },

  /* Scouting read — same card chrome as the board above it. */
  section: { backgroundColor: DS.surface, borderRadius: 16, borderWidth: 1, borderColor: DS.border, padding: 13, gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: DS.textPrimary, letterSpacing: 0.2 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trendLabel: { fontSize: 12.5, fontWeight: '800' },
  trendForm: { fontSize: 11.5, color: DS.textMuted, fontWeight: '600' },
  analysisRow: { flexDirection: 'row', gap: 12 },
  analysisBox: { flex: 1, gap: 6 },
  analysisHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  analysisTitle: { fontSize: 11.5, fontWeight: '800' },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  bullet: { width: 5, height: 5, borderRadius: 2.5, marginTop: 6 },
  bulletText: { flex: 1, fontSize: 12, color: DS.textPrimary, lineHeight: 18 },
  noData: { fontSize: 11.5, color: DS.textMuted, fontStyle: 'italic' },

  recRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  recNum: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  recNumText: { fontSize: 10.5, fontWeight: '900', color: DS.onLime },
  recText: { flex: 1, fontSize: 12.5, color: DS.textPrimary, lineHeight: 19 },
});

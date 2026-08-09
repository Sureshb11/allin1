import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { haptic } from '../utils/haptics';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import PlayerRoleFields from '../components/PlayerRoleFields';
import { validateHowIPlay } from '../sports/cricketProfile';
import Shimmer from '../components/Shimmer';
import { markPlayerSetup } from '../utils/playerSetup';
import legendsApi from '../services/LegendsApi';
import { showToast } from '../components/Toast';
import ThemeToggleButton from '../components/ThemeToggleButton';

// The one question the app asks on the way into cricket: do you play?
//
// It has to be asked, because until now nothing ever did — you signed up with a
// phone number and a name and the app decided you were a "Player" with no role,
// which is why the database holds eight spellings of four roles and why squads
// sort by whatever a team admin happened to type.
//
// And it has to be SKIPPABLE, because a large share of the people who open this
// app are not players. They are a parent, a partner, a friend following a match.
// Asking them what kind of bowler they are, and not letting them past until they
// answer, would be asking the wrong person the wrong question at the worst
// moment — they opened the app to watch a game that is happening now.
//
// So: two doors, both of which lead into the app. Answered either way, it never
// asks again (utils/playerSetup), and either answer can be changed later in
// Edit Profile — which is the same three fields, from the same component.
export default function PlayerSetupScreen({ navigation, route }) {
  const DS = useTheme().colors;
  const s = useThemedStyles(makeStyles);
  const sport = route.params?.sport;
  const sportId = sport?.id || 'cricket';
  const sportName = sport?.label || sport?.name || 'cricket';

  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState('ask');            // 'ask' | 'form'
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [profile, setProfile] = useState({ primaryRole: null, battingStyle: null, bowlingStyle: null });

  const enter = async (answer) => {
    await markPlayerSetup(sportId, answer);
    navigation.reset({ index: 0, routes: [{ name: 'MainApp', params: { sport } }] });
  };

  // Someone who already has a role on their player record has answered this
  // before — on another device, or by editing their profile. Ask them again and
  // the question looks broken. Straight through, and remember it locally.
  //
  // On a failure this falls through to the question rather than blocking: the
  // step is skippable, so the worst case of guessing wrong is one extra tap,
  // and a spinner that never resolves would be the worst case of guessing the
  // other way.
  useEffect(() => {
    let live = true;
    legendsApi.getUserProfile().then((res) => {
      if (!live) return;
      const p = res?.player || null;
      if (p?.role && p.role !== 'Player' && p.battingStyle) {
        enter('player');
        return;
      }
      // Anything already on record pre-fills, so a half-finished profile is
      // finished rather than re-typed.
      if (p) {
        setProfile((prev) => ({
          ...prev,
          primaryRole: p.role && p.role !== 'Player' ? p.role : null,
          battingStyle: p.battingStyle || null,
          bowlingStyle: p.bowlingStyle || null,
        }));
      }
      setChecking(false);
    }).catch(() => live && setChecking(false));
    return () => { live = false; };
  }, []);

  const save = async () => {
    haptic.tick();
    const problems = validateHowIPlay(profile);
    setErrors(problems);
    if (Object.keys(problems).length) return;

    setSaving(true);
    const res = await legendsApi.saveMyPlayer({
      sport: sportId,
      role: profile.primaryRole,
      battingStyle: profile.battingStyle,
      bowlingStyle: profile.bowlingStyle,
    });
    setSaving(false);
    if (!res.success) {
      // Never a dead end: this step is optional, so a failed save must not trap
      // anyone outside the app. Say so, and leave them on the form to retry.
      showToast(res.error || 'Could not save that — try again, or skip for now.', 'error');
      return;
    }
    enter('player');
  };

  if (checking) {
    return (
      <SafeAreaView style={s.screen}>
        <ThemeToggleButton style={{ position: 'absolute', top: 56, right: 24, zIndex: 10 }} />
        <View style={s.center}>
          <Shimmer width={120} height={120} borderRadius={60} style={{ marginBottom: 32 }} />
          <Shimmer width="80%" height={32} style={{ marginBottom: 16 }} />
          <Shimmer width="60%" height={20} style={{ marginBottom: 40 }} />
          <Shimmer width="100%" height={64} borderRadius={24} style={{ marginBottom: 16 }} />
          <Shimmer width="100%" height={64} borderRadius={24} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Door 1: which of the two are you? ──
  if (step === 'ask') {
    return (
      <SafeAreaView style={s.screen}>
        <ThemeToggleButton style={{ position: 'absolute', top: 16, right: 24, zIndex: 10 }} />
        <View style={s.body}>
          <View style={s.badge}>
            <Icon name={sport.icon || sport.mci || 'star'} size={13} color={DS.lime} />
            <Text style={s.badgeText}>{String(sportName).toUpperCase()}</Text>
          </View>
          <Text style={s.h1}>Do you play?</Text>
          <Text style={s.sub}>
            Just so we know how to list you. You can change it any time in your profile.
          </Text>

          <TouchableOpacity style={s.choice} activeOpacity={0.85} onPress={() => setStep('form')}>
            <View style={[s.choiceIcon, { backgroundColor: DS.lime }]}>
              <Icon name={sport.icon || sport.mci || 'star'} size={21} color={DS.onLime} />
            </View>
            <View style={s.choiceText}>
              <Text style={s.choiceTitle}>Yes, I play</Text>
              <Text style={s.choiceBlurb}>Set up your player profile for the team</Text>
            </View>
            <Icon name="chevron-right" size={20} color={DS.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={s.choice} activeOpacity={0.85} onPress={() => enter('watching')}>
            <View style={s.choiceIcon}>
              <Icon name="eye-outline" size={21} color={DS.textVariant} />
            </View>
            <View style={s.choiceText}>
              <Text style={s.choiceTitle}>I'm here to watch</Text>
              <Text style={s.choiceBlurb}>Follow matches, teams and players. Nothing to fill in</Text>
            </View>
            <Icon name="chevron-right" size={20} color={DS.textMuted} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Door 2: the three questions ──
  return (
    <SafeAreaView style={s.screen}>
      <ThemeToggleButton style={{ position: 'absolute', top: 56, right: 24, zIndex: 11 }} />
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => setStep('ask')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="chevron-left" size={26} color={DS.textPrimary} />
        </TouchableOpacity>
        {/* Skip stays visible on this step too. Deciding you play is not a
            commitment to filling in a form right now. */}
        <TouchableOpacity onPress={() => enter('skipped')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.skip}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.formBody} keyboardShouldPersistTaps="handled">
        <Text style={s.h1}>How do you play?</Text>
        <Text style={s.sub}>This is how you'll appear in a squad list and on a scorecard.</Text>

        <View style={{ height: 22 }} />
        <PlayerRoleFields value={profile} onChange={setProfile} errors={errors} />
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity style={[s.cta, saving && { opacity: 0.6 }]} onPress={save} disabled={saving} activeOpacity={0.85}>
          {saving
            ? <ActivityIndicator color={DS.onLime} />
            : <Text style={s.ctaText}>Save & continue</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: DS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 40 },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: DS.lime + '1a', marginBottom: 16,
  },
  badgeText: { fontSize: 10, fontWeight: '900', color: DS.lime, letterSpacing: 1 },

  h1: { fontSize: 30, fontWeight: '900', color: DS.textPrimary, letterSpacing: -0.6 },
  sub: { fontSize: 13.5, fontWeight: '600', color: DS.textMuted, marginTop: 8, lineHeight: 19, marginBottom: 28 },

  choice: {
    flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, marginBottom: 12,
    borderRadius: 18, backgroundColor: DS.surfaceHigh, borderWidth: 1.5, borderColor: DS.border,
  },
  choiceIcon: {
    width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: DS.surfaceHighest,
  },
  choiceText: { flex: 1 },
  choiceTitle: { fontSize: 15.5, fontWeight: '900', color: DS.textPrimary },
  choiceBlurb: { fontSize: 11.5, fontWeight: '600', color: DS.textMuted, marginTop: 3, lineHeight: 15 },

  topBar: {
    position: 'absolute', top: 40, left: 0, right: 0, zIndex: 10,
    backgroundColor: DS.bg + 'E6', // Glassmorphism translucent
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 12, paddingBottom: 12,
  },
  skip: { fontSize: 14, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.2 },

  formBody: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 30 },

  footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 18 },
  cta: {
    height: 52, borderRadius: 15, backgroundColor: DS.lime,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { fontSize: 15, fontWeight: '900', color: DS.onLime || '#ffffff', letterSpacing: 0.3 },
});

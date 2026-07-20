// MatchSetupScreen — pre-match setup for every sport except cricket.
//
// Football (and the rest) used to jump straight from "create match" into
// scoring, with no squads recorded at all — so a goal could never be attributed
// to a player, and the coin toss simply wasn't captured. Cricket has had this
// via TossLineupScreen, but that screen is bat-or-bowl shaped (bat-flip
// animation, "elected to bat", batting/bowling sides on the innings), so it
// can't be reused as-is.
//
// Two steps, both real:
//   1. Coin toss — who won, and what they chose. Sport-agnostic wording.
//   2. Squads — tap to include/exclude; the whole roster is pre-selected, since
//      that is the common case for a local match.
//
// Saved via POST /matches/:id/setup, which also puts the match live.

import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { useTheme } from '../theme/ThemeContext';
import { haptic } from '../utils/haptics';

// Squad caps by sport. Generous enough to cover subs; a local side rarely
// fields the full bench, so this is an upper bound, not a requirement.
const SQUAD_MAX = {
  football: 18, hockey: 18, kabaddi: 12, basketball: 12, volleyball: 14,
  handball: 14, khokho: 12, tennis: 2, badminton: 4, tabletennis: 4,
  squash: 2, pickleball: 4,
};

// What the toss winner actually picks, per sport.
const TOSS_CHOICES = {
  football: ['Kick off', 'Choose ends'],
  hockey:   ['Push back', 'Choose ends'],
  kabaddi:  ['Raid first', 'Choose court'],
  default:  ['Start', 'Choose ends'],
};

export default function MatchSetupScreen({ route, navigation }) {
  const { colors: DS } = useTheme();
  const s = useMemo(() => makeStyles(DS), [DS]);

  const { matchId, team1, team2, team1Id, team2Id, sport, matchType, venue } = route.params || {};
  const sportId = sport?.id || 'football';
  const maxSquad = SQUAD_MAX[sportId] || 15;
  const choices = TOSS_CHOICES[sportId] || TOSS_CHOICES.default;

  const [rosters, setRosters] = useState({ [team1Id]: [], [team2Id]: [] });
  const [xi, setXI] = useState({ [team1Id]: [], [team2Id]: [] });
  const [activeTeam, setActiveTeam] = useState(team1Id);
  const [tossWinner, setTossWinner] = useState(null);   // nothing preset — record the real toss
  const [choice, setChoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      legendsApi.getPlayers({ teamId: team1Id }),
      legendsApi.getPlayers({ teamId: team2Id }),
    ]).then(([r1, r2]) => {
      if (!alive) return;
      const a = r1.success ? r1.data : [];
      const b = r2.success ? r2.data : [];
      setRosters({ [team1Id]: a, [team2Id]: b });
      // Pre-select the squad up to the cap — the usual case is "everyone plays".
      setXI({
        [team1Id]: a.slice(0, maxSquad).map((p) => p.id),
        [team2Id]: b.slice(0, maxSquad).map((p) => p.id),
      });
      setLoading(false);
    });
    return () => { alive = false; };
  }, [team1Id, team2Id, maxSquad]);

  const toggle = (teamId, playerId) => {
    haptic.tick?.();
    setXI((cur) => {
      const list = cur[teamId] || [];
      if (list.includes(playerId)) return { ...cur, [teamId]: list.filter((id) => id !== playerId) };
      if (list.length >= maxSquad) {
        Alert.alert('Squad full', `You can pick up to ${maxSquad} players. Remove one first.`);
        return cur;
      }
      return { ...cur, [teamId]: [...list, playerId] };
    });
  };

  const start = async () => {
    if (!tossWinner || !choice) return Alert.alert('Record the toss', 'Pick who won the toss and what they chose.');
    const a = xi[team1Id] || [], b = xi[team2Id] || [];
    if (!a.length || !b.length) return Alert.alert('Squads needed', 'Both teams need at least one player.');

    setSaving(true);
    const res = await legendsApi.submitMatchSetup(matchId, {
      tossWinnerId: tossWinner,
      choice,
      squads: [{ teamId: team1Id, playerIds: a }, { teamId: team2Id, playerIds: b }],
    });
    setSaving(false);
    if (!res.success) return Alert.alert('Could not start', res.error || 'Please try again.');

    navigation.replace('SportScoring', {
      match: {
        id: matchId, team1, team2, team1Id, team2Id,
        venue, matchType, sport: sportId,
      },
      sport,
    });
  };

  const teamName = (id) => (id === team1Id ? team1 : team2);
  const roster = rosters[activeTeam] || [];
  const picked = xi[activeTeam] || [];

  if (loading) {
    return <View style={s.centered}><ActivityIndicator size="large" color={DS.lime} /></View>;
  }

  return (
    <View style={s.root}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={22} color={DS.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Match Setup</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {/* ── 1. Toss ── */}
        <Text style={s.stepLabel}>1 · TOSS</Text>
        <Text style={s.hint}>Who won the toss?</Text>
        <View style={s.row}>
          {[team1Id, team2Id].map((id) => (
            <TouchableOpacity key={id} activeOpacity={0.85}
              style={[s.pick, tossWinner === id && s.pickOn]}
              onPress={() => { haptic.tick?.(); setTossWinner(id); }}>
              <Text style={[s.pickTxt, tossWinner === id && s.pickTxtOn]} numberOfLines={1}>{teamName(id)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {!!tossWinner && (
          <>
            <Text style={s.hint}>They chose to…</Text>
            <View style={s.row}>
              {choices.map((c) => (
                <TouchableOpacity key={c} activeOpacity={0.85}
                  style={[s.pick, choice === c && s.pickOn]}
                  onPress={() => { haptic.tick?.(); setChoice(c); }}>
                  <Text style={[s.pickTxt, choice === c && s.pickTxtOn]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* ── 2. Squads ── */}
        <Text style={[s.stepLabel, { marginTop: 22 }]}>2 · SQUADS</Text>
        <View style={s.teamTabs}>
          {[team1Id, team2Id].map((id) => (
            <TouchableOpacity key={id} activeOpacity={0.85}
              style={[s.teamTab, activeTeam === id && s.teamTabOn]}
              onPress={() => setActiveTeam(id)}>
              <Text style={[s.teamTabTxt, activeTeam === id && s.teamTabTxtOn]} numberOfLines={1}>
                {teamName(id)}
              </Text>
              <Text style={[s.teamTabCount, activeTeam === id && s.teamTabTxtOn]}>
                {(xi[id] || []).length}/{maxSquad}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {roster.length === 0 ? (
          <Text style={s.empty}>No players in this team yet. Add them from the team page.</Text>
        ) : (
          roster.map((p) => {
            const on = picked.includes(p.id);
            return (
              <TouchableOpacity key={p.id} activeOpacity={0.8}
                style={[s.playerRow, on && s.playerRowOn]}
                onPress={() => toggle(activeTeam, p.id)}>
                <View style={[s.check, on && s.checkOn]}>
                  {on && <Icon name="check" size={14} color={DS.onLime || '#fff'} />}
                </View>
                <Text style={[s.playerName, on && s.playerNameOn]} numberOfLines={1}>{p.name}</Text>
                <Text style={s.playerRole}>{p.role || 'Player'}</Text>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity style={[s.cta, saving && { opacity: 0.6 }]} onPress={start} disabled={saving} activeOpacity={0.9}>
          {saving
            ? <ActivityIndicator color={DS.onLime || '#fff'} />
            : <><Icon name="play" size={20} color={DS.onLime || '#fff'} />
                <Text style={s.ctaTxt}>START MATCH</Text></>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  root: { flex: 1, backgroundColor: DS.bg, paddingTop: 44 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: DS.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '900', color: DS.textPrimary, letterSpacing: 0.4 },

  stepLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, color: DS.lime, marginBottom: 8 },
  hint: { fontSize: 13, color: DS.textMuted, marginBottom: 8, marginTop: 6 },
  row: { flexDirection: 'row', gap: 10 },
  pick: {
    flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center',
    backgroundColor: DS.surface, borderWidth: 1.5, borderColor: DS.line,
  },
  pickOn: { borderColor: DS.lime, backgroundColor: DS.lime + '14' },
  pickTxt: { fontSize: 14, fontWeight: '700', color: DS.textPrimary },
  pickTxtOn: { color: DS.lime },

  teamTabs: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  teamTab: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12,
    backgroundColor: DS.surface, borderWidth: 1, borderColor: DS.line, alignItems: 'center',
  },
  teamTabOn: { borderColor: DS.lime, backgroundColor: DS.lime + '14' },
  teamTabTxt: { fontSize: 13, fontWeight: '700', color: DS.textPrimary },
  teamTabTxtOn: { color: DS.lime },
  teamTabCount: { fontSize: 11, color: DS.textMuted, marginTop: 2 },

  playerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, backgroundColor: DS.surface, borderWidth: 1, borderColor: DS.line, marginBottom: 8,
  },
  playerRowOn: { borderColor: DS.lime + '66', backgroundColor: DS.lime + '0F' },
  check: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: DS.line,
    alignItems: 'center', justifyContent: 'center',
  },
  checkOn: { backgroundColor: DS.lime, borderColor: DS.lime },
  playerName: { flex: 1, fontSize: 15, fontWeight: '600', color: DS.textPrimary },
  playerNameOn: { color: DS.textPrimary },
  playerRole: { fontSize: 11, color: DS.textMuted },
  empty: { color: DS.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 24 },

  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: 16, paddingBottom: 28, backgroundColor: DS.bg, borderTopWidth: 1, borderColor: DS.line,
  },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    height: 54, borderRadius: 16, backgroundColor: DS.lime,
  },
  ctaTxt: { fontSize: 15, fontWeight: '800', letterSpacing: 2, color: DS.onLime || '#fff' },
});

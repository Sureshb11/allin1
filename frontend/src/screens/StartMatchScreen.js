import { useState, useEffect, useCallback, useMemo, useLayoutEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Modal, TextInput, FlatList,
  StatusBar, Animated
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { Typography, Spacing, Radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { getStartFormat as getSportFormat } from '../sports/start';
import { getSport } from '../sports';
import { getSelectedSport } from '../utils/selectedSport';
import GradientButton from '../components/GradientButton';
import HexAvatar from '../components/HexAvatar';
import { showToast } from '../components/Toast';
import { useTabBarClearance } from '../components/AutoHideTabBar';

/* ─── Kinetic Athlete Design Tokens ─────────────────────── */
// Themed palette factory (faithful in dark; adapts to light). `black` is the
// on-accent text colour (dark text on bright lime / light text on olive lime),
// so it maps to bg, which flips correctly with the theme.
const makeK = (c) => ({
  bg:           c.bg,
  surfaceLow:   c.surfaceLow,
  surfaceHigh:  c.surfaceHigh,
  surfaceTop:   c.surfaceHighest,
  lime:         c.lime,
  limeDim:      c.lime + '30',
  blue:         c.lime,          // single-accent: "blue" folds into the green accent
  blueDim:      c.lime + '20',
  text:         c.textPrimary,
  textVariant:  c.textVariant,
  textMuted:    c.textMuted,
  overlay:      c.overlay,
  white:        '#ffffff',
  black:        c.bg,
});

/* ─── Match formats (per sport) ──────────────────────────── */
const BALL_TYPES = [
  { label: 'Leather', icon: 'cricket' },
  { label: 'Tennis',  icon: 'tennis-ball' },
  { label: 'Rubber',  icon: 'circle-outline' },
];

// Quick fixture slots, computed relative to now. Includes near-term options so
// a scheduled match can be created and start-tested the same day.
const buildSlots = () => {
  const at = (dayOffset, h, m = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const inHrs = (h) => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + h); return d; };
  const now = new Date();
  const todayEve = at(0, 18);
  return [
    { label: 'In 1 hr', date: inHrs(1) },
    // "Today, 6 PM" only if it hasn't passed; otherwise skip to tomorrow slots.
    ...(todayEve > now ? [{ label: 'Today 6 PM', date: todayEve }] : []),
    { label: 'Tmrw 10 AM', date: at(1, 10) },
    { label: 'Tmrw 6 PM', date: at(1, 18) },
    { label: 'Sat 10 AM', date: (() => { const d = at(0, 10); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); return d; })() },
  ];
};
const SCHEDULE_SLOTS = buildSlots();

/* ─── TeamPicker bottom-sheet ────────────────────────────── */
const TeamPicker = ({ visible, onClose, onSelect, excludeId, title, sport = 'cricket' }) => {
  const c = useTheme().colors;
  const K = useMemo(() => makeK(c), [c]);
  const s = useMemo(() => makeS(K), [K]);
  const [teams, setTeams]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [query, setQuery]       = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName]   = useState('');
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setCreating(false);
    setNewName('');
    setLoading(true);
    legendsApi.getTeams(sport).then(res => {
      setTeams(res.success ? (res.data || []) : []);
      setLoading(false);
    });
  }, [visible, sport]);

  const filtered = teams.filter(t =>
    t.id !== excludeId &&
    (t.name || '').toLowerCase().includes(query.toLowerCase())
  );

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    const res = await legendsApi.createTeam({ name, sport });
    setSaving(false);
    if (res.success && res.data) {
      // A brand-new team has no players yet. Keep `players` defined (default [])
      // so the empty-squad guard sees 0 — otherwise the create response omits it,
      // the count reads "unknown", and START SCORING stays enabled only to be
      // rejected by the server. res.data wins if it already carries players.
      onSelect({ players: [], ...res.data });
    } else {
      showToast('Could not create team. Try again.', 'error');
    }
  };

  const TeamRow = useCallback(({ item }) => (
    <TouchableOpacity style={s.teamRow} onPress={() => onSelect(item)} activeOpacity={0.75}>
      <View style={s.teamRowAvatar}>
        <Text style={s.teamRowInitial}>{(item.name || '?').charAt(0).toUpperCase()}</Text>
      </View>
      <View style={s.teamRowInfo}>
        <Text style={s.teamRowName}>{item.name}</Text>
        {item.players !== undefined && (
          <Text style={s.teamRowSub}>
            {Array.isArray(item.players) ? item.players.length : item.players} players
          </Text>
        )}
      </View>
      <Icon name="chevron-right" size={18} color={K.textMuted} />
    </TouchableOpacity>
  ), [onSelect]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.pickerOverlay}>
        <View style={s.pickerSheet}>
          {/* Handle + header */}
          <View style={s.sheetHandle} />
          <View style={s.pickerHeader}>
            <Text style={s.pickerTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Icon name="close" size={22} color={K.textMuted} />
            </TouchableOpacity>
          </View>

          {!creating ? (
            <>
              {/* Search */}
              <View style={s.searchBar}>
                <Icon name="magnify" size={18} color={K.textMuted} />
                <TextInput
                  style={s.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search teams..."
                  placeholderTextColor={K.textMuted}
                  autoCapitalize="none"
                />
              </View>

              {/* Create new team button */}
              <TouchableOpacity
                style={s.createTeamBtn}
                onPress={() => setCreating(true)}
                activeOpacity={0.8}
              >
                <View style={s.createTeamIcon}>
                  <Icon name="plus" size={18} color={K.lime} />
                </View>
                <Text style={s.createTeamLabel}>Create New Team</Text>
                <Icon name="chevron-right" size={16} color={K.lime} />
              </TouchableOpacity>

              {/* Team list */}
              {loading ? (
                <View style={s.pickerLoader}>
                  <ActivityIndicator color={K.lime} />
                  <Text style={s.pickerLoaderText}>Loading teams...</Text>
                </View>
              ) : filtered.length === 0 ? (
                <View style={s.pickerEmpty}>
                  <Icon name="account-group-outline" size={44} color={K.surfaceTop} />
                  <Text style={s.pickerEmptyText}>
                    {query ? 'No teams match your search' : 'No teams yet. Create one above.'}
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={filtered}
                  keyExtractor={item => String(item.id)}
                  renderItem={({ item }) => <TeamRow item={item} />}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 24 }}
                  ItemSeparatorComponent={() => <View style={s.separator} />}
                />
              )}
            </>
          ) : (
            /* Create team inline */
            <View style={s.createForm}>
              <Text style={s.createFormLabel}>New Team Name</Text>
              <TextInput
                style={s.createFormInput}
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Mumbai Warriors"
                placeholderTextColor={K.textMuted}
                autoFocus
                maxLength={40}
              />
              <View style={s.createFormActions}>
                <TouchableOpacity
                  style={s.cancelBtn}
                  onPress={() => setCreating(false)}
                >
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.saveBtn, !newName.trim() && s.saveBtnDisabled]}
                  onPress={handleCreate}
                  disabled={!newName.trim() || saving}
                >
                  {saving
                    ? <ActivityIndicator color={K.black} size="small" />
                    : <Text style={s.saveBtnText}>Create & Select</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

/* ─── StartMatchScreen ───────────────────────────────────── */
const StartMatchScreen = ({ navigation, route }) => {
  const { colors: c, isDark } = useTheme();
  const K = useMemo(() => makeK(c), [c]);
  const s = useMemo(() => makeS(K), [K]);
  const tabClear = useTabBarClearance();   // keep CREATE clear of the floating dock
  // Fall back to the sport the user is actually in, not cricket: the dock's
  // create-match button navigates here without params, which otherwise showed
  // a football player T20 formats, overs and cricket ball types.
  const sport = route.params?.sport || getSelectedSport().sport
    || { id: 'cricket', name: 'Cricket', icon: 'cricket' };
  const sportDef = getSport(sport.id);
  const indiv = !!sportDef?.individual;          // 1v1 sports → "Player" not "Team"
  const COMP = sportDef?.competitorLabel || 'Team';
  const sportFmt = getSportFormat(sport.id);
  const FORMATS = sportFmt.formats;
  const isCricket = sport.id === 'cricket';
  const [format, setFormat]     = useState(FORMATS[0]);
  const [overs, setOvers]       = useState(String(FORMATS[0].value));
  const [ballType, setBallType] = useState('Leather');
  const [venue, setVenue]       = useState('');
  // 'now' → toss & score immediately; a Date → schedule as an Upcoming fixture.
  const [scheduleAt, setScheduleAt] = useState(null);
  
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());

  const [team1, setTeam1]       = useState(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  useLayoutEffect(() => {
    // No nav header: it read "Start Match" directly above this screen's own
    // "CREATE NEW MATCH" headline — the same thing twice, costing the top third
    // of the screen. The back arrow moves into the body (as on TournamentDetail),
    // so losing the header doesn't strand anyone.
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const [team2, setTeam2]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const [picker, setPicker]     = useState(null); // 'team1' | 'team2' | null

  const selectTeam = (team) => {
    if (picker === 'team1') setTeam1(team);
    else setTeam2(team);
    setPicker(null);
  };

  const handleFormatPress = (f) => {
    setFormat(f);
    if (f.label !== 'Custom') setOvers(String(f.value));
  };

  const onCreate = async () => {
    if (!team1) return showToast(`Select ${COMP} 1`, 'error');
    if (!team2) return showToast(`Select ${COMP} 2`, 'error');
    if (team1.id === team2.id) return showToast(`${COMP}s must be different`, 'error');
    // A match needs a squad — the inline "Squad needed" card + disabled button
    // already communicate this, so just guard here (no raw alert).
    const pc = (t) => Array.isArray(t.players) ? t.players.length : (typeof t.players === 'number' ? t.players : null);
    if (pc(team1) === 0 || pc(team2) === 0) return;
    const parsedOvers = parseInt(overs, 10);
    if (!parsedOvers || parsedOvers < 1) return showToast(`Enter valid ${sportFmt.unit.toLowerCase()}`, 'error');

    setLoading(true);
    try {
      const matchRes = await legendsApi.createMatch({
        team1Id: team1.id,
        team2Id: team2.id,
        overs: parsedOvers,
        venue: venue.trim(),
        matchType: format.label,
        ...(isCricket ? { ballType } : {}),
        status: 'scheduled',
        ...(scheduleAt ? { startTime: scheduleAt.toISOString() } : {}),
        sport: sport.id,
      });

      if (!matchRes.success) {
        showToast(matchRes.error || 'Failed to create match', 'error');
        return;
      }

      // Scheduled for later → leave it as an Upcoming fixture; start it from
      // My Matches (its START button) when it's time.
      if (scheduleAt) {
        showToast('Match scheduled ✓', 'success');
        // Back to the Home feed with a clean stack — don't leave the create form
        // (or push a separate matches page) behind it.
        navigation.reset({
          index: 0,
          routes: [{ name: sport.id === 'cricket' ? 'CricketFeed' : 'SportFeed' }],
        });
        return;
      }

      // Non-cricket sports go through their own pre-match setup (coin toss +
      // squads) before scoring. They used to jump straight into the scorer with
      // no squads recorded at all, which meant a goal could never be attributed
      // to a player. Cricket keeps its toss → lineup → ball-by-ball flow.
      if (sport.id !== 'cricket') {
        navigation.navigate('MatchSetup', {
          matchId: matchRes.data.id,
          team1: team1.name, team2: team2.name,
          team1Id: team1.id, team2Id: team2.id,
          venue: venue.trim(), matchType: format.label,
          sport,
        });
        return;
      }

      const inningsRes = await legendsApi.getMatchInnings(matchRes.data.id);
      const firstInning = inningsRes.success && inningsRes.data.length > 0
        ? inningsRes.data[0] : null;

      navigation.navigate('TossLineup', {
        team1: team1.name,
        team2: team2.name,
        overs: String(parsedOvers),
        venue: venue.trim(),
        matchType: format.label,
        ballType,
        matchId: matchRes.data.id,
        team1Id: team1.id,
        team2Id: team2.id,
        firstInningId: firstInning?.id,
        sport,
      });
    } catch {
      showToast('Something went wrong. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  /* ── Section Header helper ─────────────────────────────── */
  const SectionHead = ({ num, label }) => (
    <View style={s.sectionHead}>
      <View style={s.sectionNumBadge}>
        <Text style={s.sectionNum}>{num}</Text>
      </View>
      <Text style={s.sectionLabel}>{label}</Text>
    </View>
  );

  /* ── Render ─────────────────────────────────────────────── */
  // Selected teams that have no players yet (a squad is required to start).
  const teamPlayerCount = (t) => (t && Array.isArray(t.players)) ? t.players.length
    : (t && typeof t.players === 'number' ? t.players : null);
  const emptyTeams = [team1, team2].filter((t) => teamPlayerCount(t) === 0);

  return (
    <View style={s.root}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={K.bg} />
      <Animated.ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: tabClear + 64 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
      >
        {/* ── Back + Top label + Headline ─────────── */}
        <View style={s.topRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={10}>
            <Icon name="arrow-left" size={22} color={K.text} />
          </TouchableOpacity>
          <View style={s.topLabel}>
            <Text style={s.topLabelText}>{(sport.name || 'New').toUpperCase()} · NEW SESSION</Text>
          </View>
        </View>
        <Text style={s.headline}>CREATE NEW MATCH</Text>
        <Text style={s.subheadline}>
          Set up your match details and start scoring live
        </Text>

        {/* ── 01 · Match Format ───────────────────── */}
        <SectionHead num="01" label="SELECT FORMAT" />
        <View style={s.formatRow}>
          {FORMATS.map(f => {
            const active = f.label === format.label;
            return (
              <TouchableOpacity
                key={f.label}
                style={[s.formatCard, active && s.formatCardActive]}
                onPress={() => handleFormatPress(f)}
                activeOpacity={0.8}
              >
                <Icon
                  name={f.icon}
                  size={20}
                  color={active ? K.black : K.textMuted}
                />
                <Text style={[s.formatLabel, active && s.formatLabelActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── 02 · Team Selection ─────────────────── */}
        <SectionHead num="02" label={indiv ? 'PLAYER DETAILS' : 'TEAM DETAILS'} />
        <View style={s.vsContainer}>
          {/* Team 1 */}
          <TouchableOpacity
            style={[s.teamCard, team1 && s.teamCardFilled]}
            onPress={() => setPicker('team1')}
            activeOpacity={0.8}
          >
            <Text style={s.teamRoleTag}>{indiv ? 'PLAYER 1' : 'TEAM A'}</Text>
            {team1 ? (
              <>
                <HexAvatar size={48} color={K.lime}>
                  <Text style={s.teamCardInitial}>{team1.name.charAt(0).toUpperCase()}</Text>
                </HexAvatar>
                <Text style={s.teamCardName} numberOfLines={2}>{team1.name}</Text>
                <TouchableOpacity
                  style={s.teamCardChange}
                  onPress={() => setPicker('team1')}
                  hitSlop={{ top: 4, right: 4, bottom: 4, left: 4 }}
                >
                  <Text style={s.teamCardChangeText}>Change</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <HexAvatar size={48} color={K.surfaceHigh}>
                  <Icon name="plus" size={22} color={K.textMuted} />
                </HexAvatar>
                <Text style={s.teamCardPlaceholder}>Select Team</Text>
                <Text style={s.teamCardAction}>Tap to add</Text>
              </>
            )}
          </TouchableOpacity>

          {/* VS badge */}
          <View style={s.vsBadgeWrapper}>
            <View style={s.vsBadge}>
              <Text style={s.vsText}>VS</Text>
            </View>
          </View>

          {/* Team 2 */}
          <TouchableOpacity
            style={[s.teamCard, team2 && s.teamCardFilled]}
            onPress={() => setPicker('team2')}
            activeOpacity={0.8}
          >
            <Text style={s.teamRoleTag}>{indiv ? 'PLAYER 2' : 'TEAM B'}</Text>
            {team2 ? (
              <>
                <HexAvatar size={48} color={K.lime}>
                  <Text style={s.teamCardInitial}>{team2.name.charAt(0).toUpperCase()}</Text>
                </HexAvatar>
                <Text style={s.teamCardName} numberOfLines={2}>{team2.name}</Text>
                <TouchableOpacity
                  style={s.teamCardChange}
                  onPress={() => setPicker('team2')}
                  hitSlop={{ top: 4, right: 4, bottom: 4, left: 4 }}
                >
                  <Text style={s.teamCardChangeText}>Change</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <HexAvatar size={48} color={K.surfaceHigh}>
                  <Icon name="plus" size={22} color={K.textMuted} />
                </HexAvatar>
                <Text style={s.teamCardPlaceholder}>Select Team</Text>
                <Text style={s.teamCardAction}>Tap to add</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* ── 03 · Match Config ───────────────────── */}
        <SectionHead num="03" label="MATCH CONFIG" />
        <View style={s.configCard}>
          {/* Venue */}
          <View style={s.configRow}>
            <View style={s.configIconWrap}>
              <Icon name="map-marker-outline" size={18} color={K.lime} />
            </View>
            <TextInput
              style={s.configInput}
              value={venue}
              onChangeText={setVenue}
              placeholder="Search venue..."
              placeholderTextColor={K.textMuted}
            />
          </View>

          <View style={s.configDivider} />

          {/* Duration / scoring unit (sport-specific) */}
          <View style={s.configRow}>
            <View style={s.configIconWrap}>
              <Icon name={sportFmt.durationIcon} size={18} color={K.lime} />
            </View>
            <Text style={s.configLabel}>{sportFmt.unit}</Text>
            <TextInput
              style={s.configValueInput}
              value={overs}
              onChangeText={setOvers}
              keyboardType="numeric"
              maxLength={2}
              placeholder={String(FORMATS[0].value)}
              placeholderTextColor={K.textMuted}
            />
          </View>

          {/* Ball type — cricket only */}
          {isCricket && (
            <>
              <View style={s.configDivider} />
              <View style={s.configRow}>
                <View style={s.configIconWrap}>
                  <Icon name="circle-slice-8" size={18} color={K.lime} />
                </View>
                <View style={[s.ballRow, { flex: 1 }]}>
                  {BALL_TYPES.map(b => {
                    const active = b.label === ballType;
                    return (
                      <TouchableOpacity
                        key={b.label}
                        style={[s.ballChip, active && s.ballChipActive]}
                        onPress={() => setBallType(b.label)}
                        activeOpacity={0.8}
                      >
                        <Text style={[s.ballChipText, active && s.ballChipTextActive]} numberOfLines={1}>{b.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </>
          )}
        </View>

        {/* Info banner */}
        <View style={s.infoBanner}>
          <Icon name="information-outline" size={16} color={K.textMuted} style={{ marginTop: 2 }} />
          <Text style={s.infoText}>
            The Momentum Meter will automatically track possession based on your live updates
          </Text>
        </View>

        {/* ── Squad-required warning ──────────────── */}
        {emptyTeams.length > 0 && (
          <View style={[s.squadWarn, { borderColor: c.warn, backgroundColor: c.warn + '18' }]}>
            <Icon name="account-alert-outline" size={20} color={c.warn} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={[s.squadWarnTitle, { color: c.warn }]}>Squad needed to start</Text>
              <Text style={s.squadWarnText}>
                {emptyTeams.map((t) => t.name).join(' and ')} {emptyTeams.length > 1 ? 'have' : 'has'} no players.
                Add at least one player to each {COMP.toLowerCase()} before you can start.
              </Text>
              <TouchableOpacity style={s.squadWarnBtn} onPress={() => navigation.navigate('TeamManagement')} activeOpacity={0.8}>
                <Icon name="account-plus" size={14} color={K.lime} />
                <Text style={s.squadWarnBtnText}>Add players</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── 04 · When: start now, or schedule ───── */}
        <SectionHead num="04" label="When" />
        <View style={s.whenRow}>
          <TouchableOpacity
            style={[s.whenChip, !scheduleAt && s.whenChipActive]}
            onPress={() => setScheduleAt(null)}
            activeOpacity={0.85}>
            <Icon name="play-circle" size={15} color={!scheduleAt ? K.bg : K.textMuted} />
            <Text style={[s.whenChipTxt, !scheduleAt && s.whenChipTxtActive]}>Start now</Text>
          </TouchableOpacity>
          {SCHEDULE_SLOTS.map((slot) => {
            const on = scheduleAt && scheduleAt.getTime() === slot.date.getTime();
            return (
              <TouchableOpacity
                key={slot.label}
                style={[s.whenChip, on && s.whenChipActive]}
                onPress={() => setScheduleAt(slot.date)}
                activeOpacity={0.85}>
                <Text style={[s.whenChipTxt, on && s.whenChipTxtActive]}>{slot.label}</Text>
              </TouchableOpacity>
            );
          })}
          {(() => {
            const isCustom = scheduleAt && !SCHEDULE_SLOTS.some(s => s.date.getTime() === scheduleAt.getTime());
            return (
              <TouchableOpacity
                style={[s.whenChip, isCustom && s.whenChipActive]}
                onPress={() => {
                  setTempDate(scheduleAt || new Date());
                  setShowDatePicker(true);
                }}
                activeOpacity={0.85}>
                <Icon name="calendar" size={15} color={isCustom ? K.bg : K.textMuted} />
              </TouchableOpacity>
            );
          })()}
        </View>
        {scheduleAt && (
          <Text style={s.whenReadout}>
            Fixture: {scheduleAt.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}

        {/* ── CTA — solid blue "commit action" per the app colour rule
             (matches Score / Start / View Summary), not the green gradient ── */}
        <GradientButton
          variant="blue"
          label={scheduleAt ? 'SCHEDULE MATCH' : 'START SCORING'}
          icon={scheduleAt ? 'calendar-clock' : (sport.icon || 'whistle')}
          onPress={onCreate}
          loading={loading}
          disabled={!team1 || !team2 || emptyTeams.length > 0}
          height={56}
          style={s.createBtn}
          textStyle={{ fontSize: 16, letterSpacing: 1 }}
        />
      </Animated.ScrollView>

      {/* Team Picker modal */}
      <TeamPicker
        visible={picker !== null}
        onClose={() => setPicker(null)}
        onSelect={selectTeam}
        excludeId={picker === 'team2' ? team1?.id : team2?.id}
        title={`Select ${COMP} ${picker === 'team1' ? '1' : '2'}`}
        sport={sport.id}
      />

      {/* Date & Time Pickers */}
      {showDatePicker && (
        <DateTimePicker
          value={tempDate}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowDatePicker(false);
            if (event.type === 'set' && selectedDate) {
              setTempDate(selectedDate);
              setTimeout(() => setShowTimePicker(true), 100);
            }
          }}
        />
      )}

      {showTimePicker && (
        <DateTimePicker
          value={tempDate}
          mode="time"
          display="default"
          onChange={(event, selectedTime) => {
            setShowTimePicker(false);
            if (event.type === 'set' && selectedTime) {
              setScheduleAt(selectedTime);
            }
          }}
        />
      )}
    </View>
  );
};

/* ─── Styles ─────────────────────────────────────────────── */
const makeS = (K) => StyleSheet.create({
  root: { flex: 1, backgroundColor: K.bg },
  scroll: { padding: 16, paddingBottom: 20 },

  /* ── Top area ──────────────────────────────── */
  // Back sits on the label's row: with the nav header gone this is the only way
  // out, so it has to be visible without scrolling.
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 12 },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  topLabel: {
    alignSelf: 'flex-start',
    backgroundColor: K.limeDim,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  topLabelText: {
    fontSize: 11,
    fontWeight: '800',
    color: K.lime,
    letterSpacing: 1.2,
  },
  headline: {
    fontSize: 26,
    fontWeight: '900',
    color: K.text,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  subheadline: {
    fontSize: 14,
    fontWeight: '400',
    color: K.textMuted,
    lineHeight: 20,
    marginBottom: 8,
  },

  /* ── Section headers ───────────────────────── */
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 6,
    gap: 10,
  },
  sectionNumBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: K.limeDim,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: K.lime,
  },
  sectionNum: {
    fontSize: 12,
    fontWeight: '900',
    color: K.lime,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: K.textVariant,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  /* ── Format row ────────────────────────────── */
  formatRow: {
    flexDirection: 'row',
    gap: 10,
  },
  formatCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: K.surfaceLow,
    gap: 8,
  },
  formatCardActive: {
    backgroundColor: K.lime,
    shadowColor: K.lime,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 4,
  },
  formatLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: K.textMuted,
    letterSpacing: 0.5,
  },
  formatLabelActive: {
    color: K.black,
  },

  /* ── Teams row ─────────────────────────────── */
  vsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: K.surfaceLow,
    borderRadius: 24,
    padding: 6,
    position: 'relative',
    shadowColor: K.lime,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 4,
    borderWidth: 1,
    borderColor: K.surfaceHigh,
    marginTop: 10,
    marginBottom: 10,
  },
  teamCard: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 20,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    minHeight: 112,
    justifyContent: 'center',
    gap: 8,
  },
  teamCardFilled: {
    backgroundColor: K.surfaceHigh + '40',
  },
  teamRoleTag: {
    fontSize: 10,
    fontWeight: '800',
    color: K.textMuted,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  teamCardAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: K.lime,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  teamCardAvatarAway: {
    shadowColor: K.blue,
  },
  teamCardInitial: {
    fontSize: 18,
    fontWeight: '800',
    color: K.black,
  },
  teamCardName: {
    fontSize: 14,
    fontWeight: '700',
    color: K.text,
    textAlign: 'center',
    marginTop: 4,
  },
  teamCardChange: {
    marginTop: 2,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: K.surfaceHigh,
    borderRadius: 12,
  },
  teamCardChangeText: {
    fontSize: 11,
    fontWeight: '700',
    color: K.text,
  },
  teamCardEmpty: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: K.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: K.textMuted + '60',
    borderStyle: 'dashed',
  },
  teamCardPlaceholder: {
    fontSize: 12,
    fontWeight: '600',
    color: K.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  teamCardAction: {
    fontSize: 12,
    fontWeight: '700',
    color: K.lime,
  },
  vsBadgeWrapper: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: [{ translateX: -20 }, { translateY: -20 }],
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: K.bg,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  vsBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: K.surfaceTop,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vsText: {
    fontSize: 13,
    fontWeight: '900',
    color: K.blue,
    fontStyle: 'italic',
  },

  /* ── Config card ───────────────────────────── */
  configCard: {
    backgroundColor: K.surfaceLow,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: K.surfaceHigh,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  configIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: K.limeDim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  configLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: K.text,
    flex: 1,
  },
  configInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '400',
    color: K.text,
    paddingVertical: 0,
  },
  configValueInput: {
    fontSize: 15,
    fontWeight: '600',
    color: K.text,
    textAlign: 'right',
    minWidth: 50,
    paddingVertical: 0,
  },
  ballRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    flexShrink: 1,
    gap: 6,
  },
  ballChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: K.surfaceHigh,
    flexShrink: 0,
  },
  ballChipActive: {
    backgroundColor: K.lime,
  },
  ballChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: K.textMuted,
  },
  ballChipTextActive: {
    color: K.black,
  },
  configDivider: {
    height: 1,
    backgroundColor: K.surfaceHigh,
    marginHorizontal: 16,
  },

  /* ── Info banner ───────────────────────────── */
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 4,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '400',
    color: K.textMuted,
    lineHeight: 18,
  },

  /* ── Squad-required warning ────────────────── */
  squadWarn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  squadWarnTitle: { fontSize: 13.5, fontWeight: '800', marginBottom: 3 },
  squadWarnText: { fontSize: 12.5, color: K.textVariant, lineHeight: 18 },
  squadWarnBtn: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5,
    marginTop: 10, paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, backgroundColor: K.limeDim, borderWidth: 1, borderColor: K.lime,
  },
  squadWarnBtnText: { color: K.lime, fontSize: 12.5, fontWeight: '800' },

  /* ── Create / Start button (gradient CTA provides its own fill) ── */
  createBtn: {
    alignSelf: 'center',
    paddingHorizontal: 40,
    borderRadius: 16,
    marginTop: 28,
  },

  /* ── When (schedule) ───────────────────────── */
  whenRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  whenChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: K.surfaceHigh, borderRadius: 12,
    paddingHorizontal: 13, paddingVertical: 9,
  },
  whenChipActive: { backgroundColor: K.lime },
  whenChipTxt: { color: K.textVariant, fontSize: 13, fontWeight: '700' },
  whenChipTxtActive: { color: K.bg },
  whenReadout: { color: K.lime, fontSize: 12.5, fontWeight: '700', marginTop: 10 },

  /* ── Team Picker (modal) ───────────────────── */
  pickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: K.overlay,
  },
  pickerSheet: {
    backgroundColor: K.surfaceLow,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 36,
    maxHeight: '80%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: K.surfaceTop,
    alignSelf: 'center',
    marginVertical: 10,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: K.text,
  },

  /* Search */
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: K.surfaceHigh,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '400',
    color: K.text,
    paddingVertical: 0,
  },

  /* Create team button */
  createTeamBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: K.surfaceHigh,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    marginBottom: 14,
  },
  createTeamIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: K.limeDim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createTeamLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: K.lime,
    flex: 1,
  },

  /* Loader / empty */
  pickerLoader: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  pickerLoaderText: {
    fontSize: 14,
    fontWeight: '400',
    color: K.textMuted,
  },
  pickerEmpty: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  pickerEmptyText: {
    fontSize: 14,
    fontWeight: '400',
    color: K.textMuted,
    textAlign: 'center',
  },

  /* Team rows */
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 14,
  },
  teamRowAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: K.surfaceTop,
    justifyContent: 'center',
    alignItems: 'center',
  },
  teamRowInitial: {
    fontSize: 17,
    fontWeight: '700',
    color: K.text,
  },
  teamRowInfo: { flex: 1 },
  teamRowName: {
    fontSize: 15,
    fontWeight: '600',
    color: K.text,
  },
  teamRowSub: {
    fontSize: 12,
    fontWeight: '400',
    color: K.textMuted,
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: K.surfaceHigh,
  },

  /* Create form (inline) */
  createForm: {
    paddingTop: 8,
    gap: 14,
  },
  createFormLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: K.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  createFormInput: {
    backgroundColor: K.surfaceHigh,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '400',
    color: K.text,
  },
  createFormActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: K.surfaceHigh,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: K.textVariant,
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: K.lime,
  },
  saveBtnDisabled: {
    opacity: 0.35,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: K.black,
  },
});

export default StartMatchScreen;

import React, { useState, useEffect, useCallback, useMemo, useLayoutEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Modal, TextInput, FlatList,
  StatusBar, Animated
} from 'react-native';
import { BottomSheetModal, BottomSheetScrollView, BottomSheetBackdrop, BottomSheetFooter } from '@gorhom/bottom-sheet';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { Typography, Spacing, Radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { getStartFormat as getSportFormat } from '../sports/start';
import { getSport } from '../sports';
import { getSelectedSport } from '../utils/selectedSport';
import GradientButton from '../components/GradientButton';
import {
  DrawerHeader, PrimaryButton, StickyFooter, useDrawerSheet, DRAWER_BACKDROP,
  useDiscardGuard, FOOTER_CLEARANCE,
} from '../components/create';
import HexAvatar from '../components/HexAvatar';
import { showToast } from '../components/Toast';
import { useTabBarClearance, useDockLock } from '../components/AutoHideTabBar';
import Reanimated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing } from 'react-native-reanimated';

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
  const drawerSheet = useDrawerSheet();

  // The dock stands down for the whole of this flow: a pushed, full-screen form
  // with its own header and its own submit, and the app's bottom navigation
  // floating over it is chrome between you and the keyboard. Locked rather than
  // scroll-hidden, so a scroll cannot bring it back mid-form; released on blur,
  // so backing out restores it.
  const lockDock = useDockLock();
  useFocusEffect(useCallback(() => {
    lockDock(true);
    return () => lockDock(false);
  }, [lockDock]));

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

  const pulseAnim = useSharedValue(1);
  useEffect(() => {
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }]
  }));

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

  // Only Custom lets you type a length; every other format owns its own.
  const isCustomFormat = format.label === 'Custom';

  const handleFormatPress = (f) => {
    setFormat(f);
    // Leaving Custom snaps back to the chosen format's length. Coming INTO
    // Custom keeps whatever is on screen as the starting point, which is
    // friendlier than resetting to 10 the moment you ask to choose.
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

      showToast(scheduleAt ? 'Match scheduled ✓' : 'Match created ✓', 'success');
      // Hold the tick for a beat before leaving, so the drawer confirms rather
      // than the screen simply changing under you — the same beat the other
      // four take.
      setCreated(true);
      await new Promise((r) => setTimeout(r, 450));
      
      // Always return to the My Matches screen so the scorer can start the match
      // (and toss/lineup) from there when ready, rather than forcing an instant start.
      navigation.reset({
        index: 1,
        routes: [
          { name: sport.id === 'cricket' ? 'CricketFeed' : 'SportFeed' },
          { name: 'MyMatches' }
        ],
      });
    } catch {
      showToast('Something went wrong. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  /* ── Section Header helper ─────────────────────────────── */

  /* ── Render ─────────────────────────────────────────────── */
  // Selected teams that have no players yet (a squad is required to start).
  const teamPlayerCount = (t) => (t && Array.isArray(t.players)) ? t.players.length
    : (t && typeof t.players === 'number' ? t.players : null);
  const emptyTeams = [team1, team2].filter((t) => teamPlayerCount(t) === 0);
  const [created, setCreated] = useState(false);
  // The last of the five to get the guard. Picking two teams, a ground and a
  // date and then losing it to a stray back tap is the same loss as any of the
  // other drawers.
  const matchDirty = !!(team1 || team2 || venue || scheduleAt);
  const closeMatch = useDiscardGuard(
    matchDirty,
    useCallback(() => navigation.goBack(), [navigation]),
    { title: 'Discard this match?' },
  );

  // Pinned by the sheet, not merely placed after the scroll view — inside a
  // bottom sheet a trailing View drifts with the content. Same footerComponent
  // as the other four drawers.
  const renderMatchFooter = useCallback((props) => (
    <BottomSheetFooter {...props} bottomInset={0}>
      <StickyFooter>
        {/* The design system's button, not a local copy of one. This footer
            hand-rolled its own pair — which is why it sat out the pass that
            made every other drawer's submit black and brought it down to the
            48pt touch minimum: PrimaryButton was already imported here and
            never used.

            Cancel is gone. The drawer has a back arrow, a swipe-down and a
            backdrop tap, all of which already leave — a fourth way to go
            nowhere was taking a third of the footer from the one control the
            screen is for. */}
        <PrimaryButton
          label={scheduleAt ? 'Schedule' : 'Create'}
          icon={scheduleAt ? 'calendar-check' : 'check'}
          onPress={onCreate}
          loading={loading}
          done={created}
          disabled={!team1 || !team2 || emptyTeams.length > 0}
        />
      </StickyFooter>
    </BottomSheetFooter>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [scheduleAt, loading, created, team1, team2, emptyTeams, tabClear, onCreate]);


  const sheetRef = useRef(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      sheetRef.current?.present();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const renderBackdrop = useCallback(
    (props) => <BottomSheetBackdrop {...props} {...DRAWER_BACKDROP} />,
    []
  );

  return (
    <View style={s.root}>
      <BottomSheetModal
        {...drawerSheet}
        ref={sheetRef}
        onDismiss={handleDismiss}
        backdropComponent={renderBackdrop}
        footerComponent={renderMatchFooter}
      >
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={K.bg} />
      <BottomSheetScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: FOOTER_CLEARANCE }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* The shared drawer header, with the close button in it — the row of
            back-arrow-plus-sport-label that used to sit above this said nothing
            the title does not, and cost 54dp on a form being asked to fit one
            screen. */}
        <DrawerHeader
          icon={sportDef?.icon || 'cricket'}
          title="Create New Match"
          subtitle={`${sport.name || 'Match'} · set up and start scoring`}
          onClose={closeMatch}
        />

        {/* ── One screen, no scroll ─────────────────────────────────────
            Rebuilt to fit. The previous version was compacted rather than
            reshaped, and it still ran to ~592dp once two teams were picked and
            the squad warning appeared — past the ~500dp a small phone gives a
            94% sheet. What made it tall was structure, not padding:

              · four numbered section headers, 96dp of pure chrome
              · format as icon-over-label CARDS rather than chips
              · team cards carrying a role tag, a 40px avatar, a name AND a
                separate "Change" button, when the whole card is already tappable
              · a three-row config card for two defaults and one optional field
              · a three-line warning banner with its own button

            What a match actually needs is two teams and a format; overs follow
            the format, and venue, ball and start time all have defaults. So the
            two required decisions get the room and everything else is one line
            each. ~316dp filled, warning and all. */}

        {/* Teams — the only decision that has to be made here. */}
        <View style={s.vsContainer}>
          {[['team1', team1, indiv ? 'PLAYER 1' : 'TEAM A'],
            ['team2', team2, indiv ? 'PLAYER 2' : 'TEAM B']].map(([slot, team, tag], i) => (
            <React.Fragment key={slot}>
              {i === 1 && (
                <View style={s.vsBadgeWrapper}>
                  <View style={s.vsBadge}><Text style={s.vsText}>VS</Text></View>
                </View>
              )}
              <TouchableOpacity
                style={[s.teamCard, team && s.teamCardFilled]}
                onPress={() => setPicker(slot)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={team ? `${tag}: ${team.name}. Tap to change` : `Choose ${tag}`}>
                {team ? (
                  <>
                    <HexAvatar size={30} color={K.lime}>
                      <Text style={s.teamCardInitial}>{team.name.charAt(0).toUpperCase()}</Text>
                    </HexAvatar>
                    <Text style={s.teamCardName} numberOfLines={2}>{team.name}</Text>
                  </>
                ) : (
                  <Reanimated.View style={[{ alignItems: 'center', gap: 4 }, pulseStyle]}>
                    <HexAvatar size={30} color={K.surfaceHigh}>
                      <Icon name="plus" size={17} color={K.lime} />
                    </HexAvatar>
                    <Text style={s.teamCardPlaceholder}>{tag}</Text>
                  </Reanimated.View>
                )}
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>

        {/* Squad warning — one line. It was a banner with a heading, a sentence
            and a button; it only ever says which side is empty and where to go. */}
        {emptyTeams.length > 0 && (
          <TouchableOpacity style={[s.squadWarn, { borderColor: c.warn }]}
            onPress={() => navigation.navigate('TeamManagement')} activeOpacity={0.8}>
            <Icon name="account-alert-outline" size={15} color={c.warn} />
            <Text style={s.squadWarnText} numberOfLines={1}>
              {emptyTeams.map((t) => t.name).join(' & ')} {emptyTeams.length > 1 ? 'have' : 'has'} no players
            </Text>
            <Text style={[s.squadWarnBtnText, { color: c.warn }]}>Add</Text>
          </TouchableOpacity>
        )}

        {/* Format — chips, not cards. A named format also fixes its own length,
            so the overs box only appears for Custom. */}
        <View style={s.rowLabelled}>
          <Text style={s.miniLabel}>FORMAT</Text>
          <View style={s.formatRow}>
            {FORMATS.map(f => {
              const active = f.label === format.label;
              return (
                <TouchableOpacity key={f.label}
                  style={[s.formatChip, active && s.formatChipActive]}
                  onPress={() => handleFormatPress(f)} activeOpacity={0.8}>
                  <Text style={[s.formatLabel, active && s.formatLabelActive]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Overs / scoring unit, and the ball, on one line. */}
        <View style={s.inlineRow}>
          <View style={s.inlineCell}>
            <Text style={s.miniLabel}>{sportFmt.unit.toUpperCase()}</Text>
            {isCustomFormat ? (
              <TextInput
                style={s.oversInput}
                value={overs} onChangeText={setOvers}
                keyboardType="numeric" maxLength={3}
                placeholder={String(FORMATS[0].value)} placeholderTextColor={K.textMuted}
                accessibilityLabel={`${sportFmt.unit}, editable`}
              />
            ) : (
              <Text style={s.oversFixed}
                accessibilityLabel={`${sportFmt.unit}: ${overs}, set by the ${format.label} format`}>
                {overs}
              </Text>
            )}
          </View>
          {isCricket && (
            <View style={[s.inlineCell, { flex: 2 }]}>
              <Text style={s.miniLabel}>BALL</Text>
              <View style={s.ballRow}>
                {BALL_TYPES.map(b => {
                  const active = b.label === ballType;
                  return (
                    <TouchableOpacity key={b.label}
                      style={[s.ballChip, active && s.ballChipActive]}
                      onPress={() => setBallType(b.label)} activeOpacity={0.8}>
                      <Text style={[s.ballChipText, active && s.ballChipTextActive]} numberOfLines={1}>{b.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </View>

        {/* Venue — optional, so it is a single field rather than a card row. */}
        <View style={s.rowLabelled}>
          <Text style={s.miniLabel}>VENUE</Text>
          <View style={s.venueRow}>
            <Icon name="map-marker-outline" size={16} color={K.lime} />
            <TextInput
              style={s.venueInput}
              value={venue} onChangeText={setVenue}
              placeholder="Where is it being played?"
              placeholderTextColor={K.textMuted}
            />
          </View>
        </View>

        {/* When — defaults to now, so it is the last and lightest row. */}
        <View style={s.rowLabelled}>
          <Text style={s.miniLabel}>WHEN</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={s.whenScroll} contentContainerStyle={s.whenRow}>
            <TouchableOpacity
              style={[s.whenChip, !scheduleAt && s.whenChipActive]}
              onPress={() => setScheduleAt(null)} activeOpacity={0.85}>
              <Icon name="play-circle" size={14} color={!scheduleAt ? K.bg : K.textMuted} />
              <Text style={[s.whenChipTxt, !scheduleAt && s.whenChipTxtActive]}>Now</Text>
            </TouchableOpacity>
            {SCHEDULE_SLOTS.map((slot) => {
              const on = scheduleAt && scheduleAt.getTime() === slot.date.getTime();
              return (
                <TouchableOpacity key={slot.label}
                  style={[s.whenChip, on && s.whenChipActive]}
                  onPress={() => setScheduleAt(slot.date)} activeOpacity={0.85}>
                  <Text style={[s.whenChipTxt, on && s.whenChipTxtActive]}>{slot.label}</Text>
                </TouchableOpacity>
              );
            })}
            {(() => {
              const isCustom = scheduleAt && !SCHEDULE_SLOTS.some(sl => sl.date.getTime() === scheduleAt.getTime());
              return (
                <TouchableOpacity
                  style={[s.whenChip, isCustom && s.whenChipActive]}
                  onPress={() => { setTempDate(scheduleAt || new Date()); setShowDatePicker(true); }}
                  activeOpacity={0.85}>
                  <Icon name="calendar" size={14} color={isCustom ? K.bg : K.textMuted} />
                </TouchableOpacity>
              );
            })()}
          </ScrollView>
        </View>
        {scheduleAt && (
          <Text style={s.whenReadout}>
            {scheduleAt.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}

      </BottomSheetScrollView>

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
    </BottomSheetModal>
    </View>
  );
};

/* ─── Styles ─────────────────────────────────────────────── */
const makeS = (K) => StyleSheet.create({
  root: { flex: 1, backgroundColor: K.bg },
  scroll: { paddingHorizontal: 14, paddingTop: 0, paddingBottom: 20 },

  /* ── Single-screen layout ─────────────────────────────────
     A label and its control, stacked, is the unit this form is built from.
     The label is small and quiet because the control below it is the thing
     being read; that is what lets four of these stack inside one screen
     where four numbered section headers could not. */
  rowLabelled: { marginTop: 10 },
  miniLabel: {
    fontSize: 9.5, fontWeight: '800', color: K.textMuted,
    letterSpacing: 1.1, marginBottom: 5,
  },
  inlineRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  inlineCell: { flex: 1 },

  formatChip: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    minHeight: 34, paddingHorizontal: 6, borderRadius: 10,
    backgroundColor: K.surfaceLow,
  },
  formatChipActive: { backgroundColor: K.lime },

  oversInput: {
    minHeight: 34, borderRadius: 10, backgroundColor: K.surfaceLow,
    textAlign: 'center', fontSize: 15, fontWeight: '800', color: K.text, paddingVertical: 0,
  },
  oversFixed: {
    minHeight: 34, lineHeight: 34, borderRadius: 10, backgroundColor: K.surfaceLow,
    textAlign: 'center', fontSize: 15, fontWeight: '800', color: K.textVariant,
  },

  venueRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    minHeight: 38, paddingHorizontal: 11, borderRadius: 10, backgroundColor: K.surfaceLow,
  },
  venueInput: { flex: 1, fontSize: 14, color: K.text, paddingVertical: 0 },

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

  /* ── Section headers ───────────────────────── */

  /* ── Format row ────────────────────────────── */
  formatRow: {
    flexDirection: 'row',
    gap: 10,
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
    marginTop: 6,
    marginBottom: 6,
  },
  teamCard: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 20,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    minHeight: 88,
    justifyContent: 'center',
    gap: 5,
  },
  teamCardFilled: {
    backgroundColor: K.surfaceHigh + '40',
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
  vsBadgeWrapper: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: [{ translateX: -22 }, { translateY: -22 }],
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: K.lime + '30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vsBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: K.lime,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: K.lime,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 8,
  },
  vsText: {
    fontSize: 14,
    fontWeight: '900',
    color: K.bg,
    fontStyle: 'italic',
  },

  /* ── Config card ───────────────────────────── */
  // The same number in the same place, just not a text box: a format that
  // owns its length should read as a fact, not as an empty invitation.
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

  /* ── Info banner ───────────────────────────── */

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
  squadWarnText: { fontSize: 12.5, color: K.textVariant, lineHeight: 18 },
  squadWarnBtnText: { color: K.lime, fontSize: 12.5, fontWeight: '800' },

  /* ── When (schedule) ───────────────────────── */
  whenScroll: { flexGrow: 0, marginTop: 2 },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 4 },
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
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: K.lime,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: K.bg,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.2
  },
});

export default StartMatchScreen;

import { useState, useEffect, useCallback, useMemo, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Modal, TextInput, FlatList,
  StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { Typography, Spacing, Radius } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { getStartFormat as getSportFormat } from '../sports/start';
import { getSport } from '../sports';
import GradientButton from '../components/GradientButton';
import { showToast } from '../components/Toast';

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
  blue:         '#3b82f6',
  blueDim:      '#3b82f620',
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

/* ─── TeamPicker bottom-sheet ────────────────────────────── */
const TeamPicker = ({ visible, onClose, onSelect, excludeId, title }) => {
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
    legendsApi.getTeams().then(res => {
      setTeams(res.success ? (res.data || []) : []);
      setLoading(false);
    });
  }, [visible]);

  const filtered = teams.filter(t =>
    t.id !== excludeId &&
    (t.name || '').toLowerCase().includes(query.toLowerCase())
  );

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    const res = await legendsApi.createTeam({ name });
    setSaving(false);
    if (res.success && res.data) {
      onSelect(res.data);
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
  const sport = route.params?.sport || { id: 'cricket', name: 'Cricket', icon: 'cricket' };
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
  const [team1, setTeam1]       = useState(null);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: true, headerBackVisible: true, headerTitle: 'Start Match' });
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
        sport: sport.id,
      });

      if (!matchRes.success) {
        showToast(matchRes.error || 'Failed to create match', 'error');
        return;
      }

      // Non-cricket sports use the generic event-based scorer; cricket keeps
      // its toss → lineup → ball-by-ball flow.
      if (sport.id !== 'cricket') {
        navigation.navigate('SportScoring', {
          match: {
            id: matchRes.data.id,
            team1: team1.name, team2: team2.name,
            team1Id: team1.id, team2Id: team2.id,
            venue: venue.trim(), matchType: format.label,
            sport: sport.id,
          },
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
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Top label + Headline ────────────────── */}
        <View style={s.topLabel}>
          <Text style={s.topLabelText}>{(sport.name || 'New').toUpperCase()} · NEW SESSION</Text>
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
        <View style={s.teamsRow}>
          {/* Team 1 */}
          <TouchableOpacity
            style={[s.teamCard, team1 && s.teamCardFilled]}
            onPress={() => setPicker('team1')}
            activeOpacity={0.8}
          >
            <Text style={s.teamRoleTag}>{indiv ? 'PLAYER 1' : 'TEAM A (HOME)'}</Text>
            {team1 ? (
              <>
                <View style={[s.teamCardAvatar, { backgroundColor: K.lime }]}>
                  <Text style={s.teamCardInitial}>{team1.name.charAt(0).toUpperCase()}</Text>
                </View>
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
                <View style={s.teamCardEmpty}>
                  <Icon name="camera-plus-outline" size={24} color={K.textMuted} />
                </View>
                <Text style={s.teamCardPlaceholder}>Upload avatar</Text>
                <Text style={s.teamCardAction}>Tap to select</Text>
              </>
            )}
          </TouchableOpacity>

          {/* VS badge */}
          <View style={s.vsBadge}>
            <Text style={s.vsText}>VS</Text>
          </View>

          {/* Team 2 */}
          <TouchableOpacity
            style={[s.teamCard, team2 && s.teamCardFilled]}
            onPress={() => setPicker('team2')}
            activeOpacity={0.8}
          >
            <Text style={s.teamRoleTag}>{indiv ? 'PLAYER 2' : 'TEAM B (AWAY)'}</Text>
            {team2 ? (
              <>
                <View style={[s.teamCardAvatar, { backgroundColor: K.blue }]}>
                  <Text style={s.teamCardInitial}>{team2.name.charAt(0).toUpperCase()}</Text>
                </View>
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
                <View style={s.teamCardEmpty}>
                  <Icon name="camera-plus-outline" size={24} color={K.textMuted} />
                </View>
                <Text style={s.teamCardPlaceholder}>Upload avatar</Text>
                <Text style={s.teamCardAction}>Tap to select</Text>
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
              maxLength={3}
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
                <Text style={s.configLabel}>Ball</Text>
                <View style={s.ballRow}>
                  {BALL_TYPES.map(b => {
                    const active = b.label === ballType;
                    return (
                      <TouchableOpacity
                        key={b.label}
                        style={[s.ballChip, active && s.ballChipActive]}
                        onPress={() => setBallType(b.label)}
                        activeOpacity={0.8}
                      >
                        <Text style={[s.ballChipText, active && s.ballChipTextActive]}>{b.label}</Text>
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

        {/* ── Start Scoring button (signature blue-gradient CTA) ── */}
        <GradientButton
          label="START SCORING"
          icon={sport.icon || 'whistle'}
          onPress={onCreate}
          loading={loading}
          disabled={!team1 || !team2 || emptyTeams.length > 0}
          height={56}
          style={s.createBtn}
          textStyle={{ fontSize: 16, letterSpacing: 1 }}
        />
      </ScrollView>

      {/* Team Picker modal */}
      <TeamPicker
        visible={picker !== null}
        onClose={() => setPicker(null)}
        onSelect={selectTeam}
        excludeId={picker === 'team2' ? team1?.id : team2?.id}
        title={`Select ${COMP} ${picker === 'team1' ? '1' : '2'}`}
      />
    </View>
  );
};

/* ─── Styles ─────────────────────────────────────────────── */
const makeS = (K) => StyleSheet.create({
  root: { flex: 1, backgroundColor: K.bg },
  scroll: { padding: 20, paddingBottom: 48 },

  /* ── Top area ──────────────────────────────── */
  topLabel: {
    alignSelf: 'flex-start',
    backgroundColor: K.limeDim,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
    marginBottom: 12,
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
    marginTop: 28,
    marginBottom: 14,
    gap: 10,
  },
  sectionNumBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: K.limeDim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionNum: {
    fontSize: 12,
    fontWeight: '800',
    color: K.lime,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: K.textVariant,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  /* ── Format row ────────────────────────────── */
  formatRow: {
    flexDirection: 'row',
    gap: 8,
  },
  formatCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: K.surfaceLow,
    gap: 6,
  },
  formatCardActive: {
    backgroundColor: K.lime,
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
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  teamCard: {
    flex: 1,
    backgroundColor: K.surfaceLow,
    borderRadius: 18,
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 10,
    minHeight: 160,
    justifyContent: 'center',
    gap: 6,
  },
  teamCardFilled: {
    backgroundColor: K.surfaceHigh,
  },
  teamRoleTag: {
    fontSize: 10,
    fontWeight: '700',
    color: K.textMuted,
    letterSpacing: 1,
    marginBottom: 4,
  },
  teamCardAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
  },
  teamCardInitial: {
    fontSize: 22,
    fontWeight: '800',
    color: K.black,
  },
  teamCardName: {
    fontSize: 14,
    fontWeight: '600',
    color: K.text,
    textAlign: 'center',
  },
  teamCardChange: {
    marginTop: 2,
  },
  teamCardChangeText: {
    fontSize: 12,
    fontWeight: '600',
    color: K.lime,
  },
  teamCardEmpty: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: K.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: K.surfaceTop,
    borderStyle: 'dashed',
  },
  teamCardPlaceholder: {
    fontSize: 12,
    fontWeight: '500',
    color: K.textMuted,
    textAlign: 'center',
  },
  teamCardAction: {
    fontSize: 11,
    fontWeight: '600',
    color: K.lime,
  },
  vsBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: K.surfaceTop,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vsText: {
    fontSize: 11,
    fontWeight: '800',
    color: K.textVariant,
  },

  /* ── Config card ───────────────────────────── */
  configCard: {
    backgroundColor: K.surfaceLow,
    borderRadius: 18,
    overflow: 'hidden',
  },
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
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
    gap: 6,
  },
  ballChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: K.surfaceHigh,
  },
  ballChipActive: {
    backgroundColor: K.lime,
  },
  ballChipText: {
    fontSize: 13,
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
    borderRadius: 16,
    marginTop: 28,
  },

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

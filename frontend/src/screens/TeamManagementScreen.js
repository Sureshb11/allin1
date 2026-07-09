import { useTheme, useThemedStyles } from "../theme/ThemeContext";import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
  Animated,
  Modal } from
'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import HexAvatar from '../components/HexAvatar';
import PressableScale from '../components/PressableScale';
import legendsApi from '../services/LegendsApi';
import { showToast } from '../components/Toast';
import BrandLogo from "../components/BrandLogo";












const AVATAR_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e91e63'];

const AnimatedPulse = ({ children, style }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulseAnim]);
  return <Animated.View style={[style, { transform: [{ scale: pulseAnim }] }]}>{children}</Animated.View>;
};

const TeamManagementScreen = ({ navigation, inline }) => {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const [tab, setTab] = useState('mine');   // mine | opponents | followed
  const [categorized, setCategorized] = useState({ mine: [], opponents: [], followed: [] });
  const [followedIds, setFollowedIds] = useState(new Set());
  const [players, setPlayers] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [searchPhone, setSearchPhone] = useState('');
  const [foundUser, setFoundUser] = useState(null);
  const [searching, setSearching] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [addingGuest, setAddingGuest] = useState(false);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [teamSearchQuery, setTeamSearchQuery] = useState('');

  useLayoutEffect(() => {
    if (!inline) {
      navigation.setOptions({
        headerShown: true,
        headerBackVisible: true,
        headerTitle: 'Teams',
      });
    }
  }, [navigation, inline]);

  useEffect(() => {
    loadData();
  }, []);

  // Reload the squad whenever a team is opened (or closed) so the detail shows
  // only that team's players.
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeam?.id]);

  const mapTeam = (t) => ({
    id: t.id,
    name: t.name,
    city: t.city || '',
    captain: t.players && t.players[0]?.name || 'TBD',
    players: t.players ? t.players.length : 0,
    playersList: t.players || [],
    ownerId: t.ownerId,
    matches: 0,
    wins: 0,
  });

  const loadData = async () => {
    try {
      const catRes = await legendsApi.getTeamsCategorized();
      if (catRes.success) {
        const c = catRes.data;
        setCategorized({
          mine: (c.mine || []).map(mapTeam),
          opponents: (c.opponents || []).map(mapTeam),
          followed: (c.followed || []).map(mapTeam),
        });
        setFollowedIds(new Set((c.followed || []).map((t) => t.id)));
      }
      // Squad list = only the OPEN team's players (was fetching every player in
      // the database, which showed "so many" members in the detail view).
      if (selectedTeam?.id) {
        const playersRes = await legendsApi.getPlayers({ teamId: selectedTeam.id });
        if (playersRes.success) {
          setPlayers((playersRes.data || []).map((p) => ({
            id: p.id,
            name: p.name,
            role: p.role,
            matches: p.stats?.matches || 0,
            runs: p.stats?.runs || 0,
            wickets: p.stats?.wickets || 0,
            teamName: typeof p.team === 'object' && p.team !== null ? p.team?.name : '',
          })));
        }
      } else {
        setPlayers([]);
      }
    } catch (error) {
      console.log('Error loading team data:', error);
    }
  };

  const getInitials = (name) => {
    return (name || '').
    split(' ').
    map((w) => w[0]).
    slice(0, 2).
    join('').
    toUpperCase();
  };

  const getAvatarColor = (name) => {
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  };

  const getRoleColor = (role) => {
    switch ((role || '').toLowerCase()) {
      case 'batsman':return '#3498db';
      case 'bowler':return '#e74c3c';
      case 'all-rounder':return DS.lime;
      case 'wicket-keeper':return '#2ecc71';
      default:return DS.textMuted;
    }
  };

  const toggleFollow = async (team) => {
    const isFollowed = followedIds.has(team.id);
    setFollowedIds((prev) => {
      const n = new Set(prev);
      isFollowed ? n.delete(team.id) : n.add(team.id);
      return n;
    });
    const res = isFollowed ? await legendsApi.unfollowTeam(team.id) : await legendsApi.followTeam(team.id);
    if (res.success) loadData();
  };

  const renderTeam = ({ item }) => {
    const losses = item.matches - item.wins;
    const draws = 0;
    const isFollowed = followedIds.has(item.id);
    const mineTab = tab === 'mine';
    return (
      <PressableScale
        style={styles.teamCard}
        onPress={() => mineTab ? setSelectedTeam(item) : navigation.navigate('TeamInsights', { teamId: item.id })}>
        <View style={styles.teamCardTop}>
          <HexAvatar size={48} color={getAvatarColor(item.name)} style={{ marginRight: 14 }}>
            <Text style={styles.teamAvatarText}>{getInitials(item.name)}</Text>
          </HexAvatar>
          <View style={styles.teamInfo}>
            <Text style={styles.teamName}>{item.name}</Text>
            <Text style={styles.teamSubtitle}>
              <Text style={styles.memberCount}>{item.players} members</Text>
            </Text>
            <Text style={styles.roleTag}>CAPTAIN</Text>
          </View>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statBlock}>
            <Text style={styles.statNumber}>{item.wins}</Text>
            <Text style={styles.statLabel}>W</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBlock}>
            <Text style={styles.statNumber}>{losses}</Text>
            <Text style={styles.statLabel}>L</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBlock}>
            <Text style={styles.statNumber}>{draws}</Text>
            <Text style={styles.statLabel}>D</Text>
          </View>
        </View>
        {item.matches > 0 && (
          <View style={styles.winRateBar}>
            <View style={[styles.winRateFill, { width: `${(item.wins / item.matches) * 100}%`, backgroundColor: DS.success }]} />
            <View style={[styles.winRateFill, { width: `${(losses / item.matches) * 100}%`, backgroundColor: '#ef4444' }]} />
            <View style={[styles.winRateFill, { width: `${(draws / item.matches) * 100}%`, backgroundColor: DS.textMuted }]} />
          </View>
        )}
        <View style={styles.actionRow}>
          {mineTab ? (
            <TouchableOpacity style={styles.actionChip} onPress={() => setSelectedTeam(item)}>
              <Icon name="account-group" size={14} color={DS.textVariant} />
              <Text style={styles.actionChipText}>SQUAD</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.actionChip, isFollowed && styles.actionChipActive]}
              onPress={() => toggleFollow(item)}>
              <Icon name={isFollowed ? 'heart' : 'heart-outline'} size={14} color={isFollowed ? DS.bg : DS.textVariant} />
              <Text style={[styles.actionChipText, isFollowed && { color: DS.bg }]}>{isFollowed ? 'FOLLOWING' : 'FOLLOW'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.statsChip}
            onPress={() => navigation.navigate('TeamInsights', { teamId: item.id })}>
            <Icon name="chart-line" size={14} color={DS.white} />
            <Text style={[styles.actionChipText, { color: DS.white }]}>STATS</Text>
          </TouchableOpacity>
        </View>
      </PressableScale>);

  };

  const renderPlayer = ({ item }) =>
  <View style={styles.playerCard}>
      <View style={[styles.playerAvatar, { backgroundColor: getAvatarColor(item.name) }]}>
        <Text style={styles.playerAvatarText}>{getInitials(item.name)}</Text>
      </View>
      <View style={styles.playerInfo}>
        <Text style={styles.playerName}>{item.name}</Text>
        <View style={styles.rolePill}>
          <Text style={[styles.rolePillText, { color: getRoleColor(item.role) }]}>
            {item.role || 'Player'}
          </Text>
        </View>
      </View>
      <View style={styles.playerStats}>
        <Text style={styles.statText}>
          {item.runs ? `${item.runs} runs` : `${item.wickets} wkts`}
        </Text>
        <Text style={styles.matchesText}>{item.matches} matches</Text>
      </View>
    </View>;


  const closeAddPlayer = () => {
    setShowAddPlayer(false);
    setSearchPhone('');
    setFoundUser(null);
    setGuestName('');
  };

  // Add a guest player by name — no app account needed (most local players
  // aren't registered). If they join Local Legends later they can claim this
  // player and inherit its match history.
  const addGuestPlayer = async () => {
    const name = guestName.trim().replace(/\s+/g, ' ');
    if (name.length < 2) return showToast('Enter the player’s name.', 'error');
    setAddingGuest(true);
    const result = await legendsApi.createPlayer({ name, role: 'Player', teamId: selectedTeam?.id });
    setAddingGuest(false);
    if (result.success) {
      await loadData();
      closeAddPlayer();
      showToast(`${name} added to the team.`, 'success');
    } else {
      showToast(result.error || 'Failed to add player', 'error');
    }
  };

  // Look up an existing Local Legends user by their mobile number.
  const searchUser = async () => {
    const phone = searchPhone.replace(/\D/g, '');
    if (phone.length < 8) return showToast('Please enter a valid mobile number.', 'error');
    setSearching(true);
    setFoundUser(null);
    const res = await legendsApi.searchUserByPhone(phone);
    setSearching(false);
    if (res.success && res.data) setFoundUser(res.data);
    else showToast(res.error || 'No Local Legends user with that number.', 'error');
  };

  // Add the found app user to the selected team as a player.
  const addFoundPlayer = async () => {
    if (!foundUser) return;
    const name = `${foundUser.firstName || ''} ${foundUser.lastName || ''}`.trim() || 'Player';
    const result = await legendsApi.createPlayer({
      name, role: 'Player', teamId: selectedTeam?.id, userId: foundUser.id,
    });
    if (result.success) {
      await loadData();
      closeAddPlayer();
      showToast(`${name} added to the team.`, 'success');
    } else {
      showToast(result.error || 'Failed to add player', 'error');
    }
  };

  const handleCreateTeam = async () => {
    if (newTeamName.trim()) {
      const result = await legendsApi.createTeam({ name: newTeamName.trim() });
      if (result.success) {
        setNewTeamName('');
        setShowCreateTeamModal(false);
        await loadData();
        showToast('Team created!', 'success');
      } else {
        showToast(result.error || 'Failed to create team', 'error');
      }
    }
  };

  if (selectedTeam) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, inline && { paddingTop: 16 }]}>
          <TouchableOpacity onPress={() => setSelectedTeam(null)} style={styles.backButton}>
            <Icon name="arrow-left" size={24} color={DS.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            {!inline && <BrandLogo scale={0.75} />}
            <Text style={styles.headerTitle}>{selectedTeam.name}</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.teamStatsCard}>
            <Text style={styles.sectionTitle}>Team Statistics</Text>
            <View style={styles.detailStatsRow}>
              <Text style={styles.detailStatLabel}>Matches</Text>
              <Text style={styles.detailStatValue}>{selectedTeam.matches}</Text>
            </View>
            <View style={styles.detailStatsRow}>
              <Text style={styles.detailStatLabel}>Wins</Text>
              <Text style={styles.detailStatValue}>{selectedTeam.wins}</Text>
            </View>
            <View style={styles.detailStatsRow}>
              <Text style={styles.detailStatLabel}>Win Rate</Text>
              <Text style={styles.detailStatValue}>
                {selectedTeam.matches > 0 ?
                Math.round(selectedTeam.wins / selectedTeam.matches * 100) :
                0}%
              </Text>
            </View>
          </View>

          <View style={styles.playersSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Squad ({players.length})</Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowAddPlayer(true)}>
                <Icon name="account-plus" size={16} color={DS.bg} style={styles.addButtonIcon} />
                <Text style={styles.addButtonText}>Add Player</Text>
              </TouchableOpacity>
            </View>

            {showAddPlayer &&
            <View style={styles.addPlayerForm}>
                {/* Primary: add anyone by name — no app account required. */}
                <Text style={styles.addPlayerHint}>Add a player by name.</Text>
                <View style={styles.searchRow}>
                  <TextInput
                    style={[styles.playerInput, { flex: 1, marginBottom: 0 }]}
                    placeholder="Player's name"
                    placeholderTextColor={DS.textMuted}
                    value={guestName}
                    onChangeText={setGuestName}
                    autoCapitalize="words"
                    returnKeyType="done"
                    onSubmitEditing={addGuestPlayer} />
                  <TouchableOpacity style={styles.saveButton} onPress={addGuestPlayer} disabled={addingGuest}>
                    {addingGuest
                      ? <ActivityIndicator color={DS.bg} size="small" />
                      : <Text style={styles.saveButtonText}>Add</Text>}
                  </TouchableOpacity>
                </View>

                {/* Secondary: link an existing Local Legends user by number. */}
                <View style={styles.addDivider}>
                  <View style={styles.addDividerLine} />
                  <Text style={styles.addDividerTxt}>OR LINK AN APP USER</Text>
                  <View style={styles.addDividerLine} />
                </View>
                <View style={styles.searchRow}>
                  <TextInput
                    style={[styles.playerInput, { flex: 1, marginBottom: 0 }]}
                    placeholder="Registered mobile number"
                    placeholderTextColor={DS.textMuted}
                    value={searchPhone}
                    onChangeText={(t) => { setSearchPhone(t); setFoundUser(null); }}
                    keyboardType="phone-pad"
                    returnKeyType="search"
                    onSubmitEditing={searchUser} />
                  <TouchableOpacity style={styles.saveButton} onPress={searchUser} disabled={searching}>
                    {searching
                      ? <ActivityIndicator color={DS.bg} size="small" />
                      : <Text style={styles.saveButtonText}>Search</Text>}
                  </TouchableOpacity>
                </View>

                {foundUser &&
                <View style={styles.foundCard}>
                    <View style={styles.foundAvatar}>
                      <Text style={styles.foundInitial}>{(foundUser.firstName || '?')[0].toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.foundName}>{`${foundUser.firstName || ''} ${foundUser.lastName || ''}`.trim() || 'Player'}</Text>
                      <Text style={styles.foundPhone}>{foundUser.phone}</Text>
                    </View>
                    <TouchableOpacity style={styles.saveButton} onPress={addFoundPlayer}>
                      <Text style={styles.saveButtonText}>Add</Text>
                    </TouchableOpacity>
                  </View>
                }

                <TouchableOpacity style={[styles.cancelButton, { marginTop: 10 }]} onPress={closeAddPlayer}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            }

            <FlatList
              data={players}
              renderItem={renderPlayer}
              keyExtractor={(item) => item.id}
              scrollEnabled={false} />
            
          </View>
        </ScrollView>
      </View>);

  }

  return (
    <View style={styles.container}>
      {!inline && (
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <BrandLogo scale={0.75} />
            <Text style={styles.hubLabel}>ATHLETE HUB</Text>
          </View>
          <TouchableOpacity style={styles.profileIcon}>
            <Icon name="account-circle" size={32} color={DS.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Tabs moved to ListHeaderComponent */}
      <FlatList
        data={categorized[tab].filter(t => t.name.toLowerCase().includes(teamSearchQuery.toLowerCase()))}
        renderItem={renderTeam}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.teamsList}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={styles.searchWrap}>
              <Icon name="magnify" size={18} color={DS.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search teams..."
                placeholderTextColor={DS.faint}
                value={teamSearchQuery}
                onChangeText={setTeamSearchQuery}
              />
              {teamSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setTeamSearchQuery('')} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                  <Icon name="close-circle" size={18} color={DS.faint} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.tabBar}>
              {[['mine', 'My Teams'], ['opponents', 'Opponents'], ['followed', 'Followed']].map(([key, label]) => (
                <TouchableOpacity key={key} style={[styles.tabBtn, tab === key && styles.tabBtnActive]} onPress={() => setTab(key)} activeOpacity={0.8}>
                  <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
                  {categorized[key].length > 0 &&
                    <View style={[styles.tabCount, tab === key && styles.tabCountActive]}>
                      <Text style={[styles.tabCountText, tab === key && { color: DS.bg }]}>{categorized[key].length}</Text>
                    </View>}
                </TouchableOpacity>
              ))}
            </View>
            {tab !== 'mine' && (
              <Text style={styles.tabHint}>
                {tab === 'opponents'
                  ? 'Teams you’ve faced in matches. Follow them to keep track.'
                  : 'Teams you follow.'}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Icon name="account-group-outline" size={44} color={DS.surfaceHighest} />
            <Text style={styles.emptyText}>
              {tab === 'mine'
                ? 'No teams yet. Create one above.'
                : tab === 'opponents'
                ? 'No opponents yet — play a match to see teams here.'
                : 'You’re not following any teams yet.'}
            </Text>
          </View>
        } />


      <Modal
        visible={showCreateTeamModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateTeamModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Create New Team</Text>
            <Text style={styles.modalSubtitle}>Enter a name for your team</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Team name"
              placeholderTextColor={DS.textMuted}
              value={newTeamName}
              onChangeText={setNewTeamName}
              autoFocus />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setNewTeamName('');
                  setShowCreateTeamModal(false);
                }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmButton} onPress={handleCreateTeam}>
                <Text style={styles.modalConfirmText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {!selectedTeam && tab === 'mine' && (
        <AnimatedPulse style={styles.fabWrap}>
          <TouchableOpacity style={styles.fab} onPress={() => setShowCreateTeamModal(true)}>
            <Icon name="plus" size={28} color={DS.onBlue} />
          </TouchableOpacity>
        </AnimatedPulse>
      )}
    </View>);

};

const makeStyles = (DS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DS.bg
  },
  header: {
    backgroundColor: DS.surfaceLow,
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center'
  },
  brandText: {
    fontSize: 13,
    fontWeight: '600',
    color: DS.lime,
    letterSpacing: 0.5
  },
  hubLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: DS.textMuted,
    letterSpacing: 2,
    marginTop: 2
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: DS.textPrimary
  },
  profileIcon: {
    padding: 4
  },
  backButton: {
    padding: 8,
    marginRight: 8
  },
  headerSpacer: {
    width: 32
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: DS.textPrimary,
    letterSpacing: 1,
    marginBottom: 20
  },
  // CTA Card
  ctaCard: {
    backgroundColor: DS.surfaceHigh,
    borderRadius: 16,
    marginBottom: 24,
    overflow: 'hidden',
    flexDirection: 'row'
  },
  ctaAccent: {
    width: 4,
    backgroundColor: DS.blueDeep
  },
  ctaContent: {
    flex: 1,
    padding: 20
  },
  ctaTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: DS.textPrimary,
    marginBottom: 4
  },
  ctaSubtitle: {
    fontSize: 13,
    color: DS.textMuted,
    marginBottom: 16
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: DS.blueDeep,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
    elevation: 4,
    shadowColor: DS.blueDeep, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }
  },
  ctaButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: DS.onBlue,
    letterSpacing: 0.5
  },
  /* Search */
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DS.surface, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9, marginTop: 14, marginBottom: 8,
    borderWidth: 1, borderColor: DS.faint,
  },
  searchInput: { flex: 1, fontSize: 13, fontWeight: '500', color: DS.textPrimary, padding: 0 },
  fabWrap: { position: 'absolute', bottom: 24, right: 24, zIndex: 999 },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: DS.blueDeep,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    zIndex: 999,
    shadowColor: DS.blueDeep,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  // Team list
  teamsList: {
    paddingHorizontal: 20,
    paddingBottom: 20
  },
  teamCard: {
    backgroundColor: DS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: DS.faint,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  teamCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14
  },
  teamAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14
  },
  teamAvatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: DS.white
  },
  teamInfo: {
    flex: 1
  },
  teamName: {
    fontSize: 17,
    fontWeight: '700',
    color: DS.textPrimary,
    marginBottom: 2
  },
  teamSubtitle: {
    fontSize: 13,
    color: DS.textMuted
  },
  memberCount: {
    color: DS.lime,
    fontWeight: '600'
  },
  roleTag: {
    fontSize: 10,
    fontWeight: '800',
    color: DS.blueDeep,
    letterSpacing: 1.5,
    marginTop: 4
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DS.surfaceHigh,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 12
  },
  statBlock: {
    flex: 1,
    alignItems: 'center'
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: DS.textPrimary,
    fontVariant: ['tabular-nums']
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: DS.textMuted,
    marginTop: 2
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: DS.surfaceHigh
  },
  winRateBar: {
    flexDirection: 'row',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 14,
    marginHorizontal: 16,
    backgroundColor: DS.surfaceHighest,
  },
  winRateFill: {
    height: '100%',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10
  },
  actionChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: DS.faint,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6
  },
  statsChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DS.blueDeep,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6
  },
  actionChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: DS.textVariant,
    letterSpacing: 0.8
  },
  actionChipActive: { backgroundColor: DS.lime, borderColor: DS.lime },

  // Category tabs
  tabBar: {
    flexDirection: 'row', backgroundColor: DS.surfaceLow,
    marginTop: 4, marginBottom: 12,
    borderRadius: 14, padding: 4,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10, backgroundColor: 'transparent',
  },
  tabBtnActive: { backgroundColor: DS.lime, shadowColor: DS.lime, shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  tabText: { fontSize: 13, fontWeight: '800', color: DS.textMuted },
  tabTextActive: { color: DS.bg },
  tabCount: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center',
  },
  tabCountActive: { backgroundColor: 'rgba(0,0,0,0.18)' },
  tabCountText: { fontSize: 10, fontWeight: '900', color: DS.textMuted },
  tabHint: { color: DS.textMuted, fontSize: 12.5, marginBottom: 12, lineHeight: 18 },
  emptyBox: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { color: DS.textMuted, fontSize: 13.5, textAlign: 'center', paddingHorizontal: 30 },

  // Footer
  footerSection: {
    alignItems: 'center',
    paddingVertical: 24,
    marginTop: 8
  },
  footerQuestion: {
    fontSize: 15,
    color: DS.textMuted,
    marginBottom: 14
  },
  exploreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DS.lime,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8
  },
  exploreButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: DS.bg,
    letterSpacing: 0.5
  },
  // Detail view
  content: {
    flex: 1
  },
  teamStatsCard: {
    backgroundColor: DS.surfaceHigh,
    margin: 20,
    padding: 20,
    borderRadius: 16
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: DS.textPrimary,
    marginBottom: 16
  },
  detailStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: DS.surfaceHighest
  },
  detailStatLabel: {
    fontSize: 15,
    color: DS.textMuted
  },
  detailStatValue: {
    fontSize: 15,
    fontWeight: '700',
    color: DS.textPrimary
  },
  playersSection: {
    backgroundColor: DS.surfaceHigh,
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 20,
    borderRadius: 16
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DS.lime,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8
  },
  addButtonIcon: {
    marginRight: 6
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: DS.bg
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: DS.surfaceHighest
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14
  },
  playerAvatarText: {
    fontSize: 13,
    fontWeight: '700',
    color: DS.white
  },
  playerInfo: {
    flex: 1
  },
  playerName: {
    fontSize: 15,
    fontWeight: '600',
    color: DS.textPrimary,
    marginBottom: 4
  },
  rolePill: {
    alignSelf: 'flex-start',
    backgroundColor: DS.surfaceHighest,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 100
  },
  rolePillText: {
    fontSize: 11,
    fontWeight: '600'
  },
  playerStats: {
    alignItems: 'flex-end'
  },
  statText: {
    fontSize: 13,
    fontWeight: '600',
    color: DS.textPrimary
  },
  matchesText: {
    fontSize: 11,
    color: DS.textMuted,
    marginTop: 2
  },
  addPlayerForm: {
    backgroundColor: DS.surfaceLow,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16
  },
  addPlayerHint: { color: DS.textMuted, fontSize: 12.5, marginBottom: 10 },
  addDivider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14 },
  addDividerLine: { flex: 1, height: 1, backgroundColor: DS.surfaceHighest },
  addDividerTxt: { color: DS.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  foundCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12,
    backgroundColor: DS.surfaceHigh, borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: DS.lime,
  },
  foundAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: DS.surfaceHighest,
    alignItems: 'center', justifyContent: 'center',
  },
  foundInitial: { color: DS.lime, fontWeight: '900', fontSize: 16 },
  foundName: { color: DS.textPrimary, fontSize: 15, fontWeight: '700' },
  foundPhone: { color: DS.textMuted, fontSize: 12, marginTop: 1 },
  playerInput: {
    backgroundColor: DS.surfaceHighest,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    fontSize: 15,
    color: DS.textPrimary
  },
  addPlayerButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end'
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 10
  },
  cancelButtonText: {
    fontSize: 15,
    color: DS.textMuted
  },
  saveButton: {
    backgroundColor: DS.lime,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: DS.bg
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: DS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  modalContainer: {
    backgroundColor: DS.surfaceHigh,
    borderRadius: 20,
    padding: 24,
    width: '100%'
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: DS.textPrimary,
    marginBottom: 4
  },
  modalSubtitle: {
    fontSize: 14,
    color: DS.textMuted,
    marginBottom: 20
  },
  modalInput: {
    backgroundColor: DS.surfaceLow,
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    fontSize: 15,
    color: DS.textPrimary
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10
  },
  modalCancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: DS.surfaceHighest
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: DS.textMuted
  },
  modalConfirmButton: {
    backgroundColor: DS.lime,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10
  },
  modalConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: DS.bg
  }
});

export default TeamManagementScreen;
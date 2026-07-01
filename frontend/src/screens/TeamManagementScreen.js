import { useTheme, useThemedStyles } from "../theme/ThemeContext";import { useState, useEffect } from 'react';
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
  Modal } from
'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';












const AVATAR_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e91e63'];

const TeamManagementScreen = ({ navigation }) => {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [searchPhone, setSearchPhone] = useState('');
  const [foundUser, setFoundUser] = useState(null);
  const [searching, setSearching] = useState(false);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const teamsRes = await legendsApi.getTeams();
      if (teamsRes.success) {
        const mapped = (teamsRes.data || []).map((t) => ({
          id: t.id,
          name: t.name,
          city: t.city || '',
          captain: t.players && t.players[0]?.name || 'TBD',
          players: t.players ? t.players.length : 0,
          playersList: t.players || [],
          matches: 0,
          wins: 0
        }));
        setTeams(mapped);
      }
      const playersRes = await legendsApi.getPlayers();
      if (playersRes.success) {
        const mapped = (playersRes.data || []).map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          matches: p.stats?.matches || 0,
          runs: p.stats?.runs || 0,
          wickets: p.stats?.wickets || 0,
          teamName: typeof p.team === 'object' && p.team !== null ? p.team?.name : ''
        }));
        setPlayers(mapped);
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

  const renderTeam = ({ item }) => {
    const losses = item.matches - item.wins;
    const draws = 0;
    return (
      <TouchableOpacity
        style={styles.teamCard}
        onPress={() => setSelectedTeam(item)}>
        <View style={styles.teamCardTop}>
          <View style={[styles.teamAvatar, { backgroundColor: getAvatarColor(item.name) }]}>
            <Text style={styles.teamAvatarText}>{getInitials(item.name)}</Text>
          </View>
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
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionChip}
            onPress={() => setSelectedTeam(item)}>
            <Icon name="account-group" size={14} color={DS.textVariant} />
            <Text style={styles.actionChipText}>SQUAD</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionChip}
            onPress={() => navigation.navigate('TeamInsights', { teamId: item.id })}>
            <Icon name="chart-line" size={14} color={DS.textVariant} />
            <Text style={styles.actionChipText}>STATS</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>);

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
  };

  // Look up an existing Local Legends user by their mobile number.
  const searchUser = async () => {
    const phone = searchPhone.replace(/\D/g, '');
    if (phone.length < 8) return Alert.alert('Enter number', 'Please enter a valid mobile number.');
    setSearching(true);
    setFoundUser(null);
    const res = await legendsApi.searchUserByPhone(phone);
    setSearching(false);
    if (res.success && res.data) setFoundUser(res.data);
    else Alert.alert('Not found', res.error || 'No Local Legends user with that number.');
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
      Alert.alert('Success', `${name} added to the team.`);
    } else {
      Alert.alert('Error', result.error || 'Failed to add player');
    }
  };

  const handleCreateTeam = async () => {
    if (newTeamName.trim()) {
      const result = await legendsApi.createTeam({ name: newTeamName.trim() });
      if (result.success) {
        setNewTeamName('');
        setShowCreateTeamModal(false);
        await loadData();
        Alert.alert('Success', 'Team created!');
      } else {
        Alert.alert('Error', result.error || 'Failed to create team');
      }
    }
  };

  if (selectedTeam) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setSelectedTeam(null)} style={styles.backButton}>
            <Icon name="arrow-left" size={24} color={DS.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.brandText}>Local Legends</Text>
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
                <Text style={styles.addPlayerHint}>Add an existing Local Legends user by their mobile number.</Text>
                <View style={styles.searchRow}>
                  <TextInput
                    style={[styles.playerInput, { flex: 1, marginBottom: 0 }]}
                    placeholder="Player's mobile number"
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
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.brandText}>Local Legends</Text>
          <Text style={styles.hubLabel}>ATHLETE HUB</Text>
        </View>
        <TouchableOpacity style={styles.profileIcon}>
          <Icon name="account-circle" size={32} color={DS.textMuted} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={teams}
        renderItem={renderTeam}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.teamsList}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
        <View>
            <Text style={styles.pageTitle}>MY TEAMS</Text>
            {/* CTA Card */}
            <View style={styles.ctaCard}>
              <View style={styles.ctaAccent} />
              <View style={styles.ctaContent}>
                <Text style={styles.ctaTitle}>Start a New Legend</Text>
                <Text style={styles.ctaSubtitle}>Create your team and dominate the field</Text>
                <TouchableOpacity
                style={styles.ctaButton}
                onPress={() => setShowCreateTeamModal(true)}>
                  <Icon name="plus" size={16} color={DS.bg} />
                  <Text style={styles.ctaButtonText}>CREATE NEW TEAM</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        }
        ListFooterComponent={
        <View style={styles.footerSection}>
            <Text style={styles.footerQuestion}>Looking for more action?</Text>
            <TouchableOpacity style={styles.exploreButton}>
              <Icon name="compass-outline" size={18} color={DS.bg} />
              <Text style={styles.exploreButtonText}>EXPLORE LEAGUES</Text>
            </TouchableOpacity>
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
    backgroundColor: DS.lime
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
    backgroundColor: DS.lime,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6
  },
  ctaButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: DS.bg,
    letterSpacing: 0.5
  },
  // Team list
  teamsList: {
    padding: 20
  },
  teamCard: {
    backgroundColor: DS.surfaceHigh,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16
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
    color: '#ffffff'
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
    fontWeight: '700',
    color: DS.textMuted,
    letterSpacing: 1.5,
    marginTop: 4
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DS.surfaceHighest,
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
    color: DS.textPrimary
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
  actionRow: {
    flexDirection: 'row',
    gap: 10
  },
  actionChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DS.surfaceHighest,
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
    color: '#ffffff'
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
    backgroundColor: 'rgba(0,0,0,0.7)',
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
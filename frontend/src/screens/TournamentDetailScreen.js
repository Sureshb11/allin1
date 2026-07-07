import { useState, useEffect, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, Alert, TextInput
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';

const TABS = ['Overview', 'Points Table', 'Schedule'];

const makeStatusColors = (DS) => ({
  upcoming: { bg: DS.surfaceHighest, text: DS.coral },
  ongoing: { bg: '#1a2e1a', text: '#6ee76e' },
  completed: { bg: DS.surfaceHigh, text: DS.textMuted },
});

export default function TournamentDetailScreen({ route, navigation }) {
  const DS = useTheme().colors;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerBackVisible: true,
      headerTitle: 'Tournament',
    });
  }, [navigation]);
  const styles = useThemedStyles(makeStyles);
  const STATUS_COLORS = makeStatusColors(DS);
  const { tournamentId } = route.params || {};
  const [tournament, setTournament] = useState(null);
  const [pointsTable, setPointsTable] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [activeTab, setActiveTab] = useState('Overview');
  const [loading, setLoading] = useState(true);
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [selectedTeamIds, setSelectedTeamIds] = useState(new Set());
  const [myTeams, setMyTeams] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [showAutoScheduleModal, setShowAutoScheduleModal] = useState(false);
  const [scheduleFormat, setScheduleFormat] = useState('classic_t20');
  const [autoSplit, setAutoSplit] = useState(true);
  const [manualGroups, setManualGroups] = useState({});
  // Record-result modal state
  const [resultFixture, setResultFixture] = useState(null); // fixture being scored
  const [scoreA, setScoreA] = useState('');
  const [scoreB, setScoreB] = useState('');
  const [oversA, setOversA] = useState('');
  const [oversB, setOversB] = useState('');

  useEffect(() => {
    if (showAutoScheduleModal && tournament?.teams) {
      const initialGroups = {};
      tournament.teams.forEach(t => {
        if (t.group) initialGroups[t.team.id] = t.group;
      });
      setManualGroups(initialGroups);
    }
  }, [showAutoScheduleModal, tournament]);

  useEffect(() => {
    const load = async () => {
      const [tRes, stRes, ptRes, schRes] = await Promise.all([
        legendsApi.getTournament(tournamentId),
        legendsApi.getTournamentStandings(tournamentId),   // Module 2 computed table
        legendsApi.getTournamentPointsTable(tournamentId), // fallback (older API)
        legendsApi.getTournamentSchedule(tournamentId),
      ]);
      if (tRes.success) setTournament(tRes.data);
      // Prefer the computed standings; fall back to the legacy points table.
      if (stRes.success && stRes.data.length) setPointsTable(stRes.data);
      else if (ptRes.success) setPointsTable(ptRes.data);
      if (schRes.success) setSchedule(schRes.data);
      
      const myTeamsRes = await legendsApi.getTeams();
      if (myTeamsRes.success) setMyTeams(myTeamsRes.data);

      setLoading(false);
    };
    load();
  }, [tournamentId]);

  const toggleTeamSelection = (id) => {
    const next = new Set(selectedTeamIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      const currentCount = (tournament?.teams || []).length;
      if (tournament?.maxTeams && currentCount + next.size >= tournament.maxTeams) {
        alert(`Tournament is limited to ${tournament.maxTeams} teams.`);
        return;
      }
      next.add(id);
    }
    setSelectedTeamIds(next);
  };

  const handleRegisterSelectedTeams = async () => {
    if (selectedTeamIds.size === 0) return;
    setProcessing(true);
    
    // Filter out teams already in the tournament
    const existingIds = new Set((tournament?.teams || []).map(t => t.team.id));
    const toRegister = [...selectedTeamIds].filter(id => !existingIds.has(id));

    let successCount = 0;
    for (const teamId of toRegister) {
      const res = await legendsApi.registerTeamInTournament(tournamentId, teamId);
      if (res.success) successCount++;
    }

    if (successCount > 0) {
      const tRes = await legendsApi.getTournament(tournamentId);
      if (tRes.success) setTournament(tRes.data);
    }
    
    setShowTeamPicker(false);
    setSelectedTeamIds(new Set());
    setProcessing(false);
  };

  const handleRemoveTeam = async (teamId) => {
    setProcessing(true);
    const res = await legendsApi.removeTeamFromTournament(tournamentId, teamId);
    if (res.success) {
      const tRes = await legendsApi.getTournament(tournamentId);
      if (tRes.success) setTournament(tRes.data);
    } else {
      alert(res.error || 'Failed to remove team');
    }
    setProcessing(false);
  };

  const handleAutoSchedule = async () => {
    setProcessing(true);
    
    // Save manual groups if autoSplit is false
    if (!autoSplit) {
      const assignments = Object.keys(manualGroups).map(teamId => {
        const tTeam = tournament.teams.find(t => t.team.id === teamId);
        return { id: tTeam.id, group: manualGroups[teamId] };
      });
      await legendsApi.assignTournamentGroups(tournamentId, assignments);
    }
    
    const res = await legendsApi.autoScheduleTournament(tournamentId, { format: scheduleFormat, autoSplit });
    if (res.success) {
      const schRes = await legendsApi.getTournamentSchedule(tournamentId);
      if (schRes.success) setSchedule(schRes.data);
      const tRes = await legendsApi.getTournament(tournamentId);
      if (tRes.success) setTournament(tRes.data); // Reload teams for group badges
      setShowAutoScheduleModal(false);
      alert(`Successfully generated ${res.data?.count ?? ''} fixtures!`);
    } else {
      alert(res.error || 'Failed to generate schedule');
    }
    setProcessing(false);
  };

  // Re-fetch schedule + standings + teams (after a result, the bracket may have
  // advanced and the points table changed).
  const reloadData = async () => {
    const [schRes, stRes, tRes] = await Promise.all([
      legendsApi.getTournamentSchedule(tournamentId),
      legendsApi.getTournamentStandings(tournamentId),
      legendsApi.getTournament(tournamentId),
    ]);
    if (schRes.success) setSchedule(schRes.data);
    if (stRes.success && stRes.data.length) setPointsTable(stRes.data);
    if (tRes.success) setTournament(tRes.data);
  };

  const openResult = (fixture) => {
    setResultFixture(fixture);
    const defOvers = tournament?.overs ? String(tournament.overs) : '';
    const s1 = fixture.resultStats?.[fixture.team1?.id];
    const s2 = fixture.resultStats?.[fixture.team2?.id];
    setScoreA(s1?.scored != null ? String(s1.scored) : '');
    setScoreB(s2?.scored != null ? String(s2.scored) : '');
    setOversA(s1?.oversFaced != null ? String(s1.oversFaced) : defOvers);
    setOversB(s2?.oversFaced != null ? String(s2.oversFaced) : defOvers);
  };

  const submitResult = async () => {
    const f = resultFixture;
    if (!f?.team1?.id || !f?.team2?.id) return;
    const a = parseInt(scoreA, 10), b = parseInt(scoreB, 10);
    if (Number.isNaN(a) || Number.isNaN(b)) { alert('Enter both scores'); return; }
    const ovA = parseFloat(oversA) || 0, ovB = parseFloat(oversB) || 0;
    const resultKind = a === b ? 'tie' : 'win';
    const winnerTeamId = a === b ? null : (a > b ? f.team1.id : f.team2.id);
    const stats = {
      [f.team1.id]: { scored: a, conceded: b, oversFaced: ovA, oversBowled: ovB },
      [f.team2.id]: { scored: b, conceded: a, oversFaced: ovB, oversBowled: ovA },
    };
    setProcessing(true);
    const res = await legendsApi.reportTournamentResult(tournamentId, { tmId: f.id, winnerTeamId, resultKind, stats });
    if (res.success) {
      setResultFixture(null);
      await reloadData();
      if (res.data?.resolved > 0) alert('Result saved — next-round fixtures updated!');
    } else {
      alert(res.error || 'Failed to save result');
    }
    setProcessing(false);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={DS.lime} />
      </View>
    );
  }

  if (!tournament) {
    return (
      <View style={styles.centered}>
        <Icon name="alert-circle-outline" size={48} color={DS.coral} />
        <Text style={styles.errorText}>Tournament not found</Text>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[tournament.status] || STATUS_COLORS.upcoming;

  const renderOverview = () => (
    <ScrollView contentContainerStyle={styles.tabContent}>
      {/* Info Grid */}
      <View style={styles.infoGrid}>
        {[
          { icon: 'trophy-outline', label: 'Format', value: tournament.format },
          { icon: 'account-group-outline', label: 'Teams', value: `${(tournament.teams || []).length} / ${tournament.maxTeams || '—'}` },
          { icon: 'map-marker-outline', label: 'Venue', value: tournament.venue || 'TBD' },
          { icon: 'calendar-start', label: 'Start', value: tournament.startDate ? new Date(tournament.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD' },
          { icon: 'calendar-end', label: 'End', value: tournament.endDate ? new Date(tournament.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD' },
          { icon: 'currency-inr', label: 'Prize Pool', value: tournament.prizePool || 'TBD' },
        ].map(({ icon, label, value }) => (
          <View key={label} style={styles.infoCard}>
            <Icon name={icon} size={20} color={DS.lime} />
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={styles.infoValue}>{value || '—'}</Text>
          </View>
        ))}
      </View>

      {!!tournament.description && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.descText}>{tournament.description}</Text>
        </View>
      )}

      {!!tournament.organizer && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Organizer</Text>
          <View style={styles.organizerRow}>
            <Icon name="account-tie" size={18} color={DS.blue} />
            <Text style={styles.organizerText}>{tournament.organizer}</Text>
          </View>
        </View>
      )}

      {/* Registered Teams */}
      {((tournament.teams || []).length > 0 || ['upcoming', 'ongoing'].includes(tournament.status)) && (
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Registered Teams</Text>
            {['upcoming', 'ongoing'].includes(tournament.status) && (
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowTeamPicker(true)}>
                <Text style={styles.addBtnText}>+ Add Team</Text>
              </TouchableOpacity>
            )}
          </View>
          {(tournament.teams || []).map(({ team, group }) => (
            <View key={team.id} style={styles.teamRow}>
              <View style={styles.teamAvatar}>
                <Text style={styles.teamAvatarText}>{team.name?.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.teamName}>{team.name}</Text>
              <View style={styles.groupBadge}>
                <Text style={styles.groupText}>Grp {group}</Text>
              </View>
              {['upcoming', 'ongoing'].includes(tournament.status) && (
                <TouchableOpacity onPress={() => handleRemoveTeam(team.id)} disabled={processing} style={{ marginLeft: 12 }}>
                  <Icon name="trash-can-outline" size={20} color={DS.coral} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );

  // Tiebreaker column is sport-aware: cricket shows Net Run Rate, goal sports
  // show Goal Difference, everything else a generic Difference.
  const GOAL_SPORTS = ['football', 'hockey', 'handball'];
  const tbKey = tournament?.sport === 'cricket' ? 'NRR'
              : GOAL_SPORTS.includes(tournament?.sport) ? 'GD' : 'DIFF';
  const tbValue = (row) => {
    // computed-standings row has `stats`; legacy row has flat `nrr`.
    const s = row.stats;
    if (tbKey === 'NRR') { const v = s ? s.nrr : row.nrr; return `${v >= 0 ? '+' : ''}${(v || 0).toFixed(3)}`; }
    const v = s ? s.goalDifference : 0;
    return `${v > 0 ? '+' : ''}${v || 0}`;
  };
  const tbPositive = (row) => (row.stats ? (tbKey === 'NRR' ? row.stats.nrr : row.stats.goalDifference) : row.nrr) >= 0;

  // Recent form (last 5, newest first) from completed group/league fixtures.
  const formFor = (teamId) => {
    const played = schedule
      .filter(m => m.status === 'completed' && (m.team1?.id === teamId || m.team2?.id === teamId))
      .sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt))
      .slice(0, 5);
    return played.map(m => {
      if (m.resultKind === 'tie' || m.resultKind === 'draw') return 'T';
      return m.winnerTeamId === teamId ? 'W' : 'L';
    });
  };
  const FORM_C = { W: DS.lime, L: DS.coral, T: DS.textMuted };

  const renderPointsTable = () => {
    const groups = {};
    pointsTable.forEach(row => {
      const g = row.group || 'Unassigned';
      if (!groups[g]) groups[g] = [];
      groups[g].push(row);
    });
    
    const sortedGroups = Object.keys(groups).sort();
    // How many advance per group: with multiple groups, top 2 each is the norm
    // (Classic T20); a single group table highlights the top 2 as well.
    const qualifyN = 2;

    return (
      <ScrollView contentContainerStyle={styles.tabContent}>
        {pointsTable.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="table-large" size={36} color={DS.textMuted} />
            <Text style={styles.emptyText}>No results recorded yet</Text>
          </View>
        ) : (
          sortedGroups.map(groupName => (
            <View key={groupName} style={{ marginBottom: 24 }}>
              {groupName !== 'Unassigned' && (
                <Text style={{ fontSize: 16, fontWeight: '700', color: DS.textPrimary, marginBottom: 8, marginLeft: 4 }}>
                  Group {groupName}
                </Text>
              )}
              {/* Table Header */}
              <View style={[styles.ptRow, styles.ptHeader]}>
                <Text style={[styles.ptCell, styles.ptTeamCell, styles.ptHeaderText]}>#  Team</Text>
                <Text style={[styles.ptNum, styles.ptHeaderText]}>P</Text>
                <Text style={[styles.ptNum, styles.ptHeaderText]}>W</Text>
                <Text style={[styles.ptNum, styles.ptHeaderText]}>L</Text>
                <Text style={[styles.ptNum, styles.ptHeaderText]}>Pts</Text>
                <Text style={[styles.ptNum, styles.ptHeaderText]}>{tbKey}</Text>
              </View>
              
              {groups[groupName].map((row, idx) => {
                const qualifies = idx < qualifyN && (row.played || 0) > 0;
                const form = formFor(row.teamId);
                return (
                <View key={row.teamId} style={[styles.ptRow, idx % 2 === 0 && styles.ptRowAlt, qualifies && styles.ptRowQualified]}>
                  <View style={[styles.ptCell, styles.ptTeamCell]}>
                    <Text style={[styles.ptNum, { color: qualifies ? DS.lime : DS.textMuted, width: 20, fontWeight: qualifies ? '800' : '400' }]}>{idx + 1}</Text>
                    <View style={styles.ptAvatar}>
                      <Text style={styles.ptAvatarText}>{row.team?.name?.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ptTeamName} numberOfLines={1}>{row.team?.name}</Text>
                      {form.length > 0 && (
                        <View style={styles.formRow}>
                          {form.map((r, i) => (
                            <View key={i} style={[styles.formDot, { backgroundColor: FORM_C[r] }]}>
                              <Text style={styles.formDotText}>{r}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                  <Text style={styles.ptNum}>{row.played}</Text>
                  <Text style={styles.ptNum}>{row.won}</Text>
                  <Text style={styles.ptNum}>{row.lost}</Text>
                  <Text style={[styles.ptNum, { fontWeight: '700', color: DS.textPrimary }]}>{row.points}</Text>
                  <Text style={[styles.ptNum, { color: tbPositive(row) ? DS.lime : DS.coral }]}>
                    {tbValue(row)}
                  </Text>
                </View>
              );})}
              {groups[groupName].some((r) => (r.played || 0) > 0) && (
                <View style={styles.qualLegend}>
                  <View style={[styles.formDot, { backgroundColor: DS.lime, width: 8, height: 8, borderRadius: 4 }]} />
                  <Text style={styles.qualLegendText}>Top {qualifyN} advance</Text>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    );
  };

  const renderFixture = (item, index) => {
    const STATUS_C = { scheduled: DS.coral, live: '#ff4d4d', completed: '#6ee76e' };
    const completed = item.status === 'completed';
    const bothKnown = !!item.team1?.id && !!item.team2?.id;
    const canScore = bothKnown && !completed && ['upcoming', 'ongoing'].includes(tournament.status);
    const s1 = item.resultStats?.[item.team1?.id]?.scored;
    const s2 = item.resultStats?.[item.team2?.id]?.scored;
    const win1 = completed && item.winnerTeamId && item.winnerTeamId === item.team1?.id;
    const win2 = completed && item.winnerTeamId && item.winnerTeamId === item.team2?.id;
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.fixtureCard}
        activeOpacity={canScore ? 0.7 : 1}
        onPress={() => canScore && openResult(item)}>
        <View style={styles.fixtureMeta}>
          <Text style={styles.roundText}>Match {index + 1}</Text>
          {!!item.scheduledAt && (
            <Text style={styles.dateText}>
              {new Date(item.scheduledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              {'  '}
              {new Date(item.scheduledAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
        </View>
        <View style={styles.fixtureTeams}>
          <Text style={[styles.fixtureTeamName, win1 && styles.winnerName]} numberOfLines={1}>
            {item.team1?.name || item.placeholder1 || 'TBD'}{completed && s1 != null ? `  ${s1}` : ''}
          </Text>
          <View style={[styles.vsChip, { backgroundColor: STATUS_C[item.status] || DS.coral }]}>
            <Text style={styles.vsText}>{completed ? 'FT' : item.status === 'live' ? 'LIVE' : 'VS'}</Text>
          </View>
          <Text style={[styles.fixtureTeamName, win2 && styles.winnerName]} numberOfLines={1}>
            {completed && s2 != null ? `${s2}  ` : ''}{item.team2?.name || item.placeholder2 || 'TBD'}
          </Text>
        </View>
        {!!item.venue && (
          <View style={styles.venueRow}>
            <Icon name="map-marker-outline" size={12} color={DS.textMuted} />
            <Text style={styles.venueText}>{item.venue}</Text>
          </View>
        )}
        {canScore && (
          <View style={styles.scoreCta}>
            <Icon name="whistle-outline" size={13} color={DS.lime} />
            <Text style={styles.scoreCtaText}>Tap to record result</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderSchedule = () => {
    if (schedule.length === 0) {
      return (
        <View style={styles.empty}>
          <Icon name="calendar-blank-outline" size={36} color={DS.textMuted} />
          <Text style={styles.emptyText}>No fixtures scheduled</Text>
          {['upcoming', 'ongoing'].includes(tournament.status) && (tournament.teams || []).length >= 2 && (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowAutoScheduleModal(true)} disabled={processing}>
              <Text style={styles.primaryBtnText}>{processing ? 'Scheduling...' : 'Auto-Generate Schedule'}</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }
    // Group fixtures by round (preserving first-appearance order) so the list
    // reads as a bracket: Group A/B → Quarter/Semi-Final → Final.
    const rounds = [];
    const byRound = {};
    let globalIdx = 0;
    for (const f of schedule) {
      const r = f.round || 'Fixtures';
      if (!byRound[r]) { byRound[r] = []; rounds.push(r); }
      byRound[r].push({ f, idx: globalIdx++ });
    }
    const isKnockout = (r) => !r.startsWith('Group ') && r !== 'Fixtures';
    return (
      <ScrollView contentContainerStyle={styles.tabContent}>
        {rounds.map((r) => {
          const done = byRound[r].every(({ f }) => f.status === 'completed');
          return (
            <View key={r} style={styles.roundSection}>
              <View style={styles.roundHeader}>
                {isKnockout(r) && <Icon name="tournament" size={15} color={DS.lime} />}
                <Text style={styles.roundHeaderText}>{r}</Text>
                <View style={{ flex: 1 }} />
                {done && <Icon name="check-circle" size={14} color={DS.lime} />}
              </View>
              {byRound[r].map(({ f, idx }) => renderFixture(f, idx))}
            </View>
          );
        })}
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color={DS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{tournament.name}</Text>
          <View style={[styles.statusChip, { backgroundColor: statusColor.bg }]}>
            <Text style={[styles.statusText, { color: statusColor.text }]}>{tournament.status?.toUpperCase()}</Text>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map(t => (
          <TouchableOpacity key={t} style={[styles.tab, activeTab === t && styles.tabActive]} onPress={() => setActiveTab(t)}>
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'Overview' && renderOverview()}
      {activeTab === 'Points Table' && renderPointsTable()}
      {activeTab === 'Schedule' && renderSchedule()}

      {showTeamPicker && (
        <Modal transparent animationType="slide">
          <View style={styles.modalBg}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  Select Teams {tournament?.maxTeams ? `(${(tournament?.teams || []).length + selectedTeamIds.size}/${tournament.maxTeams})` : ''}
                </Text>
                <TouchableOpacity onPress={() => setShowTeamPicker(false)}>
                  <Icon name="close" size={24} color={DS.textPrimary} />
                </TouchableOpacity>
              </View>
              {myTeams.length === 0 ? (
                <Text style={styles.emptyText}>No teams available.</Text>
              ) : (
                <>
                  <ScrollView>
                    {myTeams.map(t => {
                      const isRegistered = (tournament?.teams || []).some(rt => rt.team.id === t.id);
                      const isSelected = selectedTeamIds.has(t.id);
                      return (
                        <TouchableOpacity key={t.id} style={[styles.teamSelectRow, isRegistered && { opacity: 0.5 }]} 
                                          onPress={() => !isRegistered && toggleTeamSelection(t.id)} 
                                          disabled={processing || isRegistered}>
                          <View style={styles.teamAvatar}><Text style={styles.teamAvatarText}>{t.name?.charAt(0).toUpperCase()}</Text></View>
                          <Text style={styles.teamSelectName}>{t.name} {isRegistered ? '(Registered)' : ''}</Text>
                          <View style={{ flex: 1 }} />
                          {isSelected && <Icon name="check-circle" size={20} color={DS.lime} />}
                          {!isSelected && !isRegistered && <Icon name="circle-outline" size={20} color={DS.textMuted} />}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <TouchableOpacity 
                    style={[styles.primaryBtn, { marginTop: 16 }, selectedTeamIds.size === 0 && { opacity: 0.5 }]} 
                    onPress={handleRegisterSelectedTeams} 
                    disabled={processing || selectedTeamIds.size === 0}>
                    <Text style={styles.primaryBtnText}>
                      {processing ? 'Registering...' : `Register ${selectedTeamIds.size} Team${selectedTeamIds.size !== 1 ? 's' : ''}`}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </Modal>
      )}

      {/* Auto-Schedule Modal */}
      <Modal visible={showAutoScheduleModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Auto-Generate Schedule</Text>
              <TouchableOpacity onPress={() => setShowAutoScheduleModal(false)}>
                <Icon name="close" size={24} color={DS.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.infoLabel}>Format</Text>
            <View style={{ gap: 10, marginTop: 8, marginBottom: 16 }}>
              {[
                { id: 'sudden_death', name: 'Sudden-Death Semi', rules: 'League matches followed by Semi-Finals.\nOnly the 1st Place team from each group advances.' },
                { id: 'classic_t20', name: 'Classic T20', rules: 'League matches followed by Quarter-Finals.\nThe 1st and 2nd Place teams from each group advance.' },
                { id: 'ipl_style', name: 'IPL-Style Marathon', rules: 'Big League followed by Page Playoffs.\nTop 2 advance to Q1, Eliminator, and Q2.' },
                { id: 'knockout', name: 'Pure Knockout', rules: 'Standard bracket. Losers are eliminated immediately.\nByes are automatically calculated.' }
              ].map(fmt => (
                <View key={fmt.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity style={[styles.formatBtn, scheduleFormat === fmt.id && styles.formatBtnActive]} onPress={() => setScheduleFormat(fmt.id)}>
                    <Text style={[styles.formatBtnText, scheduleFormat === fmt.id && styles.formatBtnTextActive]}>
                      {fmt.name}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => Alert.alert(fmt.name, fmt.rules)} style={styles.infoBtn}>
                    <Icon name="information-outline" size={24} color={DS.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {scheduleFormat !== 'knockout' && (
              <>
                <Text style={styles.infoLabel}>Group Assignment</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 16 }}>
                  <TouchableOpacity style={[styles.formatBtn, autoSplit && styles.formatBtnActive]} onPress={() => setAutoSplit(true)}>
                    <Text style={[styles.formatBtnText, autoSplit && styles.formatBtnTextActive]}>Auto Split</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.formatBtn, !autoSplit && styles.formatBtnActive]} onPress={() => setAutoSplit(false)}>
                    <Text style={[styles.formatBtnText, !autoSplit && styles.formatBtnTextActive]}>Manual Assign</Text>
                  </TouchableOpacity>
                </View>

                {!autoSplit && (
                  <View style={{ maxHeight: 200, marginBottom: 16, backgroundColor: DS.surfaceLow, borderRadius: 8, padding: 8 }}>
                    <ScrollView nestedScrollEnabled>
                      {(tournament?.teams || []).map(t => (
                        <View key={t.team.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, backgroundColor: DS.surfaceMedium, padding: 8, borderRadius: 8 }}>
                          <Text style={{ color: DS.textPrimary, fontWeight: '600', flex: 1 }} numberOfLines={1}>{t.team.name}</Text>
                          <View style={{ flexDirection: 'row', gap: 4 }}>
                            {['A', 'B', 'C', 'D'].map(grp => (
                              <TouchableOpacity key={grp} 
                                style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: manualGroups[t.team.id] === grp ? DS.lime : DS.surfaceHighest, borderRadius: 4 }}
                                onPress={() => setManualGroups(prev => ({ ...prev, [t.team.id]: grp }))}>
                                <Text style={{ color: manualGroups[t.team.id] === grp ? DS.bg : DS.textPrimary, fontSize: 12, fontWeight: '700' }}>{grp}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </>
            )}

            <TouchableOpacity 
              style={styles.primaryBtn} 
              onPress={() => { setShowAutoScheduleModal(false); handleAutoSchedule(); }} 
              disabled={processing}>
              <Text style={styles.primaryBtnText}>
                {processing ? 'Generating...' : 'Generate Schedule'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Record Result Modal */}
      <Modal visible={!!resultFixture} transparent animationType="slide" onRequestClose={() => setResultFixture(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Record Result</Text>
              <TouchableOpacity onPress={() => setResultFixture(null)}>
                <Icon name="close" size={24} color={DS.textPrimary} />
              </TouchableOpacity>
            </View>
            {!!resultFixture?.round && <Text style={styles.infoLabel}>{resultFixture.round}</Text>}

            <View style={styles.resultRow}>
              <Text style={styles.resultTeam} numberOfLines={1}>{resultFixture?.team1?.name}</Text>
              <TextInput
                style={styles.resultScoreInput} value={scoreA} onChangeText={setScoreA}
                keyboardType="number-pad" placeholder="0" placeholderTextColor={DS.textMuted} maxLength={4} />
              <TextInput
                style={styles.resultOversInput} value={oversA} onChangeText={setOversA}
                keyboardType="decimal-pad" placeholder="ov" placeholderTextColor={DS.textMuted} maxLength={4} />
            </View>
            <View style={styles.resultRow}>
              <Text style={styles.resultTeam} numberOfLines={1}>{resultFixture?.team2?.name}</Text>
              <TextInput
                style={styles.resultScoreInput} value={scoreB} onChangeText={setScoreB}
                keyboardType="number-pad" placeholder="0" placeholderTextColor={DS.textMuted} maxLength={4} />
              <TextInput
                style={styles.resultOversInput} value={oversB} onChangeText={setOversB}
                keyboardType="decimal-pad" placeholder="ov" placeholderTextColor={DS.textMuted} maxLength={4} />
            </View>
            <Text style={styles.resultHint}>Score and overs (overs optional — used for Net Run Rate). Higher score wins; equal = tie.</Text>

            <TouchableOpacity style={styles.primaryBtn} onPress={submitResult} disabled={processing}>
              <Text style={styles.primaryBtnText}>{processing ? 'Saving...' : 'Save Result'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.bg },
  errorText: { fontSize: 18, fontWeight: '700', color: DS.coral, marginTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: DS.surfaceLow, paddingTop: 48, paddingBottom: 14, paddingHorizontal: 16, gap: 8 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: DS.textPrimary },
  statusChip: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginTop: 4 },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  tabs: { flexDirection: 'row', backgroundColor: DS.surfaceLow },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: DS.lime },
  tabText: { fontSize: 13, fontWeight: '600', color: DS.textMuted },
  tabTextActive: { color: DS.lime, fontWeight: '700' },
  tabContent: { padding: 16, gap: 12 },

  // Overview
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  infoCard: { width: '47%', backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 12, alignItems: 'center' },
  infoLabel: { fontSize: 11, color: DS.textMuted, marginTop: 4 },
  infoValue: { fontSize: 13, fontWeight: '700', color: DS.textPrimary, marginTop: 2, textAlign: 'center' },
  section: { backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: DS.textPrimary, marginBottom: 10 },
  descText: { fontSize: 14, color: DS.textVariant, lineHeight: 20 },
  organizerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  organizerText: { fontSize: 14, fontWeight: '600', color: DS.textPrimary },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  teamAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center' },
  teamAvatarText: { fontSize: 13, fontWeight: '700', color: DS.lime },
  teamName: { flex: 1, fontSize: 14, fontWeight: '600', color: DS.textPrimary },
  groupBadge: { backgroundColor: DS.surfaceHighest, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  groupText: { fontSize: 11, color: DS.lime, fontWeight: '700' },

  // Points Table
  ptRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4 },
  ptRowAlt: { backgroundColor: DS.surfaceLow },
  ptHeader: { backgroundColor: DS.surfaceHighest, borderRadius: 8 },
  ptHeaderText: { color: DS.textPrimary, fontWeight: '700' },
  ptCell: { flexDirection: 'row', alignItems: 'center' },
  ptTeamCell: { flex: 1, gap: 6 },
  ptAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center' },
  ptAvatarText: { fontSize: 11, color: DS.lime, fontWeight: '700' },
  ptTeamName: { fontSize: 12, color: DS.textPrimary },
  ptNum: { width: 36, textAlign: 'center', fontSize: 12, color: DS.textPrimary },
  ptBold: { fontWeight: '700', color: DS.lime },
  ptRowQualified: { borderLeftWidth: 3, borderLeftColor: DS.lime },
  formRow: { flexDirection: 'row', gap: 3, marginTop: 3 },
  formDot: { width: 14, height: 14, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  formDotText: { fontSize: 8, fontWeight: '800', color: DS.bg },
  qualLegend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginLeft: 4 },
  qualLegendText: { fontSize: 10, color: DS.textMuted },

  // Schedule
  roundSection: { marginBottom: 20, gap: 10 },
  roundHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  roundHeaderText: { fontSize: 14, fontWeight: '800', color: DS.textPrimary, letterSpacing: 0.3 },
  fixtureCard: { backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 16 },
  fixtureMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  roundText: { fontSize: 11, color: DS.textMuted, fontWeight: '600' },
  dateText: { fontSize: 11, color: DS.textMuted },
  fixtureTeams: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  fixtureTeamName: { flex: 1, fontSize: 13, fontWeight: '700', color: DS.textPrimary, textAlign: 'center' },
  winnerName: { color: DS.lime },
  vsChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  vsText: { fontSize: 10, fontWeight: '700', color: DS.bg },
  venueRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  venueText: { fontSize: 12, color: DS.textMuted },
  scoreCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: DS.line },
  scoreCtaText: { fontSize: 11, fontWeight: '700', color: DS.lime },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  resultTeam: { flex: 1, fontSize: 14, fontWeight: '700', color: DS.textPrimary },
  resultScoreInput: { width: 64, backgroundColor: DS.surfaceLow, borderRadius: 8, paddingVertical: 8, textAlign: 'center', fontSize: 16, fontWeight: '800', color: DS.textPrimary },
  resultOversInput: { width: 48, backgroundColor: DS.surfaceLow, borderRadius: 8, paddingVertical: 8, textAlign: 'center', fontSize: 13, color: DS.textPrimary },
  resultHint: { fontSize: 11, color: DS.textMuted, marginTop: 10 },
  addBtn: { backgroundColor: DS.surfaceHigh, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: DS.line },
  addBtnText: { fontSize: 13, fontWeight: '700', color: DS.textPrimary },
  primaryBtn: { backgroundColor: DS.lime, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16, marginTop: 20 },
  primaryBtnText: { fontSize: 14, fontWeight: '800', color: DS.bg },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: DS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: DS.textPrimary },
  teamSelectRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: DS.line },
  teamSelectName: { fontSize: 16, fontWeight: '700', color: DS.textPrimary },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 14, fontWeight: '600', color: DS.textMuted, marginTop: 10 },
  formatBtn: { flex: 1, backgroundColor: DS.surfaceHighest, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  formatBtnActive: { backgroundColor: DS.lime },
  formatBtnText: { fontSize: 13, fontWeight: '700', color: DS.textPrimary },
  formatBtnTextActive: { color: DS.bg },
  infoBtn: { padding: 4 }
});

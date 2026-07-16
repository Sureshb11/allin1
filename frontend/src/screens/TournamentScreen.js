import { useTheme, useThemedStyles } from "../theme/ThemeContext";import React, { useState, useEffect, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, Alert, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import GradientButton from '../components/GradientButton';
import { useHideTabBarOnScroll, useTabBarClearance } from '../components/AutoHideTabBar';
import { showToast } from '../components/Toast';














const TournamentScreen = ({ navigation, route }) => {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const hideTabBar = useHideTabBarOnScroll();
  const tabClear = useTabBarClearance();
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  // Opened via the "Create Tournament" route → start with the form open.
  const [showCreateForm, setShowCreateForm] = useState(route?.params?.openCreate ?? true);
  const [creating, setCreating] = useState(false);
  // The logged-in user is the organiser of anything they create — stamped onto the
  // tournament so it shows in the Overview's "Organizer" section.
  const [organizerName, setOrganizerName] = useState('');
  const [form, setForm] = useState({ name: '', format: 'T20', overs: '20', ballType: 'Leather', venue: '', prizePool: '', maxTeams: '' });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerBackVisible: true,
      headerTitle: 'Tournaments',
    });
  }, [navigation]);

  useEffect(() => {loadTournaments(); loadOrganizer();}, []);

  const loadOrganizer = async () => {
    try {
      const res = await legendsApi.getMe();
      if (res.success) {
        const u = res.data?.user, p = res.data?.player;
        const name = `${u?.firstName || ''} ${u?.lastName || ''}`.trim() || p?.name || '';
        if (name) setOrganizerName(name);
      }
    } catch (e) {}
  };

  const loadTournaments = async () => {
    try {
      const res = await legendsApi.getTournaments();
      if (res.success) setTournaments(res.data);
    } catch (e) {} finally {setLoading(false);}
  };

  const createTournament = async () => {
    if (!form.name.trim()) return showToast('Tournament name is required', 'error');
    setCreating(true);
    try {
      const res = await legendsApi.createTournament({
        name: form.name.trim(),
        format: form.format,
        overs: form.overs ? parseInt(form.overs, 10) : undefined,
        ballType: form.ballType,
        venue: form.venue.trim() || undefined,
        prizePool: form.prizePool.trim() || undefined,
        maxTeams: form.maxTeams ? parseInt(form.maxTeams, 10) : undefined,
        organizer: organizerName || undefined,
        status: 'upcoming'
      });
      if (res.success) {
        showToast('Tournament created!', 'success');
        setShowCreateForm(false);
        setForm({ name: '', format: 'T20', overs: '20', ballType: 'Leather', venue: '', prizePool: '', maxTeams: '' });
        loadTournaments();
      } else showToast(res.error || 'Failed to create', 'error');
    } catch (e) {showToast('Something went wrong', 'error');} finally {setCreating(false);}
  };

  // Start button was previously dead (no handler) — kicks the tournament live.
  const startTournament = async (t) => {
    const res = await legendsApi.updateTournament(t.id, { status: 'ongoing' });
    if (res.success) {
      showToast(`${t.name} is live!`, 'success');
      loadTournaments();
    } else showToast(res.error || 'Could not start tournament', 'error');
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ongoing':return '#ff4d4d';
      case 'upcoming':return DS.coral;
      case 'completed':return '#6ee76e';
      default:return DS.textMuted;
    }
  };

  const renderTournament = ({ item }) =>
  <TouchableOpacity style={styles.tournamentCard}>
      <View style={styles.tournamentHeader}>
        <View>
          <Text style={styles.tournamentName}>{item.name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{(item.status || '').toUpperCase()}</Text>
          </View>
        </View>
        {item.status === 'upcoming' && (
          <TouchableOpacity style={styles.startButton} onPress={() => startTournament(item)}>
            <Icon name="play-circle-outline" size={20} color={DS.onBlue} />
            <Text style={styles.startButtonText}>Start</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.tournamentDetails}>
        <View style={styles.detailRow}><Text style={styles.detailLabel}>Format:</Text><Text style={styles.detailValue}>{item.format}{item.overs ? ` · ${item.overs} ov` : ''}</Text></View>
        {item.ballType && <View style={styles.detailRow}><Text style={styles.detailLabel}>Ball:</Text><Text style={styles.detailValue}>{item.ballType}</Text></View>}
        {item.venue && <View style={styles.detailRow}><Text style={styles.detailLabel}>Venue:</Text><Text style={styles.detailValue}>{item.venue}</Text></View>}
        {item.prizePool && <View style={styles.detailRow}><Text style={styles.detailLabel}>Prize Pool:</Text><Text style={styles.detailValue}>{item.prizePool}</Text></View>}
        {item.maxTeams && <View style={styles.detailRow}><Text style={styles.detailLabel}>Max Teams:</Text><Text style={styles.detailValue}>{item.maxTeams}</Text></View>}
        {item.startDate && <View style={styles.detailRow}><Text style={styles.detailLabel}>Start:</Text><Text style={styles.detailValue}>{new Date(item.startDate).toLocaleDateString()}</Text></View>}
      </View>
    </TouchableOpacity>;


  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tournaments</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setShowCreateForm(!showCreateForm)}>
          <Text style={styles.createButtonText}>{showCreateForm ? 'Cancel' : '+ Create'}</Text>
        </TouchableOpacity>
      </View>

      {showCreateForm &&
      <View style={styles.createForm}>
          <Text style={styles.formTitle}>Create New Tournament</Text>
          <TextInput style={styles.formInput} placeholder="Tournament Name" placeholderTextColor={DS.textMuted} value={form.name} onChangeText={(t) => setForm({ ...form, name: t })} />
          <Text style={styles.formLabel}>Format</Text>
          <View style={styles.formatRow}>
            {['T20', 'ODI', 'Test', 'Custom'].map((f) => {
              const OVERS = { T20: '20', ODI: '50', Test: '90' };
              return (
                <TouchableOpacity
                  key={f}
                  style={[styles.formatChip, form.format === f && styles.formatChipActive]}
                  onPress={() => setForm({ ...form, format: f, overs: OVERS[f] ?? form.overs })}>
                  <Text style={[styles.formatChipText, form.format === f && styles.formatChipTextActive]}>{f}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.formLabel}>Overs per side</Text>
          <TextInput
            style={styles.formInput}
            placeholder="Overs (e.g. 20)"
            placeholderTextColor={DS.textMuted}
            value={form.overs}
            onChangeText={(t) => setForm({ ...form, overs: t.replace(/\D/g, '').slice(0, 3) })}
            keyboardType="numeric"
            editable={form.format === 'Custom'} />

          <Text style={styles.formLabel}>Ball</Text>
          <View style={styles.formatRow}>
            {['Leather', 'Tennis', 'Rubber'].map((b) =>
          <TouchableOpacity key={b} style={[styles.formatChip, form.ballType === b && styles.formatChipActive]} onPress={() => setForm({ ...form, ballType: b })}>
                <Text style={[styles.formatChipText, form.ballType === b && styles.formatChipTextActive]}>{b}</Text>
              </TouchableOpacity>
          )}
          </View>

          <TextInput style={styles.formInput} placeholder="Venue" placeholderTextColor={DS.textMuted} value={form.venue} onChangeText={(t) => setForm({ ...form, venue: t })} />
          <TextInput style={styles.formInput} placeholder="Prize Pool (e.g. ₹5,00,000)" placeholderTextColor={DS.textMuted} value={form.prizePool} onChangeText={(t) => setForm({ ...form, prizePool: t })} />
          <TextInput style={styles.formInput} placeholder="Max Teams" placeholderTextColor={DS.textMuted} value={form.maxTeams} onChangeText={(t) => setForm({ ...form, maxTeams: t })} keyboardType="numeric" />
          <GradientButton
            label="Create Tournament"
            icon="trophy-outline"
            onPress={createTournament}
            loading={creating}
            height={48}
            style={{ marginTop: 5 }}
          />
        </View>
      }

      {loading ?
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color={DS.lime} /></View> :

      <FlatList data={tournaments} renderItem={renderTournament} keyExtractor={(item) => item.id}
      {...hideTabBar}
      contentContainerStyle={[styles.tournamentsList, { paddingBottom: 15 + tabClear }]}
      ListEmptyComponent={<View style={{ alignItems: 'center', paddingTop: 60 }}><Text style={{ fontSize: 16, color: DS.textMuted }}>No tournaments yet</Text></View>} />

      }
    </View>);

};

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  header: { backgroundColor: DS.surfaceLow, padding: 20, paddingTop: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: DS.textPrimary },
  createButton: { backgroundColor: DS.lime, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
  createButtonText: { color: DS.bg, fontSize: 14, fontWeight: '700' },
  createForm: { backgroundColor: DS.surfaceHigh, margin: 15, padding: 20, borderRadius: 16 },
  formTitle: { fontSize: 18, fontWeight: '600', color: DS.textPrimary, marginBottom: 15 },
  formLabel: { fontSize: 14, fontWeight: '600', color: DS.textVariant, marginBottom: 6, marginTop: 10 },
  formInput: { backgroundColor: DS.surfaceHighest, borderRadius: 8, padding: 12, marginBottom: 10, color: DS.textPrimary, fontSize: 14 },
  formatRow: { flexDirection: 'row', marginBottom: 10 },
  formatChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, marginRight: 8, backgroundColor: DS.surfaceHighest },
  formatChipActive: { backgroundColor: DS.lime },
  formatChipText: { color: DS.textVariant, fontWeight: '600' },
  formatChipTextActive: { color: DS.bg },
  createFormButton: { backgroundColor: DS.lime, paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 5 },
  createFormButtonText: { color: DS.bg, fontSize: 14, fontWeight: '700' },
  tournamentsList: { padding: 15 },
  tournamentCard: { backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 20, marginBottom: 15 },
  tournamentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
  tournamentName: { fontSize: 18, fontWeight: '600', color: DS.textPrimary, flex: 1, marginRight: 10 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 10, color: DS.bg, fontWeight: '700' },
  // Solid electric-blue Action-Taker per the design system.
  startButton: { flexDirection: 'row', backgroundColor: DS.blueDeep, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignItems: 'center', gap: 6 },
  startButtonText: { color: DS.onBlue, fontSize: 12, fontWeight: '700' },
  tournamentDetails: { marginBottom: 5 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  detailLabel: { fontSize: 14, color: DS.textMuted, flex: 1 },
  detailValue: { fontSize: 14, color: DS.textPrimary, fontWeight: '500', flex: 2, textAlign: 'right' }
});

export default TournamentScreen;
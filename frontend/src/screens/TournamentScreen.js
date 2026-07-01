import { useTheme, useThemedStyles } from "../theme/ThemeContext";import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, Alert, ActivityIndicator } from 'react-native';
import legendsApi from '../services/LegendsApi';














const TournamentScreen = ({ navigation, route }) => {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  // Opened via the "Create Tournament" route → start with the form open.
  const [showCreateForm, setShowCreateForm] = useState(route?.params?.openCreate ?? true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', format: 'T20', venue: '', prizePool: '', maxTeams: '' });

  useEffect(() => {loadTournaments();}, []);

  const loadTournaments = async () => {
    try {
      const res = await legendsApi.getTournaments();
      if (res.success) setTournaments(res.data);
    } catch (e) {} finally {setLoading(false);}
  };

  const createTournament = async () => {
    if (!form.name.trim()) return Alert.alert('Error', 'Tournament name is required');
    setCreating(true);
    try {
      const res = await legendsApi.createTournament({
        name: form.name.trim(),
        format: form.format,
        venue: form.venue.trim() || undefined,
        prizePool: form.prizePool.trim() || undefined,
        maxTeams: form.maxTeams ? parseInt(form.maxTeams, 10) : undefined,
        status: 'upcoming'
      });
      if (res.success) {
        Alert.alert('Success', 'Tournament created!');
        setShowCreateForm(false);
        setForm({ name: '', format: 'T20', venue: '', prizePool: '', maxTeams: '' });
        loadTournaments();
      } else Alert.alert('Error', res.error || 'Failed to create');
    } catch (e) {Alert.alert('Error', 'Something went wrong');} finally {setCreating(false);}
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
        <Text style={styles.tournamentName}>{item.name}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{(item.status || '').toUpperCase()}</Text>
        </View>
      </View>
      <View style={styles.tournamentDetails}>
        <View style={styles.detailRow}><Text style={styles.detailLabel}>Format:</Text><Text style={styles.detailValue}>{item.format}</Text></View>
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
            {['T20', 'ODI', 'Test'].map((f) =>
          <TouchableOpacity key={f} style={[styles.formatChip, form.format === f && styles.formatChipActive]} onPress={() => setForm({ ...form, format: f })}>
                <Text style={[styles.formatChipText, form.format === f && styles.formatChipTextActive]}>{f}</Text>
              </TouchableOpacity>
          )}
          </View>
          <TextInput style={styles.formInput} placeholder="Venue" placeholderTextColor={DS.textMuted} value={form.venue} onChangeText={(t) => setForm({ ...form, venue: t })} />
          <TextInput style={styles.formInput} placeholder="Prize Pool (e.g. ₹5,00,000)" placeholderTextColor={DS.textMuted} value={form.prizePool} onChangeText={(t) => setForm({ ...form, prizePool: t })} />
          <TextInput style={styles.formInput} placeholder="Max Teams" placeholderTextColor={DS.textMuted} value={form.maxTeams} onChangeText={(t) => setForm({ ...form, maxTeams: t })} keyboardType="numeric" />
          <TouchableOpacity style={styles.createFormButton} onPress={createTournament} disabled={creating}>
            {creating ? <ActivityIndicator color={DS.bg} /> : <Text style={styles.createFormButtonText}>Create Tournament</Text>}
          </TouchableOpacity>
        </View>
      }

      {loading ?
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color={DS.lime} /></View> :

      <FlatList data={tournaments} renderItem={renderTournament} keyExtractor={(item) => item.id}
      contentContainerStyle={styles.tournamentsList}
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
  tournamentDetails: { marginBottom: 5 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  detailLabel: { fontSize: 14, color: DS.textMuted, flex: 1 },
  detailValue: { fontSize: 14, color: DS.textPrimary, fontWeight: '500', flex: 2, textAlign: 'right' }
});

export default TournamentScreen;
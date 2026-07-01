import { useTheme, useThemedStyles } from "../theme/ThemeContext";import React, { useState, useEffect, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import legendsApi from '../services/LegendsApi';














const EditTeamProfileScreen = ({ navigation, route }) => {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const { teamId } = route.params || {};
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [teamProfile, setTeamProfile] = useState({
    teamName: '', city: '', state: '', country: '', homeGround: '',
    teamColors: '', bio: '', achievements: '', foundedYear: ''
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerBackVisible: true,
      headerTitle: 'Edit Team',
    });
  }, [navigation]);

  useEffect(() => {
    if (teamId) loadTeam();
  }, []);

  const loadTeam = async () => {
    setLoading(true);
    try {
      const res = await legendsApi.getTeam(teamId);
      if (res.success && res.data) {
        const t = res.data;
        setTeamProfile({
          teamName: t.name || '', city: t.city || '', state: t.state || '',
          country: t.country || '', homeGround: t.homeGround || '',
          teamColors: t.colors || '', bio: t.bio || '',
          achievements: t.achievements || '',
          foundedYear: t.foundedYear ? String(t.foundedYear) : ''
        });
      }
    } catch (e) {/* ignore */} finally {setLoading(false);}
  };

  const handleSave = async () => {
    if (!teamProfile.teamName.trim()) return Alert.alert('Error', 'Team name is required');
    setSaving(true);
    try {
      const data = {
        name: teamProfile.teamName.trim(),
        city: teamProfile.city.trim() || undefined,
        state: teamProfile.state.trim() || undefined,
        country: teamProfile.country.trim() || undefined,
        homeGround: teamProfile.homeGround.trim() || undefined,
        colors: teamProfile.teamColors.trim() || undefined,
        bio: teamProfile.bio.trim() || undefined,
        achievements: teamProfile.achievements.trim() || undefined,
        foundedYear: teamProfile.foundedYear ? parseInt(teamProfile.foundedYear, 10) : undefined
      };
      const res = teamId ? await legendsApi.updateTeam(teamId, data) : await legendsApi.createTeam(data);
      if (res.success) {Alert.alert('Success', 'Team profile saved!');navigation.goBack();} else
      Alert.alert('Error', res.error || 'Failed to save');
    } catch (e) {Alert.alert('Error', 'Something went wrong');} finally {setSaving(false);}
  };

  if (loading) return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={DS.lime} /></View>;

  const fields = [
  { key: 'teamName', label: 'Team Name' }, { key: 'city', label: 'City' }, { key: 'state', label: 'State' },
  { key: 'country', label: 'Country' }, { key: 'homeGround', label: 'Home Ground' },
  { key: 'foundedYear', label: 'Founded Year', keyboard: 'numeric' }, { key: 'teamColors', label: 'Team Colors' },
  { key: 'bio', label: 'Bio', multiline: true }, { key: 'achievements', label: 'Achievements', multiline: true }];


  return (
    <ScrollView style={styles.container}>
      <View style={styles.form}>
        {fields.map((f) =>
        <View key={f.key} style={styles.inputGroup}>
            <Text style={styles.label}>{f.label}</Text>
            <TextInput style={[styles.input, f.multiline && styles.textArea]} value={teamProfile[f.key]}
          onChangeText={(text) => setTeamProfile({ ...teamProfile, [f.key]: text })}
          placeholderTextColor={DS.textMuted}
          keyboardType={f.keyboard || 'default'} multiline={f.multiline} numberOfLines={f.multiline ? 3 : 1} />
          </View>
        )}
        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={DS.bg} /> : <Text style={styles.saveButtonText}>Save Team Profile</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>);

};

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  form: { padding: 16 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: DS.textMuted, marginBottom: 8 },
  input: { backgroundColor: DS.surfaceLow, borderRadius: 10, padding: 12, fontSize: 16, color: DS.textPrimary },
  textArea: { height: 80, textAlignVertical: 'top' },
  saveButton: { backgroundColor: DS.lime, paddingVertical: 15, borderRadius: 10, alignItems: 'center', marginTop: 20 },
  saveButtonText: { color: DS.bg, fontSize: 16, fontWeight: '600' }
});

export default EditTeamProfileScreen;
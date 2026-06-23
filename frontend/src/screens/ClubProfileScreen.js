import { useTheme, useThemedStyles } from "../theme/ThemeContext";import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import legendsApi from '../services/LegendsApi';














const ClubProfileScreen = ({ navigation, route }) => {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const { clubId } = route.params || {};
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({
    clubName: '', president: '', secretary: '', foundedYear: '', address: '',
    city: '', state: '', country: '', phone: '', email: '', website: '',
    membershipFee: '', facilities: '', bio: ''
  });

  useEffect(() => {if (clubId) loadClub();}, []);

  const loadClub = async () => {
    setLoading(true);
    try {
      const res = await legendsApi.getClub(clubId);
      if (res.success && res.data) {
        const c = res.data;
        setProfile({
          clubName: c.name || '', president: c.president || '', secretary: c.secretary || '',
          foundedYear: c.foundedYear ? String(c.foundedYear) : '',
          address: c.address || '', city: c.city || '', state: c.state || '', country: c.country || '',
          phone: c.phone || '', email: c.email || '', website: c.website || '',
          membershipFee: c.membershipFee || '',
          facilities: Array.isArray(c.facilities) ? c.facilities.join(', ') : c.facilities || '',
          bio: c.bio || ''
        });
      }
    } catch (e) {} finally {setLoading(false);}
  };

  const handleSave = async () => {
    if (!profile.clubName.trim()) return Alert.alert('Error', 'Club name is required');
    setSaving(true);
    try {
      const data = {
        name: profile.clubName.trim(),
        president: profile.president.trim() || undefined,
        secretary: profile.secretary.trim() || undefined,
        foundedYear: profile.foundedYear ? parseInt(profile.foundedYear, 10) : undefined,
        address: profile.address.trim() || undefined,
        city: profile.city.trim() || undefined, state: profile.state.trim() || undefined,
        country: profile.country.trim() || undefined, phone: profile.phone.trim() || undefined,
        email: profile.email.trim() || undefined, website: profile.website.trim() || undefined,
        membershipFee: profile.membershipFee.trim() || undefined,
        facilities: profile.facilities ? profile.facilities.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        bio: profile.bio.trim() || undefined
      };
      const res = clubId ? await legendsApi.updateClub(clubId, data) : await legendsApi.createClub(data);
      if (res.success) {Alert.alert('Success', 'Club profile saved!');navigation.goBack();} else
      Alert.alert('Error', res.error || 'Failed to save');
    } catch (e) {Alert.alert('Error', 'Something went wrong');} finally {setSaving(false);}
  };

  if (loading) return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={DS.lime} /></View>;

  const fields = [
  { key: 'clubName', label: 'Club Name' }, { key: 'president', label: 'President' }, { key: 'secretary', label: 'Secretary' },
  { key: 'foundedYear', label: 'Founded Year', keyboard: 'numeric' }, { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' }, { key: 'state', label: 'State' }, { key: 'country', label: 'Country' },
  { key: 'phone', label: 'Phone', keyboard: 'phone-pad' }, { key: 'email', label: 'Email', keyboard: 'email-address' },
  { key: 'website', label: 'Website' }, { key: 'membershipFee', label: 'Membership Fee' },
  { key: 'facilities', label: 'Facilities (comma separated)', multiline: true }, { key: 'bio', label: 'Bio', multiline: true }];


  return (
    <ScrollView style={styles.container}>
      <View style={styles.form}>
        {fields.map((f) =>
        <View key={f.key} style={styles.inputGroup}>
            <Text style={styles.label}>{f.label}</Text>
            <TextInput style={[styles.input, f.multiline && styles.textArea]} value={profile[f.key]}
          onChangeText={(text) => setProfile({ ...profile, [f.key]: text })}
          placeholderTextColor={DS.textMuted}
          keyboardType={f.keyboard || 'default'} multiline={f.multiline} numberOfLines={f.multiline ? 3 : 1} />
          </View>
        )}
        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={DS.bg} /> : <Text style={styles.saveButtonText}>Save Club Profile</Text>}
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

export default ClubProfileScreen;
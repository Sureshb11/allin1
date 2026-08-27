import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import React, { useState, useEffect, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, Image, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import PlayerRoleFields from '../components/PlayerRoleFields';
import { validatePlayerProfile } from '../sports/cricketProfile';
import legendsApi from '../services/LegendsApi';
import { pickAndUploadImage } from '../utils/imageUpload';
import { setCurrentAvatar } from '../utils/currentUser';
import { getSelectedSport } from '../utils/selectedSport';
import { getFind } from '../sports/find';

const EditPlayerProfileScreen = ({ navigation }) => {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  
  const sportId = getSelectedSport().sport?.id || 'cricket';
  const sportRoles = getFind(sportId).roles || [];

  const [profile, setProfile] = useState({
    name: '', email: '', phone: '', city: '', district: '', state: '', country: '', pincode: '',
    primaryRole: null, battingStyle: null, bowlingStyle: null, dateOfBirth: '', height: '', weight: '', bio: '',
  });
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [citySuggest, setCitySuggest] = useState([]);
  const cityTimer = React.useRef(null);

  const onCityChange = (text) => {
    setProfile((prev) => ({ ...prev, city: text }));
    if (cityTimer.current) clearTimeout(cityTimer.current);
    if (text.trim().length < 2) { setCitySuggest([]); return; }
    cityTimer.current = setTimeout(async () => {
      const res = await legendsApi.searchPincodes(text.trim());
      setCitySuggest(res.data || []);
    }, 250);
  };

  const pickCity = (s) => {
    setProfile((prev) => ({ ...prev, city: s.city, district: s.district, state: s.state, country: s.country || 'India', pincode: s.pincode }));
    setCitySuggest([]);
  };

  const changeAvatar = async () => {
    setUploadingAvatar(true);
    const r = await pickAndUploadImage('avatars');
    setUploadingAvatar(false);
    if (r.url) {
      setAvatarUrl(r.url);
      setCurrentAvatar(r.url);
      const saved = await legendsApi.updateUserProfile({ avatarUrl: r.url });
      if (!saved.success) Alert.alert('Could not save photo', saved.error || 'Please try again');
    } else if (r.error) {
      Alert.alert('Upload failed', r.error);
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerBackVisible: true,
      headerTitle: 'Edit Profile',
    });
  }, [navigation]);

  useEffect(() => {
    legendsApi.getUserProfile().then((res) => {
      const u = res?.success ? (res.data || {}) : {};
      const p = res?.player || null;
      const name = u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim();
      setProfile((prev) => ({
        ...prev, name, phone: u.phone || '', bio: u.bio || '',
        city: u.city || '', district: u.district || '', state: u.state || '', country: u.country || '', pincode: u.pincode || '',
        primaryRole: p?.role && p.role !== 'Player' ? p.role : null,
        battingStyle: p?.battingStyle || null,
        bowlingStyle: p?.bowlingStyle || null,
      }));
      if (u.avatarUrl) setAvatarUrl(u.avatarUrl);
    });
  }, []);

  const [errors, setErrors] = useState({});

  const handleSave = async () => {
    // Only validate cricket-specific fields if sport is cricket
    if (sportId === 'cricket') {
      const problems = validatePlayerProfile(profile);
      setErrors(problems);
      if (Object.keys(problems).length) {
        return Alert.alert('Almost there', Object.values(problems)[0]);
      }
    }
    
    setSaving(true);
    const parts = (profile.name || '').trim().split(/\s+/);
    const firstName = parts.shift() || 'Player';
    const lastName = parts.join(' ') || '-';
    const res = await legendsApi.updateUserProfile({
      firstName, lastName, bio: profile.bio || null,
      city: profile.city || null, district: profile.district || null,
      state: profile.state || null, country: profile.country || null, pincode: profile.pincode || null,
    });
    
    let playerSaved = true;
    if (res.success) {
      const saved = await legendsApi.saveMyPlayer({
        sport: sportId,
        role: profile.primaryRole,
        battingStyle: sportId === 'cricket' ? profile.battingStyle : null,
        bowlingStyle: sportId === 'cricket' ? profile.bowlingStyle : null,
      });
      playerSaved = saved.success;
      if (!saved.success) Alert.alert('Saved, mostly', saved.error || 'Could not save how you play.');
    }
    setSaving(false);
    if (res.success) {
      if (playerSaved) Alert.alert('Success', 'Profile updated.');
      navigation.goBack();
    } else {
      Alert.alert('Error', res.error || 'Could not update profile.');
    }
  };

  return (
    <ScrollView style={styles.container}>

      <View style={styles.form}>
        <View style={[styles.row, { alignItems: 'flex-end', marginBottom: 16 }]}>
          <View style={styles.avatarWrapRow}>
            <TouchableOpacity style={styles.avatarCircleRow} onPress={changeAvatar} activeOpacity={0.85}>
              {avatarUrl
                ? <Image source={{ uri: avatarUrl }} style={styles.avatarImgRow} />
                : <Text style={styles.avatarInitialRow}>{(profile.name || '?').charAt(0).toUpperCase()}</Text>}
              <View style={styles.avatarBadgeRow}>
                {uploadingAvatar ? <ActivityIndicator size="small" color={DS.bg} /> : <Icon name="camera" size={14} color={DS.bg} />}
              </View>
            </TouchableOpacity>
          </View>
          <View style={[styles.inputGroup, { flex: 1, marginBottom: 0 }]}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput style={styles.input} value={profile.name} onChangeText={(text) => setProfile({ ...profile, name: text })} placeholderTextColor={DS.textMuted} />
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.input} value={profile.email} onChangeText={(text) => setProfile({ ...profile, email: text })} keyboardType="email-address" placeholderTextColor={DS.textMuted} />
          </View>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>Phone</Text>
            <TextInput style={styles.input} value={profile.phone} onChangeText={(text) => setProfile({ ...profile, phone: text })} keyboardType="phone-pad" placeholderTextColor={DS.textMuted} />
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1.1 }]}>
            <Text style={styles.label}>Date of Birth</Text>
            <TextInput style={styles.input} value={profile.dateOfBirth} onChangeText={(text) => setProfile({ ...profile, dateOfBirth: text })} placeholderTextColor={DS.textMuted} />
          </View>
          <View style={[styles.inputGroup, { flex: 0.8 }]}>
            <Text style={styles.label}>Height</Text>
            <TextInput style={styles.input} value={profile.height} onChangeText={(text) => setProfile({ ...profile, height: text })} placeholderTextColor={DS.textMuted} />
          </View>
          <View style={[styles.inputGroup, { flex: 0.8 }]}>
            <Text style={styles.label}>Weight</Text>
            <TextInput style={styles.input} value={profile.weight} onChangeText={(text) => setProfile({ ...profile, weight: text })} placeholderTextColor={DS.textMuted} />
          </View>
        </View>

        {sportId === 'cricket' ? (
          <View style={styles.inputGroup}>
            <PlayerRoleFields value={profile} onChange={(v) => setProfile({ ...profile, ...v })} errors={errors} />
          </View>
        ) : (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Primary Role</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {sportRoles.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.segBtn, profile.primaryRole === r && styles.segBtnOn]}
                  onPress={() => setProfile({ ...profile, primaryRole: r })}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.segText, profile.primaryRole === r && styles.segTextOn]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={[styles.inputGroup, { zIndex: 10 }]}>
          <Text style={styles.label}>City/Town</Text>
          <TextInput style={styles.input} value={profile.city} onChangeText={onCityChange} placeholder="Start typing your city or town…" placeholderTextColor={DS.textMuted} autoCorrect={false} />
          {citySuggest.length > 0 &&
            <View style={styles.suggestBox}>
              {citySuggest.map((s, i) => (
                <TouchableOpacity key={i} style={styles.suggestRow} onPress={() => pickCity(s)}>
                  <Icon name="map-marker-outline" size={16} color={DS.lime} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.suggestCity}>{s.city}</Text>
                    <Text style={styles.suggestMeta}>{s.district}, {s.state} · {s.pincode}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          }
        </View>

        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>District</Text>
            <TextInput style={styles.input} value={profile.district} onChangeText={(text) => setProfile({ ...profile, district: text })} placeholderTextColor={DS.textMuted} />
          </View>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>State</Text>
            <TextInput style={styles.input} value={profile.state} onChangeText={(text) => setProfile({ ...profile, state: text })} placeholderTextColor={DS.textMuted} />
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>Country</Text>
            <TextInput style={styles.input} value={profile.country} onChangeText={(text) => setProfile({ ...profile, country: text })} placeholderTextColor={DS.textMuted} />
          </View>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>Pincode</Text>
            <TextInput style={styles.input} value={profile.pincode} onChangeText={(text) => setProfile({ ...profile, pincode: text })} keyboardType="number-pad" maxLength={6} placeholderTextColor={DS.textMuted} />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Bio</Text>
          <TextInput style={[styles.input, styles.textArea]} value={profile.bio} onChangeText={(text) => setProfile({ ...profile, bio: text })} multiline numberOfLines={3} placeholderTextColor={DS.textMuted} />
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save Profile</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  avatarWrapRow: { marginRight: 16 },
  avatarCircleRow: { width: 72, height: 72, borderRadius: 36, backgroundColor: DS.surfaceHigh, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: DS.lime },
  avatarImgRow: { width: 72, height: 72, borderRadius: 36 },
  avatarInitialRow: { fontSize: 26, fontWeight: '900', color: DS.lime },
  avatarBadgeRow: { position: 'absolute', right: -4, bottom: -4, width: 26, height: 26, borderRadius: 13, backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: DS.bg },
  suggestBox: { marginTop: 6, backgroundColor: DS.surfaceHigh, borderRadius: 12, borderWidth: 1, borderColor: DS.line, overflow: 'hidden' },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: DS.line },
  suggestCity: { fontSize: 14, fontWeight: '700', color: DS.textPrimary },
  suggestMeta: { fontSize: 11, color: DS.textMuted, marginTop: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: DS.surfaceLow },
  backButton: { fontSize: 16, color: DS.lime, marginRight: 16 },
  title: { fontSize: 18, fontWeight: 'bold', color: DS.textPrimary },
  form: { padding: 16 },
  row: { flexDirection: 'row', gap: 12 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: DS.textMuted, marginBottom: 6 },
  input: { backgroundColor: DS.surfaceLow, borderRadius: 10, padding: 12, fontSize: 15, color: DS.textPrimary },
  textArea: { height: 100, textAlignVertical: 'top' },
  segBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, backgroundColor: DS.surfaceHigh, borderWidth: 1.5, borderColor: DS.border },
  segBtnOn: { borderColor: DS.lime, backgroundColor: DS.lime + '12' },
  segText: { fontSize: 13.5, fontWeight: '800', color: DS.textVariant },
  segTextOn: { color: DS.lime },
  saveButton: { backgroundColor: DS.lime, paddingVertical: 15, borderRadius: 10, alignItems: 'center', marginTop: 10, marginBottom: 40 },
  saveButtonText: { color: DS.bg, fontSize: 16, fontWeight: '600' },
});

export default EditPlayerProfileScreen;
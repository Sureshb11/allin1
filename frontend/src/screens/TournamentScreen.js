import { useTheme, useThemedStyles } from "../theme/ThemeContext";import React, { useState, useEffect, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Image } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { getSelectedSport } from '../utils/selectedSport';
import GradientButton from '../components/GradientButton';
import { useHideTabBarOnScroll, useTabBarClearance } from '../components/AutoHideTabBar';
import { showToast } from '../components/Toast';
import { pickAndUploadImage } from '../utils/imageUpload';














const TournamentScreen = ({ navigation, route }) => {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const hideTabBar = useHideTabBarOnScroll();
  const tabClear = useTabBarClearance();
  const [creating, setCreating] = useState(false);
  // The logged-in user is the organiser of anything they create — stamped onto the
  // tournament so it shows in the Overview's "Organizer" section.
  const [organizerName, setOrganizerName] = useState('');
  const [form, setForm] = useState({ name: '', format: 'T20', overs: '20', ballType: 'Leather', venue: '', prizePool: '', maxTeams: '', logoUrl: '', banner: '' });

  // No nav header. Reached as "Create Tournament", it stacked three titles: the
  // nav bar, this screen's own "Tournaments" heading, and the form's "Create New
  // Tournament" — before a single field. The in-body header below owns the title
  // and carries the back arrow.
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => { loadOrganizer(); }, []);

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
        logoUrl: form.logoUrl.trim() || undefined,
        banner: form.banner.trim() || undefined,
        organizer: organizerName || undefined,
        status: 'upcoming',
        // Without this the tournament is created as cricket and then never
        // appears in the (sport-filtered) list you created it from.
        sport: getSelectedSport().sport?.id,
      });
      if (res.success) {
        showToast('Tournament created!', 'success');
        setForm({ name: '', format: 'T20', overs: '20', ballType: 'Leather', venue: '', prizePool: '', maxTeams: '', logoUrl: '', banner: '' });
        // Back to the Tournaments list you came from — which reloads on focus,
        // so the new tournament is there. This used to flip a local flag and
        // reveal a SECOND list rendered inside this screen: a different list
        // from the one you'd browse to, with its own cards and empty state.
        // goBack rather than navigate, so the stack doesn't end up holding two
        // copies of the same list.
        navigation.goBack();
      } else showToast(res.error || 'Failed to create', 'error');
    } catch (e) {showToast('Something went wrong', 'error');} finally {setCreating(false);}
  };

  // Start button was previously dead (no handler) — kicks the tournament live.

  const handlePickImage = async (field) => {
    const r = await pickAndUploadImage('tournaments');
    if (r.url) {
      setForm({ ...form, [field]: r.url });
    } else if (r.error) {
      showToast(r.error, 'error');
    }
  };




  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
          <Icon name="arrow-left" size={22} color={DS.textPrimary} />
        </TouchableOpacity>
        {/* This screen does exactly one job now. */}
        <Text style={styles.headerTitle}>New Tournament</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => navigation.goBack()}>
          <Text style={styles.createButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Just the form. This screen also rendered a full tournament LIST, and
          creating one flipped to it — so you ended up on a second list with its
          own cards and its own empty state, not the Tournaments screen you'd
          reach any other way. Creating now hands off to that real list.
          Scrollable + dock clearance because the form is taller than the screen:
          "Create Tournament" at its foot sat under the floating dock,
          untappable. */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: tabClear + 24 }}
                  keyboardShouldPersistTaps="handled" {...hideTabBar}>
        <View style={styles.createForm}>
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
          
          <Text style={[styles.formLabel, { marginTop: 16 }]}>Branding (Optional)</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 15 }}>
            <TouchableOpacity 
              style={[styles.imageUploadBtn, form.logoUrl ? { padding: 0, borderWidth: 0 } : {}]} 
              onPress={() => handlePickImage('logoUrl')}>
              {form.logoUrl ? (
                <Image source={{ uri: form.logoUrl }} style={{ width: '100%', height: '100%', borderRadius: 8 }} />
              ) : (
                <>
                  <Icon name="image-plus" size={24} color={DS.textMuted} />
                  <Text style={styles.imageUploadText}>Add Logo</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.imageUploadBtn, { flex: 2 }, form.banner ? { padding: 0, borderWidth: 0 } : {}]} 
              onPress={() => handlePickImage('banner')}>
              {form.banner ? (
                <Image source={{ uri: form.banner }} style={{ width: '100%', height: '100%', borderRadius: 8 }} resizeMode="cover" />
              ) : (
                <>
                  <Icon name="panorama-variant-outline" size={24} color={DS.textMuted} />
                  <Text style={styles.imageUploadText}>Add Cover Banner</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <GradientButton
            label="Create Tournament"
            icon="trophy-outline"
            onPress={createTournament}
            loading={creating}
            height={48}
            style={{ marginTop: 5 }}
          />
        </View>
      </ScrollView>
    </View>);

};

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  header: { backgroundColor: DS.surfaceLow, padding: 20, paddingTop: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  // flex:1 so the title takes the middle and pushes Create to the right — the
  // row was space-between with two children; it now has three.
  headerTitle: { flex: 1, fontSize: 20, fontWeight: 'bold', color: DS.textPrimary },
  createButton: { backgroundColor: DS.lime, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
  createButtonText: { color: DS.bg, fontSize: 14, fontWeight: '700' },
  createForm: { backgroundColor: DS.surfaceHigh, margin: 15, padding: 20, borderRadius: 16 },
  formLabel: { fontSize: 14, fontWeight: '600', color: DS.textVariant, marginBottom: 6, marginTop: 10 },
  formInput: { backgroundColor: DS.surfaceHighest, borderRadius: 8, padding: 12, marginBottom: 10, color: DS.textPrimary, fontSize: 14 },
  formatRow: { flexDirection: 'row', marginBottom: 10 },
  formatChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, marginRight: 8, backgroundColor: DS.surfaceHighest },
  formatChipActive: { backgroundColor: DS.lime },
  formatChipText: { color: DS.textVariant, fontWeight: '600' },
  formatChipTextActive: { color: DS.bg },
  imageUploadBtn: { flex: 1, height: 80, backgroundColor: DS.surfaceHighest, borderRadius: 8, borderWidth: 1, borderColor: DS.surfaceLow, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  imageUploadText: { color: DS.textMuted, fontSize: 11, marginTop: 4, fontWeight: '600' },
  // Solid electric-blue Action-Taker per the design system.
});

export default TournamentScreen;
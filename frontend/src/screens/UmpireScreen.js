import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';

const DS = {
  bg: '#0f131f',
  surfaceLow: '#171b28',
  surfaceHigh: '#262a37',
  surfaceHighest: '#313442',
  lime: '#abd600',
  coral: '#ffb59e',
  blue: '#b7c4ff',
  textPrimary: '#dfe2f3',
  textVariant: '#c3c5d9',
  textMuted: '#8d90a2',
};

const LEVELS = ['All', 'Club', 'District', 'State', 'National'];

const INITIAL_FORM = { name: '', level: 'Club', experience: '', location: '', bio: '', contactInfo: '' };

export default function UmpireScreen({ navigation }) {
  const [umpires, setUmpires] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeLevel, setActiveLevel] = useState('All');
  const [showRegister, setShowRegister] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  const load = async (level) => {
    const filters = {};
    if (level && level !== 'All') filters.level = level;
    const res = await legendsApi.getUmpires(filters);
    if (res.success) setUmpires(res.data);
  };

  useEffect(() => {
    setLoading(true);
    load(activeLevel).finally(() => setLoading(false));
  }, [activeLevel]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(activeLevel);
    setRefreshing(false);
  };

  const handleRegister = async () => {
    if (!form.name.trim()) return;
    setSubmitting(true);
    await legendsApi.registerUmpire({
      ...form,
      experience: form.experience ? parseInt(form.experience, 10) : undefined,
    });
    setSubmitting(false);
    setShowRegister(false);
    setForm(INITIAL_FORM);
    load(activeLevel);
  };

  const LEVEL_COLORS = { Club: DS.blue, District: DS.lime, State: DS.coral, National: '#e8b4f8' };

  const renderUmpire = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.avatarWrap}>
        <View style={[styles.avatar, { backgroundColor: LEVEL_COLORS[item.level] || DS.surfaceHighest }]}>
          <Text style={styles.avatarText}>{item.name?.charAt(0).toUpperCase()}</Text>
        </View>
        {item.available && <View style={styles.availDot} />}
      </View>
      <View style={styles.cardInfo}>
        <View style={styles.nameRow}>
          <Text style={styles.umpireName}>{item.name}</Text>
          {!!item.level && (
            <View style={[styles.levelBadge, { backgroundColor: LEVEL_COLORS[item.level] || DS.surfaceHighest }]}>
              <Text style={styles.levelText}>{item.level}</Text>
            </View>
          )}
        </View>
        <View style={styles.metaRow}>
          {!!item.experience && (
            <View style={styles.metaItem}>
              <Icon name="calendar-check" size={12} color={DS.textMuted} />
              <Text style={styles.metaText}>{item.experience}yr exp</Text>
            </View>
          )}
          {!!item.location && (
            <View style={styles.metaItem}>
              <Icon name="map-marker-outline" size={12} color={DS.textMuted} />
              <Text style={styles.metaText}>{item.location}</Text>
            </View>
          )}
          {!!item.matchesUmpired && (
            <View style={styles.metaItem}>
              <Icon name="whistle" size={12} color={DS.textMuted} />
              <Text style={styles.metaText}>{item.matchesUmpired} matches</Text>
            </View>
          )}
        </View>
        {!!item.contactInfo && (
          <View style={styles.contactRow}>
            <Icon name="phone-outline" size={12} color={DS.lime} />
            <Text style={styles.contactText}>{item.contactInfo}</Text>
          </View>
        )}
      </View>
      <View style={[styles.availBadge, { backgroundColor: item.available ? 'rgba(171,214,0,0.15)' : 'rgba(255,181,158,0.15)' }]}>
        <Text style={[styles.availText, { color: item.available ? DS.lime : DS.coral }]}>
          {item.available ? 'Available' : 'Busy'}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color={DS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Find an Umpire</Text>
        <TouchableOpacity onPress={() => setShowRegister(true)} style={styles.addBtn}>
          <Icon name="plus" size={22} color={DS.bg} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsContent}>
        {LEVELS.map(l => (
          <TouchableOpacity
            key={l}
            style={[styles.tab, activeLevel === l && styles.tabActive]}
            onPress={() => setActiveLevel(l)}
          >
            <Text style={[styles.tabText, activeLevel === l && styles.tabTextActive]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={DS.lime} />
      ) : (
        <FlatList
          data={umpires}
          keyExtractor={i => i.id}
          renderItem={renderUmpire}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="whistle" size={48} color={DS.textMuted} />
              <Text style={styles.emptyText}>No umpires found</Text>
              <Text style={styles.emptySubText}>Register as an umpire to get listed</Text>
            </View>
          }
        />
      )}

      {/* Register Modal */}
      <Modal visible={showRegister} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Register as Umpire</Text>
              <TouchableOpacity onPress={() => { setShowRegister(false); setForm(INITIAL_FORM); }}>
                <Icon name="close" size={22} color={DS.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Full Name *</Text>
              <TextInput style={styles.input} placeholder="Your name" placeholderTextColor={DS.textMuted} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} />

              <Text style={styles.fieldLabel}>Level</Text>
              <View style={styles.levelRow}>
                {LEVELS.filter(l => l !== 'All').map(l => (
                  <TouchableOpacity
                    key={l}
                    style={[styles.levelChip, form.level === l && { backgroundColor: LEVEL_COLORS[l] }]}
                    onPress={() => setForm(f => ({ ...f, level: l }))}
                  >
                    <Text style={[styles.levelChipText, form.level === l && { color: DS.bg }]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 6 }}>
                  <Text style={styles.fieldLabel}>Experience (years)</Text>
                  <TextInput style={styles.input} placeholder="e.g. 5" placeholderTextColor={DS.textMuted} keyboardType="number-pad" value={form.experience} onChangeText={v => setForm(f => ({ ...f, experience: v }))} />
                </View>
                <View style={{ flex: 1, marginLeft: 6 }}>
                  <Text style={styles.fieldLabel}>Location</Text>
                  <TextInput style={styles.input} placeholder="City" placeholderTextColor={DS.textMuted} value={form.location} onChangeText={v => setForm(f => ({ ...f, location: v }))} />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Bio</Text>
              <TextInput style={[styles.input, styles.textarea]} placeholder="Brief introduction" placeholderTextColor={DS.textMuted} multiline value={form.bio} onChangeText={v => setForm(f => ({ ...f, bio: v }))} />

              <Text style={styles.fieldLabel}>Contact Info</Text>
              <TextInput style={styles.input} placeholder="Phone / Email" placeholderTextColor={DS.textMuted} value={form.contactInfo} onChangeText={v => setForm(f => ({ ...f, contactInfo: v }))} />
            </ScrollView>
            <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleRegister} disabled={submitting}>
              {submitting ? <ActivityIndicator color={DS.bg} /> : <Text style={styles.submitText}>Register</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: DS.surfaceLow, paddingTop: 48, paddingBottom: 14, paddingHorizontal: 16 },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: DS.textPrimary },
  addBtn: { backgroundColor: DS.lime, borderRadius: 999, padding: 6 },
  tabs: { backgroundColor: DS.surfaceLow },
  tabsContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: DS.surfaceHigh },
  tabActive: { backgroundColor: DS.lime },
  tabText: { fontSize: 12, color: DS.textMuted, fontWeight: '700' },
  tabTextActive: { color: DS.bg },
  list: { padding: 16, gap: 10 },
  card: { backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '700', color: DS.bg },
  availDot: { position: 'absolute', bottom: 1, right: 1, width: 12, height: 12, borderRadius: 6, backgroundColor: DS.lime },
  cardInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  umpireName: { fontSize: 16, fontWeight: '700', color: DS.textPrimary },
  levelBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  levelText: { fontSize: 10, fontWeight: '700', color: DS.bg },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: DS.textMuted },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  contactText: { fontSize: 11, color: DS.lime },
  availBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  availText: { fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 20, fontWeight: '700', color: DS.textMuted, marginTop: 12 },
  emptySubText: { fontSize: 13, color: DS.textMuted, marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: DS.surfaceLow, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: DS.textPrimary },
  modalBody: { paddingHorizontal: 16, paddingTop: 10 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: DS.textMuted, marginBottom: 6, marginTop: 10 },
  input: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: DS.textPrimary, backgroundColor: DS.surfaceHigh },
  textarea: { height: 80, textAlignVertical: 'top' },
  levelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  levelChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: DS.surfaceHighest },
  levelChipText: { fontSize: 12, color: DS.textMuted, fontWeight: '700' },
  row: { flexDirection: 'row' },
  submitBtn: { margin: 16, backgroundColor: DS.lime, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  submitText: { fontSize: 15, fontWeight: '700', color: DS.bg },
});

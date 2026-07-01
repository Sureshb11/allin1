import { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { getSelectedSport } from '../utils/selectedSport';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';

// Real post types used by the create-post form.
const TYPES = ['all', 'player', 'team', 'umpire', 'scorer', 'coach'];

// Full filter list shown as chips — mirrors the search page's "Looking for" section.
const FILTER_TYPES = ['all', 'player', 'team', 'umpire', 'scorer', 'coach', 'opponent', 'teamtourn', 'tournament', 'ground', 'commentator'];

const TYPE_LABELS = {
  all: 'All', player: 'Player', team: 'Team', umpire: 'Umpire', scorer: 'Scorer', coach: 'Coach',
  opponent: 'Opponent', teamtourn: 'Teams for tournament', tournament: 'Tournaments', ground: 'Ground', commentator: 'Commentator',
};

const TYPE_ICONS = {
  all: 'view-list',
  player: 'account-outline',
  team: 'account-group',
  umpire: 'whistle',
  scorer: 'scoreboard-outline',
  coach: 'school-outline',
  opponent: 'sword-cross',
  teamtourn: 'account-multiple-plus-outline',
  tournament: 'trophy-outline',
  ground: 'stadium',
  commentator: 'account-voice',
};

const makeTypeChipColors = (DS) => ({
  player: DS.lime,
  team: DS.blue,
  umpire: DS.lime,
  scorer: DS.blue,
  coach: DS.lime,
});

const INITIAL_FORM = { type: 'player', title: '', description: '', location: '', format: '', ageGroup: '', contactInfo: '' };

export default function LookingForScreen({ navigation, route }) {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const TYPE_CHIP_COLORS = makeTypeChipColors(DS);
  // Optional deep-link category (e.g. from the search screen's "Looking for" list).
  const initialType = FILTER_TYPES.includes(route?.params?.initialType) ? route.params.initialType : 'all';
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeType, setActiveType] = useState(initialType);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Scope Explore to the active sport (deep-linked sport, else current selection).
  const sportFilter = route?.params?.sport || getSelectedSport().sport?.id || null;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerBackVisible: true,
      headerTitle: 'Looking For',
    });
  }, [navigation]);

  const load = useCallback(async (type) => {
    const filters = {};
    if (type && type !== 'all') filters.type = type;
    if (sportFilter) filters.sport = sportFilter;
    const res = await legendsApi.getLookingForPosts(filters);
    if (res.success) setPosts(res.data);
  }, [sportFilter]);

  useEffect(() => {
    setLoading(true);
    load(activeType).finally(() => setLoading(false));
  }, [activeType, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(activeType);
    setRefreshing(false);
  };

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setSubmitting(true);
    const res = await legendsApi.createLookingFor({ ...form, sport: sportFilter || 'cricket' });
    setSubmitting(false);
    if (res.success) {
      setShowCreate(false);
      setForm(INITIAL_FORM);
      load(activeType);
    }
  };

  const handleClose = async (postId) => {
    await legendsApi.updateLookingFor(postId, 'closed');
    load(activeType);
  };

  const renderPost = ({ item }) => {
    const chipColor = TYPE_CHIP_COLORS[item.type] || DS.lime;
    return (
      <View style={styles.card}>
        {/* Image placeholder area */}
        <View style={styles.cardImageArea}>
          <Icon name={TYPE_ICONS[item.type] || 'help-circle-outline'} size={36} color={DS.textMuted} />
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <View style={[styles.typeBadge, { backgroundColor: chipColor + '22', borderColor: chipColor }]}>
              <Text style={[styles.typeText, { color: chipColor }]}>{item.type?.toUpperCase()}</Text>
            </View>
            {item.status === 'open' && (
              <TouchableOpacity onPress={() => handleClose(item.id)} style={styles.closeBtn}>
                <Icon name="check-circle-outline" size={16} color={DS.lime} />
                <Text style={styles.closeBtnText}>Mark Filled</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.cardTitle}>{item.title}</Text>
          {!!item.description && <Text style={styles.cardDesc}>{item.description}</Text>}

          <View style={styles.cardMeta}>
            {!!item.location && (
              <View style={styles.metaItem}>
                <Icon name="map-marker" size={13} color={DS.textMuted} />
                <Text style={styles.metaText}>{item.location}</Text>
              </View>
            )}
            {!!item.format && (
              <View style={styles.metaItem}>
                <Icon name="cricket" size={13} color={DS.textMuted} />
                <Text style={styles.metaText}>{item.format}</Text>
              </View>
            )}
            {!!item.ageGroup && (
              <View style={styles.metaItem}>
                <Icon name="human" size={13} color={DS.textMuted} />
                <Text style={styles.metaText}>{item.ageGroup}</Text>
              </View>
            )}
          </View>

          {!!item.contactInfo && (
            <TouchableOpacity style={styles.connectBtn}>
              <Text style={styles.connectBtnText}>CONNECT</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Brand bar */}
      <View style={styles.brandBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color={DS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.brandText}>LOCAL LEGENDS</Text>
        <TouchableOpacity onPress={() => setShowCreate(true)} style={styles.addBtn}>
          <Icon name="plus" size={20} color={DS.bg} />
        </TouchableOpacity>
      </View>

      {/* Hero section */}
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>EXPLORE.</Text>
        <Text style={styles.heroSubtitle}>Find players, teams, coaches & grounds near you</Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Icon name="magnify" size={20} color={DS.textMuted} />
          <Text style={styles.searchPlaceholder}>Search listings...</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsContent}>
        {FILTER_TYPES.map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, activeType === t && styles.tabActive]}
            onPress={() => setActiveType(t)}
          >
            <Icon name={TYPE_ICONS[t]} size={14} color={activeType === t ? DS.bg : DS.textMuted} />
            <Text style={[styles.tabText, activeType === t && styles.tabTextActive]}>
              {TYPE_LABELS[t] || t}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={DS.lime} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={i => i.id}
          renderItem={renderPost}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} colors={[DS.lime]} />}
          ListFooterComponent={
            <TouchableOpacity style={styles.ctaCard} onPress={() => setShowCreate(true)} activeOpacity={0.8}>
              <View style={styles.ctaAccent} />
              <View style={styles.ctaContent}>
                <Icon name="plus-circle-outline" size={24} color={DS.lime} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.ctaTitle}>Post your own listing</Text>
                  <Text style={styles.ctaDesc}>Let others know what you're looking for</Text>
                </View>
                <Icon name="chevron-right" size={22} color={DS.textMuted} />
              </View>
            </TouchableOpacity>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="telescope" size={48} color={DS.surfaceHighest} />
              <Text style={styles.emptyText}>No posts yet</Text>
              <Text style={styles.emptySubText}>Be the first to post a listing</Text>
            </View>
          }
        />
      )}

      {/* Create Modal */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Post a Listing</Text>
              <TouchableOpacity onPress={() => { setShowCreate(false); setForm(INITIAL_FORM); }}>
                <Icon name="close" size={22} color={DS.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Looking For *</Text>
              <View style={styles.typeRow}>
                {TYPES.filter(t => t !== 'all').map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeChip, form.type === t && styles.typeChipActive]}
                    onPress={() => setForm(f => ({ ...f, type: t }))}
                  >
                    <Icon name={TYPE_ICONS[t]} size={14} color={form.type === t ? DS.bg : DS.textMuted} />
                    <Text style={[styles.typeChipText, form.type === t && styles.typeChipTextActive]}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.fieldLabel}>Title *</Text>
              <TextInput style={styles.input} placeholder="e.g. Need a fast bowler for T20" placeholderTextColor={DS.textMuted} value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))} />
              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput style={[styles.input, styles.textarea]} placeholder="Details about your requirement" placeholderTextColor={DS.textMuted} multiline value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} />
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 6 }}>
                  <Text style={styles.fieldLabel}>Location</Text>
                  <TextInput style={styles.input} placeholder="City" placeholderTextColor={DS.textMuted} value={form.location} onChangeText={v => setForm(f => ({ ...f, location: v }))} />
                </View>
                <View style={{ flex: 1, marginLeft: 6 }}>
                  <Text style={styles.fieldLabel}>Format</Text>
                  <TextInput style={styles.input} placeholder="T20 / ODI" placeholderTextColor={DS.textMuted} value={form.format} onChangeText={v => setForm(f => ({ ...f, format: v }))} />
                </View>
              </View>
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 6 }}>
                  <Text style={styles.fieldLabel}>Age Group</Text>
                  <TextInput style={styles.input} placeholder="e.g. Under-19" placeholderTextColor={DS.textMuted} value={form.ageGroup} onChangeText={v => setForm(f => ({ ...f, ageGroup: v }))} />
                </View>
                <View style={{ flex: 1, marginLeft: 6 }}>
                  <Text style={styles.fieldLabel}>Contact</Text>
                  <TextInput style={styles.input} placeholder="Phone / WhatsApp" placeholderTextColor={DS.textMuted} value={form.contactInfo} onChangeText={v => setForm(f => ({ ...f, contactInfo: v }))} />
                </View>
              </View>
            </ScrollView>
            <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleCreate} disabled={submitting}>
              {submitting ? <ActivityIndicator color={DS.bg} /> : <Text style={styles.submitText}>Post Listing</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },

  /* Brand bar */
  brandBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 14, paddingHorizontal: 16 },
  backBtn: { padding: 4, marginRight: 10 },
  brandText: { flex: 1, fontSize: 13, fontWeight: '800', letterSpacing: 2.5, color: DS.lime },
  addBtn: { backgroundColor: DS.lime, borderRadius: 20, padding: 6 },

  /* Hero */
  hero: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6, backgroundColor: DS.bg },
  heroTitle: { fontSize: 38, fontWeight: '900', color: '#ffffff', letterSpacing: 1 },
  heroSubtitle: { fontSize: 14, color: DS.textVariant, marginTop: 4, lineHeight: 20 },

  /* Search */
  searchWrap: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: DS.bg },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: DS.surfaceHigh, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  searchPlaceholder: { fontSize: 14, color: DS.textMuted },

  /* Filter tabs */
  tabs: { backgroundColor: DS.bg, maxHeight: 52 },
  tabsContent: { paddingHorizontal: 16, paddingVertical: 6, gap: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: DS.surfaceHigh },
  tabActive: { backgroundColor: DS.lime },
  tabText: { fontSize: 12, color: DS.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  tabTextActive: { color: DS.bg },

  /* List */
  list: { padding: 16, gap: 14, paddingBottom: 32 },

  /* Card */
  card: { backgroundColor: DS.surfaceHigh, borderRadius: 16, overflow: 'hidden' },
  cardImageArea: { height: 100, backgroundColor: DS.surfaceLow, alignItems: 'center', justifyContent: 'center' },
  cardBody: { padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  typeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  closeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  closeBtnText: { fontSize: 11, color: DS.lime, fontWeight: '700' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 4 },
  cardDesc: { fontSize: 13, color: DS.textVariant, marginBottom: 10, lineHeight: 18 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: DS.textMuted },
  connectBtn: { backgroundColor: DS.lime, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 2 },
  connectBtnText: { fontSize: 13, fontWeight: '800', color: DS.bg, letterSpacing: 1 },

  /* CTA card */
  ctaCard: { backgroundColor: DS.surfaceHigh, borderRadius: 16, overflow: 'hidden', marginTop: 6 },
  ctaAccent: { height: 3, backgroundColor: DS.lime },
  ctaContent: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  ctaTitle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  ctaDesc: { fontSize: 12, color: DS.textMuted, marginTop: 2 },

  /* Empty */
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 18, fontWeight: '700', color: DS.textVariant, marginTop: 12 },
  emptySubText: { fontSize: 13, color: DS.textMuted, marginTop: 4 },

  /* Modal */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: DS.surfaceLow, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: DS.surfaceHigh },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
  modalBody: { paddingHorizontal: 16, paddingTop: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: DS.textMuted, marginBottom: 6, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: DS.surfaceHigh, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: DS.textPrimary, borderWidth: 0 },
  textarea: { height: 80, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: DS.surfaceHigh },
  typeChipActive: { backgroundColor: DS.lime },
  typeChipText: { fontSize: 12, color: DS.textMuted, fontWeight: '700' },
  typeChipTextActive: { color: DS.bg },
  row: { flexDirection: 'row' },
  submitBtn: { margin: 16, backgroundColor: DS.lime, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  submitText: { fontSize: 15, fontWeight: '800', color: DS.bg, letterSpacing: 0.5 },
});

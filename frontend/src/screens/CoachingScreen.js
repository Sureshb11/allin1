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

const SPECIALITIES = ['All', 'Batting', 'Bowling', 'Wicketkeeping', 'Fielding', 'Fitness', 'Mental'];
const SPEC_ICONS = {
  Batting: 'cricket', Bowling: 'weather-windy', Wicketkeeping: 'shield-outline',
  Fielding: 'run-fast', Fitness: 'dumbbell', Mental: 'brain', All: 'account-group',
};

export default function CoachingScreen({ navigation }) {
  const [coaches, setCoaches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSpec, setActiveSpec] = useState('All');
  const [selectedCoach, setSelectedCoach] = useState(null);
  const [bookDate, setBookDate] = useState('');
  const [bookNotes, setBookNotes] = useState('');
  const [bookingCoach, setBookingCoach] = useState(false);

  const load = async (spec) => {
    const filters = {};
    if (spec && spec !== 'All') filters.speciality = spec;
    const res = await legendsApi.getCoaches(filters);
    if (res.success) setCoaches(res.data);
  };

  useEffect(() => {
    setLoading(true);
    load(activeSpec).finally(() => setLoading(false));
  }, [activeSpec]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(activeSpec);
    setRefreshing(false);
  };

  const handleBook = async () => {
    if (!bookDate.trim()) return;
    setBookingCoach(true);
    await legendsApi.bookCoach(selectedCoach.id, bookDate, 1, bookNotes);
    setBookingCoach(false);
    setSelectedCoach(null);
    setBookDate('');
    setBookNotes('');
  };

  const renderCoach = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => setSelectedCoach(item)} activeOpacity={0.85}>
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.name?.charAt(0).toUpperCase()}</Text>
        </View>
        {item.available && <View style={styles.availDot} />}
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.coachName}>{item.name}</Text>
        {!!item.speciality && (
          <View style={styles.specRow}>
            <Icon name={SPEC_ICONS[item.speciality] || 'teach'} size={13} color={DS.lime} />
            <Text style={styles.specText}>{item.speciality} Coach</Text>
          </View>
        )}
        <View style={styles.metaRow}>
          {!!item.experience && (
            <View style={styles.metaChip}>
              <Icon name="trophy-outline" size={11} color={DS.textMuted} />
              <Text style={styles.metaChipText}>{item.experience}yr exp</Text>
            </View>
          )}
          {!!item.location && (
            <View style={styles.metaChip}>
              <Icon name="map-marker-outline" size={11} color={DS.textMuted} />
              <Text style={styles.metaChipText}>{item.location}</Text>
            </View>
          )}
          {!!item.pricePerHour && (
            <View style={styles.metaChip}>
              <Icon name="currency-inr" size={11} color={DS.lime} />
              <Text style={[styles.metaChipText, { color: DS.lime }]}>{item.pricePerHour}/hr</Text>
            </View>
          )}
        </View>
      </View>
      <TouchableOpacity style={styles.bookBtn} onPress={() => setSelectedCoach(item)}>
        <Text style={styles.bookBtnText}>Book</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color={DS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Find a Coach</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsContent}>
        {SPECIALITIES.map(s => (
          <TouchableOpacity
            key={s}
            style={[styles.tab, activeSpec === s && styles.tabActive]}
            onPress={() => setActiveSpec(s)}
          >
            <Icon name={SPEC_ICONS[s] || 'teach'} size={14} color={activeSpec === s ? DS.bg : DS.textMuted} />
            <Text style={[styles.tabText, activeSpec === s && styles.tabTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={DS.lime} />
      ) : (
        <FlatList
          data={coaches}
          keyExtractor={i => i.id}
          renderItem={renderCoach}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="teach" size={48} color={DS.textMuted} />
              <Text style={styles.emptyText}>No coaches found</Text>
            </View>
          }
        />
      )}

      {/* Book Modal */}
      <Modal visible={!!selectedCoach} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Book {selectedCoach?.name}</Text>
              <TouchableOpacity onPress={() => setSelectedCoach(null)}>
                <Icon name="close" size={22} color={DS.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              {!!selectedCoach?.bio && <Text style={styles.bioText}>{selectedCoach.bio}</Text>}
              <Text style={styles.fieldLabel}>Session Date & Time *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 2026-03-20T10:00:00.000Z"
                placeholderTextColor={DS.textMuted}
                value={bookDate}
                onChangeText={setBookDate}
              />
              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                placeholder="What do you want to work on?"
                placeholderTextColor={DS.textMuted}
                multiline
                value={bookNotes}
                onChangeText={setBookNotes}
              />
              {!!selectedCoach?.pricePerHour && (
                <View style={styles.priceRow}>
                  <Icon name="currency-inr" size={16} color={DS.lime} />
                  <Text style={styles.priceText}>{selectedCoach.pricePerHour} / hour</Text>
                </View>
              )}
              <TouchableOpacity style={[styles.submitBtn, bookingCoach && { opacity: 0.6 }]} onPress={handleBook} disabled={bookingCoach}>
                {bookingCoach ? <ActivityIndicator color={DS.bg} /> : <Text style={styles.submitText}>Confirm Booking</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16 },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: DS.textPrimary },
  tabs: { backgroundColor: DS.surfaceLow },
  tabsContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: DS.surfaceHigh },
  tabActive: { backgroundColor: DS.lime },
  tabText: { fontSize: 12, color: DS.textMuted, fontWeight: '600' },
  tabTextActive: { color: DS.bg },
  list: { padding: 16, gap: 10 },
  card: { backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '700', color: DS.lime },
  availDot: { position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: DS.lime },
  cardInfo: { flex: 1 },
  coachName: { fontSize: 16, fontWeight: '700', color: DS.textPrimary },
  specRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  specText: { fontSize: 12, color: DS.lime },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: DS.surfaceHighest, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  metaChipText: { fontSize: 11, color: DS.textMuted },
  bookBtn: { backgroundColor: DS.lime, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
  bookBtnText: { fontSize: 13, fontWeight: '700', color: DS.bg },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 20, fontWeight: '700', color: DS.textMuted, marginTop: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: DS.surfaceLow, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: DS.textPrimary },
  modalBody: { padding: 16 },
  bioText: { fontSize: 13, color: DS.textVariant, marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: DS.textMuted, marginBottom: 6, marginTop: 10 },
  input: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: DS.textPrimary, backgroundColor: DS.surfaceHigh },
  textarea: { height: 80, textAlignVertical: 'top' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
  priceText: { fontSize: 15, color: DS.lime, fontWeight: '700' },
  submitBtn: { marginTop: 16, backgroundColor: DS.lime, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  submitText: { fontSize: 15, fontWeight: '700', color: DS.bg },
});

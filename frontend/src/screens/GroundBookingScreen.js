import { useTheme, useThemedStyles } from "../theme/ThemeContext";import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, Alert, ActivityIndicator } from
'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';















const SLOT_ICONS = { Morning: 'weather-sunny', Afternoon: 'white-balance-sunny', Evening: 'weather-sunset' };

function GroundCard({ item, onBook }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.groundIconWrap}>
          <Icon name="stadium-outline" size={20} color={DS.lime} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.groundName}>{item.name}</Text>
          <View style={styles.locationRow}>
            <Icon name="map-marker-outline" size={12} color={DS.textMuted} />
            <Text style={styles.locationText} numberOfLines={1}>{item.location}</Text>
          </View>
        </View>
        <View style={[styles.availPill, { backgroundColor: item.available ? DS.lime + '26' : 'rgba(239,68,68,0.15)' }]}>
          <View style={[styles.availDot, { backgroundColor: item.available ? DS.lime : DS.live }]} />
          <Text style={[styles.availText, { color: item.available ? DS.lime : DS.live }]}>
            {item.available ? 'Available' : 'Booked'}
          </Text>
        </View>
      </View>

      {/* Price */}
      <View style={styles.priceRow}>
        <Icon name="currency-inr" size={16} color={DS.lime} />
        <Text style={styles.priceValue}>{item.price}</Text>
        <Text style={styles.priceSub}> per session</Text>
      </View>

      {/* Facilities */}
      {item.facilities.length > 0 &&
      <View style={styles.facilitiesWrap}>
          {item.facilities.map((f, i) =>
        <View key={i} style={styles.facilityChip}>
              <Icon name="check-circle-outline" size={10} color={DS.lime} />
              <Text style={styles.facilityText}>{f}</Text>
            </View>
        )}
        </View>
      }

      {/* Slots */}
      {item.available &&
      <View style={styles.slotsBlock}>
          <Text style={styles.slotsLabel}>Book a Slot</Text>
          <View style={styles.slotsRow}>
            {item.availability.map((slot, i) =>
          <TouchableOpacity key={i} style={styles.slotBtn} onPress={() => onBook(item, slot)}>
                <Icon name={SLOT_ICONS[slot] || 'clock-outline'} size={14} color={DS.bg} />
                <Text style={styles.slotText}>{slot}</Text>
              </TouchableOpacity>
          )}
          </View>
        </View>
      }
    </View>);

}

export default function GroundBookingScreen({ navigation }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const [grounds, setGrounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().split('T')[0];

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerBackVisible: true,
      headerTitle: 'Ground Booking',
    });
  }, [navigation]);

  useEffect(() => {
    legendsApi.getAvailableGrounds().then((res) => {
      if (res.success) {
        setGrounds((res.data || []).map((g) => ({
          id: g.id,
          name: g.name,
          location: g.location,
          price: g.price || 0,
          facilities: Array.isArray(g.facilities) ? g.facilities : [],
          availability: ['Morning', 'Afternoon', 'Evening'],
          available: g.available !== false
        })));
      }
      setLoading(false);
    });
  }, []);

  const bookGround = (ground, slot) => {
    Alert.alert(
      'Confirm Booking',
      `Book ${ground.name}\n${slot} · ${today}`,
      [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Book Now', onPress: async () => {
          try {
            const res = await legendsApi.bookGround(ground.id, today, slot.toLowerCase());
            if (res.success) Alert.alert('Booked!', 'Ground booked successfully.');else
            Alert.alert('Failed', res.error || 'Please try again');
          } catch {Alert.alert('Error', 'Could not complete booking');}
        }
      }]

    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={DS.lime} />
      </View>);

  }

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        <Icon name="stadium-outline" size={20} color={DS.lime} />
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Ground Booking</Text>
          <Text style={styles.heroDate}>{today}</Text>
        </View>
        <View style={styles.groundCountPill}>
          <Text style={styles.groundCountText}>{grounds.length} grounds</Text>
        </View>
      </View>

      <FlatList
        data={grounds}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <GroundCard item={item} onBook={bookGround} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
        <View style={styles.empty}>
            <Icon name="stadium-outline" size={52} color={DS.textMuted} />
            <Text style={styles.emptyTitle}>No grounds available</Text>
            <Text style={styles.emptySub}>Check back soon</Text>
          </View>
        } />
      
    </View>);

}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.bg },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16
  },
  heroTitle: { fontSize: 20, fontWeight: '800', color: DS.textPrimary },
  heroDate: { fontSize: 12, color: DS.textMuted, marginTop: 1 },
  groundCountPill: {
    backgroundColor: DS.surfaceHighest, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4
  },
  groundCountText: { fontSize: 11, fontWeight: '700', color: DS.lime },

  list: { padding: 16, gap: 12 },

  card: { backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  groundIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center'
  },
  groundName: { fontSize: 15, fontWeight: '800', color: DS.textPrimary },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  locationText: { fontSize: 12, color: DS.textMuted, flex: 1 },
  availPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3
  },
  availDot: { width: 5, height: 5, borderRadius: 3 },
  availText: { fontSize: 10, fontWeight: '800' },

  priceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    marginBottom: 10, paddingBottom: 10
  },
  priceValue: { fontSize: 20, fontWeight: '900', color: DS.lime },
  priceSub: { fontSize: 12, color: DS.textMuted, alignSelf: 'flex-end', marginBottom: 2 },

  facilitiesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  facilityChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: DS.surfaceHighest, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3
  },
  facilityText: { fontSize: 11, color: DS.lime, fontWeight: '600' },

  slotsBlock: { paddingTop: 10, backgroundColor: DS.surfaceHigh },
  slotsLabel: { fontSize: 12, fontWeight: '700', color: DS.textVariant, marginBottom: 8 },
  slotsRow: { flexDirection: 'row', gap: 8 },
  slotBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: DS.lime, borderRadius: 12, paddingVertical: 10
  },
  slotText: { fontSize: 12, fontWeight: '700', color: DS.bg },

  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: DS.textVariant },
  emptySub: { fontSize: 13, color: DS.textMuted }
});
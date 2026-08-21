import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, ActivityIndicator, RefreshControl,
  ScrollView, Platform, Alert, TextInput, Animated, Modal, Pressable
} from 'react-native';
import { BottomSheetModal, BottomSheetScrollView, BottomSheetBackdrop, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  DrawerHeader, SectionCard, TextField, TextArea, ChipGroup, ImagePickerField,
  LocationField, TimeField, PrimaryButton, StickyFooter, ValidationMessage,
  useCreateStyles, SPACE, useDrawerSheet, DRAWER_BACKDROP, useDiscardGuard, DrawerScroll,
} from '../components/create';
import { useFocusEffect } from '@react-navigation/native';
import { useCurrentUser } from '../utils/currentUser';
import LegendsApi from '../services/LegendsApi';

import { Field, ImageField } from '../components/FormKit';
import { uploadImage, pickAndUploadImage } from '../utils/imageUpload';
import MapView, { Marker, Callout } from 'react-native-maps';

import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useFilterSwipe } from '../utils/useFilterSwipe';
import Reanimated, { useAnimatedRef, useSharedValue, scrollTo, withTiming, SlideInRight, SlideInLeft, FadeInDown } from 'react-native-reanimated';
import AnimatedPressable from '../components/AnimatedPressable';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { pav } from '../theme/pavilion';
import { makeControls } from '../theme/controls';
import { useHideTabBarOnScroll, useTabBarClearance, useDockLock } from '../components/AutoHideTabBar';
import { useSupercluster } from '../components/useSupercluster';
import { listSports, sportMeta } from '../sports';
import { getGroundConfig, AMENITY_OPTIONS } from '../sports/grounds';
import { getSelectedSport } from '../utils/selectedSport';

// Module scope, not inside the skeleton's render body. Declared there it was a
// new component type every render, so React remounted every bar instead of
// updating it — which restarts the shimmer, so the one continuous sweep this
// is meant to be was stuttering back to the start.
const SkeletonCard = ({ shimmer, DS }) => (
  <View style={{ flex: 1, backgroundColor: DS.surface, borderRadius: 16, overflow: 'hidden', marginBottom: 10, borderWidth: 1, borderColor: DS.faint }}>
    <Bar DS={DS} w="100%" h={120} r={0} shimmer={shimmer} />
    <View style={{ padding: 12 }}>
      <Bar DS={DS} w="80%" h={14} mt={4} shimmer={shimmer} />
      <Bar DS={DS} w="50%" h={10} mt={10} shimmer={shimmer} />
      <Bar DS={DS} w="30%" h={10} mt={10} shimmer={shimmer} />
    </View>
  </View>
);

const Bar = ({ w, h, r = 6, mt = 0, shimmer, DS }) => {
  const translateX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-100, 400] });
  return (
    <View style={{ width: w, height: h, borderRadius: r, backgroundColor: DS.surfaceHigh, marginTop: mt, overflow: 'hidden' }}>
      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, width: 100, backgroundColor: 'rgba(255,255,255,0.4)', transform: [{ translateX }] }} />
    </View>
  );
};

function GroundSkeleton({ DS }) {
  const shimmers = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  
  useEffect(() => {
    const anims = shimmers.map((shimmer, i) => 
      Animated.sequence([
        Animated.delay(i * 150),
        Animated.loop(Animated.timing(shimmer, { toValue: 1, duration: 1200, useNativeDriver: true }))
      ])
    );
    Animated.parallel(anims).start();
  }, [shimmers]);



  return (
    <View style={{ paddingHorizontal: 16 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
          <SkeletonCard DS={DS} shimmer={shimmers[i]} />
          <SkeletonCard DS={DS} shimmer={shimmers[i]} />
        </View>
      ))}
    </View>
  );
}

// 'All' plus the types the CURRENT sport has. Was a fixed cricket list, so a
// badminton player filtered grounds by "Box Cricket" and "Nets".
const groundTypesFor = (sportId) => ['All', ...getGroundConfig(sportId).types.map((t) => t.key)];

const FilterBar = ({ query, setQuery, activeType, setActiveType, counts, pagerGesture, DS, P, styles, C, place, onSetPlace, onToggleMap, mapOpen, groundTypes }) => {
  const filterScroll = useAnimatedRef();
  const filterOffset = useSharedValue(0);
  const filterStart = useSharedValue(0);
  const filterMax = useSharedValue(0);
  const filterViewW = useRef(0);
  const filterContentW = useRef(0);
  const recomputeMax = () => { filterMax.value = Math.max(0, filterContentW.current - filterViewW.current); };
  
  const filterPan = useMemo(() => {
    const g = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .onBegin(() => { filterStart.value = filterOffset.value; })
      .onUpdate((e) => {
        let next = filterStart.value - e.translationX;
        if (next < 0) next = 0; else if (next > filterMax.value) next = filterMax.value;
        filterOffset.value = next;
        scrollTo(filterScroll, next, 0, false);
      });
    return pagerGesture ? g.blocksExternalGesture(pagerGesture) : g;
  }, [pagerGesture, filterScroll, filterOffset, filterStart, filterMax]);

  return (
    <View style={[styles.filterContainer, { paddingTop: Platform.OS === 'ios' ? 50 : 20 }]}>
      {/* YOUR LOCATION, and it is really yours — the city on your profile,
          which Edit Profile has collected all along. It used to say "Chennai"
          to everyone, hardcoded, over a list spanning Arani, Vellore,
          Kanchipuram and Tiruvannamalai.

          Not GPS: there is no geolocation library in this app, and adding one
          is a native dependency plus a runtime permission. This is a real
          answer available today, and it is tappable when it is missing. */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 16 }}>
        <TouchableOpacity onPress={onSetPlace} activeOpacity={0.7} style={{ flex: 1 }}>
          <Text style={{ color: DS.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            Your location
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Icon name="map-marker" size={18} color={place ? DS.lime : DS.textMuted} style={{ marginRight: 4 }} />
            <Text style={{ color: place ? DS.textPrimary : DS.textMuted, fontSize: 18, fontWeight: '700' }} numberOfLines={1}>
              {place || 'Set your city'}
            </Text>
            <Icon name="pencil-outline" size={14} color={DS.textMuted} style={{ marginLeft: 6 }} />
          </View>
        </TouchableOpacity>
        {/* Map, where the filter icon used to be. That icon set a
            `isFilterModalVisible` nothing ever read — there is no filter modal
            in this file — so it was a button that did nothing at all. The type
            chips below are the filter. */}
        <TouchableOpacity onPress={onToggleMap} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button" accessibilityState={{ selected: !!mapOpen }}
          accessibilityLabel={mapOpen ? 'Show the list' : 'Show the map'}>
          <Icon name={mapOpen ? 'format-list-bulleted' : 'map-outline'} size={26}
            color={mapOpen ? DS.lime : DS.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBox}>
        <Icon name="magnify" size={20} color={DS.textMuted} />
        <TextInput
          placeholder="Search for venue..."
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
          placeholderTextColor={DS.textMuted}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Icon name="close-circle" size={20} color={DS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <GestureDetector gesture={filterPan}>
        <Reanimated.ScrollView
          ref={filterScroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          scrollEventThrottle={16}
          onLayout={(e) => { filterViewW.current = e.nativeEvent.layout.width; recomputeMax(); }}
          onContentSizeChange={(w) => { filterContentW.current = w; recomputeMax(); }}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 24, marginTop: 12, paddingBottom: 0 }}
        >
          {groundTypes.map((t, index) => {
            const active = activeType === t;
            return (
              <TouchableOpacity
                key={t}
                onLayout={(e) => {
                  // roughly center by subtracting half screen width
                  if (!filterScroll.tabPositions) filterScroll.tabPositions = {};
                  filterScroll.tabPositions[index] = e.nativeEvent.layout.x;
                }}
                style={{ paddingBottom: 12, borderBottomWidth: 3, borderBottomColor: active ? DS.lime : 'transparent' }}
                onPress={() => {
                  ReactNativeHapticFeedback.trigger("selection", { enableVibrateFallback: true, ignoreAndroidSystemSettings: false });
                  setActiveType(t);
                  if (filterScroll.current && filterScroll.tabPositions && filterScroll.tabPositions[index]) {
                     filterScroll.current.scrollTo({ x: filterScroll.tabPositions[index] - 100, animated: true });
                  }
                }}
                activeOpacity={0.7}
              >
                <Text style={{ color: active ? DS.textPrimary : DS.textMuted, fontSize: 15, fontWeight: active ? '700' : '500' }}>
                  {t === 'All' ? 'Distance' : t.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </Text>
              </TouchableOpacity>
            );
          })}
        </Reanimated.ScrollView>
      </GestureDetector>
    </View>
  );
};

const GroundCard = ({ ground, index, isFav, onToggleFav, onPress, styles, DS, P }) => {
  const image = ground.images?.[0]?.imageUrl;
  const rating = ground.averageRating ? ground.averageRating.toFixed(1) : 'New';
  const typeStr = ground.groundType ? ground.groundType.replace('_', '-').replace(/\b\w/g, l => l.toUpperCase()) : 'Ground';
  const heartScale = useRef(new Animated.Value(1)).current;

  const handleHeartPress = () => {
    ReactNativeHapticFeedback.trigger("impactLight", { enableVibrateFallback: true, ignoreAndroidSystemSettings: false });
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 1.4, duration: 150, useNativeDriver: true }),
      Animated.spring(heartScale, { toValue: 1, friction: 3, useNativeDriver: true })
    ]).start();
    onToggleFav(ground.id);
  };

  return (
    <Reanimated.View style={{ flex: 1, marginBottom: 24 }} entering={FadeInDown.delay((index % 8) * 60).duration(400).springify()}>
      <AnimatedPressable style={{ backgroundColor: 'transparent' }} onPress={() => onPress(ground.id)}>
        <View style={{ width: '100%', height: 200, borderRadius: 16, overflow: 'hidden' }}>
          {image ? (
            <Image source={{ uri: image }} style={{ width: '100%', height: '100%' }} />
          ) : (
            /* Was an <Image> pointing at via.placeholder.com — a request to a
               third party to draw "No Image". At a ground on weak mobile data
               that hangs, and if the host is blocked it never resolves. Drawn
               locally instead, in the sport's own colour. */
            <View style={{ width: '100%', height: '100%', backgroundColor: DS.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={sportMeta(ground.sport).icon} size={40} color={DS.textMuted} />
            </View>
          )}
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%', backgroundColor: 'rgba(0,0,0,0.4)' }} />
          
          <TouchableOpacity style={styles.favButton} onPress={handleHeartPress} activeOpacity={0.8}>
            <View style={styles.favBlur}>
              <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                <Icon name={isFav ? "heart" : "heart-outline"} size={16} color={isFav ? DS.coral : '#FFF'} />
              </Animated.View>
            </View>
          </TouchableOpacity>

          <View style={{ position: 'absolute', bottom: 12, left: 12, backgroundColor: 'rgba(0,0,0,0.7)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 }}>
            <Icon name={sportMeta(ground.sport).icon} size={13} color="#FFF" style={{ marginRight: 5 }} />
            <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 13 }}>{sportMeta(ground.sport).name}</Text>
          </View>
        </View>

        <View style={{ paddingVertical: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: DS.textPrimary, flexShrink: 1 }} numberOfLines={1}>
                  {ground.name}
                  <Text style={{ fontSize: 15, fontWeight: '400', color: DS.textMuted }}>, {ground.area || ground.city || ground.location}</Text>
                </Text>
                {/* Anyone can put a ground on the map — so the list has to say
                    which ones somebody has actually checked. Only the badge is
                    shown: marking the rest "unverified" would read as an
                    accusation against grounds that are almost all genuine. */}
                {!!ground.verified && (
                  <Icon name="check-decagram" size={15} color={DS.lime} style={{ marginLeft: 5 }} />
                )}
              </View>
              {!!ground.bookingEnabled && (
                <View style={styles.bookablePill}>
                  <Icon name="calendar-check" size={11} color={DS.lime} />
                  <Text style={styles.bookablePillText}>Bookable</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: DS.textMuted, fontWeight: '600', fontSize: 14 }}>{rating}</Text>
              <Icon name="star" size={14} color={DS.textMuted} style={{ marginLeft: 4 }} />
            </View>
          </View>
          
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            <View style={{ backgroundColor: DS.surfaceHigh, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
              <Text style={{ color: DS.textMuted, fontSize: 12, fontWeight: '600' }}>{typeStr}</Text>
            </View>
            <Text style={{ color: DS.textMuted, fontSize: 14, marginHorizontal: 8 }}>•</Text>
            <Text style={{ color: DS.textMuted, fontSize: 14, fontWeight: '600' }}>₹ {ground.price || 250} / 👤</Text>
            {ground.distance !== undefined && (
              <>
                <Text style={{ color: DS.textMuted, fontSize: 14, marginHorizontal: 8 }}>•</Text>
                <Text style={{ color: DS.lime, fontSize: 13, fontWeight: '700' }}>{ground.distance.toFixed(1)} km</Text>
              </>
            )}
          </View>
        </View>
      </AnimatedPressable>
    </Reanimated.View>
  );
};

const GroundsMap = ({ grounds, onAddRequest, onGroundPress, DS, P }) => {
  const mapRef = useRef(null);
  
  const [region, setRegion] = useState({
    latitude: grounds.length > 0 && grounds[0].latitude ? grounds[0].latitude : 13.0827,
    longitude: grounds.length > 0 && grounds[0].longitude ? grounds[0].longitude : 80.2707,
    latitudeDelta: 0.5,
    longitudeDelta: 0.5,
  });

  const handleLongPress = (e) => {
    const { coordinate } = e.nativeEvent;
    Alert.alert(
      'Request New Ground',
      'Would you like to request adding a ground at this location?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, Add Here', onPress: () => onAddRequest(coordinate) }
      ]
    );
  };

  const points = useMemo(() => {
    return grounds.filter(g => g.latitude && g.longitude).map(g => ({
      type: 'Feature',
      properties: { cluster: false, groundId: g.id, ground: g },
      geometry: { type: 'Point', coordinates: [g.longitude, g.latitude] }
    }));
  }, [grounds]);

  const bounds = [
    region.longitude - region.longitudeDelta / 2, 
    region.latitude - region.latitudeDelta / 2, 
    region.longitude + region.longitudeDelta / 2, 
    region.latitude + region.latitudeDelta / 2 
  ];

  const zoom = Math.max(1, Math.round(Math.log2(360 / region.longitudeDelta)) || 10);

  const { clusters, supercluster } = useSupercluster({
    points,
    bounds,
    zoom,
    options: { radius: 75, maxZoom: 16 }
  });

  return (
    <View style={{ flex: 1, width: '100%', overflow: 'hidden' }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={region}
        onRegionChangeComplete={setRegion}
        userInterfaceStyle="dark"
        onLongPress={handleLongPress}
      >
        {clusters.map(cluster => {
          const [longitude, latitude] = cluster.geometry.coordinates;
          const { cluster: isCluster, point_count: pointCount } = cluster.properties;

          if (isCluster) {
            const size = Math.min(40 + (pointCount * 1.5), 80);
            return (
              <Marker
                key={`cluster-${cluster.id}`}
                coordinate={{ latitude, longitude }}
                onPress={() => {
                  const expansionZoom = Math.min(supercluster.getClusterExpansionZoom(cluster.id), 20);
                  const newDelta = 360 / Math.pow(2, expansionZoom);
                  mapRef.current?.animateToRegion({
                    latitude, longitude,
                    latitudeDelta: newDelta,
                    longitudeDelta: newDelta
                  });
                }}
              >
                <View style={{ 
                  width: size, height: size, borderRadius: size / 2, 
                  backgroundColor: DS.lime + 'DD', 
                  borderWidth: 3, borderColor: DS.surface,
                  alignItems: 'center', justifyContent: 'center',
                  shadowColor: DS.lime, shadowOpacity: 0.8, shadowRadius: 12, elevation: 8 
                }}>
                  <Text style={{ color: DS.bg, fontWeight: '900', fontSize: size > 50 ? 18 : 14 }}>{pointCount}</Text>
                </View>
              </Marker>
            );
          }

          const g = cluster.properties.ground;
          return (
            <Marker
              key={g.id}
              coordinate={{ latitude, longitude }}
              title={g.name}
              description={g.location || g.city}
              onCalloutPress={() => onGroundPress(g.id)}
            >
              <View style={{ backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#DDD', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: {width: 0, height: 4}, elevation: 5 }}>
                <Text style={{ color: '#000', fontWeight: '800', fontSize: 14 }}>₹{g.price || 500}</Text>
              </View>
            </Marker>
          );
        })}
      </MapView>
      <View style={{ position: 'absolute', top: 20, alignSelf: 'center', backgroundColor: DS.surfaceHigh, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12, elevation: 6, borderWidth: 1, borderColor: DS.faint }}>
        <Text style={{ color: DS.textPrimary, fontSize: 13, fontWeight: '700' }}>Long-press to request new ground</Text>
      </View>
    </View>
  );
};

const AdminReviewModal = ({ ground, submitter, visible, onClose, onApprove, onReject, onRequestChanges, onSuspend, onToggleBooking, DS, styles }) => {
  if (!ground) return null;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: DS.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: DS.border }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: DS.textPrimary }}>Review Ground</Text>
          <TouchableOpacity onPress={onClose}><Icon name="close" size={24} color={DS.textPrimary} /></TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: DS.textPrimary }}>{ground.name}</Text>
          <Text style={{ fontSize: 14, color: DS.textMuted, marginTop: 4 }}>{ground.location || ground.address || ground.area || ground.city}</Text>
          <View style={{ marginTop: 16, backgroundColor: DS.surface, padding: 12, borderRadius: 12 }}>
            <Text style={{ fontSize: 12, color: DS.textMuted, textTransform: 'uppercase', fontWeight: '700' }}>Submitter</Text>
            {submitter ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                <Icon name="account-circle" size={24} color={DS.textVariant} />
                <Text style={{ fontSize: 16, color: DS.textPrimary, marginLeft: 8 }}>{submitter.firstName} {submitter.lastName}</Text>
                <Text style={{ fontSize: 14, color: DS.textMuted, marginLeft: 8 }}>({submitter.phone || submitter.email})</Text>
              </View>
            ) : <Text style={{ color: DS.textMuted, marginTop: 4 }}>Unknown</Text>}
          </View>

          <View style={{ marginTop: 16, backgroundColor: DS.surface, padding: 12, borderRadius: 12 }}>
            <Text style={{ fontSize: 12, color: DS.textMuted, textTransform: 'uppercase', fontWeight: '700' }}>Sports Configuration</Text>
            {ground.sports && ground.sports.length > 0 ? ground.sports.map(gs => (
              <View key={gs.sport} style={{ marginTop: 8, padding: 8, backgroundColor: DS.bg, borderRadius: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: DS.textPrimary, textTransform: 'capitalize' }}>{gs.sport}</Text>
                {gs.pricePerHour > 0 && <Text style={{ fontSize: 14, color: DS.textMuted }}>Price: ₹{gs.pricePerHour}/hr</Text>}
                {gs.courtCount > 0 && <Text style={{ fontSize: 14, color: DS.textMuted }}>Courts: {gs.courtCount}</Text>}
              </View>
            )) : <Text style={{ color: DS.textMuted, marginTop: 4 }}>Legacy config (no GroundSport setup)</Text>}
          </View>
          
          <View style={{ marginTop: 16, backgroundColor: DS.surface, padding: 12, borderRadius: 12 }}>
            <Text style={{ fontSize: 12, color: DS.textMuted, textTransform: 'uppercase', fontWeight: '700' }}>Current Status</Text>
            <Text style={{ fontSize: 16, color: DS.textPrimary, marginTop: 4 }}>{ground.status}</Text>
            {ground.rejectionReason && <Text style={{ fontSize: 14, color: DS.red, marginTop: 4 }}>Reason: {ground.rejectionReason}</Text>}
          </View>
          
          <TouchableOpacity
            style={[styles.bookingToggle, ground.bookingEnabled && styles.bookingToggleOn, { marginTop: 16 }]}
            onPress={() => onToggleBooking(ground.id, !ground.bookingEnabled)}
            activeOpacity={0.8}
          >
            <Icon
              name={ground.bookingEnabled ? 'calendar-check' : 'calendar-remove-outline'}
              size={16}
              color={ground.bookingEnabled ? DS.lime : DS.textMuted}
            />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[styles.bookingToggleLabel, ground.bookingEnabled && { color: DS.lime }]}>
                {ground.bookingEnabled ? 'Bookings on' : 'Listing only'}
              </Text>
              <Text style={styles.bookingToggleHint} numberOfLines={2}>
                {ground.bookingEnabled
                  ? 'Players can request slots. Tap to stop bookings.'
                  : 'Tap to allow bookings — check the ground is real and the lister may let it out.'}
              </Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
        <View style={{ padding: 16, borderTopWidth: 1, borderColor: DS.border, backgroundColor: DS.surface }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
             <TouchableOpacity style={[styles.adminBtn, { backgroundColor: DS.red + '20', flex: 1, marginRight: 8 }]} onPress={() => onReject(ground.id)}>
              <Text style={{ color: DS.red, fontWeight: '700', textAlign: 'center' }}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.adminBtn, { backgroundColor: DS.amber + '20', flex: 1, marginLeft: 8 }]} onPress={() => onRequestChanges(ground.id)}>
              <Text style={{ color: DS.amber, fontWeight: '700', textAlign: 'center' }}>Request Changes</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <TouchableOpacity style={[styles.adminBtn, { backgroundColor: DS.textMuted + '20', flex: 1, marginRight: 8 }]} onPress={() => onSuspend(ground.id)}>
              <Text style={{ color: DS.textPrimary, fontWeight: '700', textAlign: 'center' }}>Suspend</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.adminBtn, { backgroundColor: DS.lime, flex: 1, marginLeft: 8 }]} onPress={() => onApprove(ground.id)}>
              <Text style={{ color: '#000', fontWeight: '700', textAlign: 'center' }}>Approve</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const AdminRequestCard = ({ ground, submitter, onReview, styles, DS }) => (
  <View style={styles.adminCard}>
    <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'}}>
      <View style={{flex: 1}}>
        <Text style={styles.adminCardTitle}>{ground.name}</Text>
        <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 4}}>
          <Icon name="map-marker" size={14} color={DS.textMuted} />
          <Text style={styles.adminText}>{ground.location || ground.address || ground.city}</Text>
        </View>
      </View>
      <View style={{backgroundColor: DS.amber + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: DS.amber + '50'}}>
        <Text style={{color: DS.amber, fontSize: 11, fontWeight: '800'}}>
          {ground.status === 'PENDING_VERIFICATION' ? 'PENDING' : ground.status}
        </Text>
      </View>
    </View>

    {submitter && (
      <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 12, backgroundColor: DS.bg, padding: 10, borderRadius: 10}}>
        <Icon name="account-circle" size={18} color={DS.textVariant} />
        <Text style={{color: DS.textPrimary, fontSize: 13, fontWeight: '600', marginLeft: 8}}>{submitter.firstName} <Text style={{color: DS.textMuted, fontWeight: '400'}}>({submitter.phone || submitter.email})</Text></Text>
      </View>
    )}
    
    <View style={styles.adminActions}>
      <TouchableOpacity style={[styles.adminBtn, { backgroundColor: DS.blue, flex: 1 }]} onPress={() => onReview(ground)}>
        <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>Review Details</Text>
      </TouchableOpacity>
    </View>
  </View>
);

// The venue vocabulary these screens offer now lives per sport in
// sports/grounds.js — see the note there about being asked for a ball type
// when you are adding a badminton hall.

const Chip = ({ label, active, onPress, icon }) => {
  const DS = useTheme().colors;
  return (
    <AnimatedPressable onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: active ? DS.lime : DS.surfaceHigh, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999, borderWidth: 1, borderColor: active ? DS.lime : DS.border, shadowColor: active ? DS.lime : '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: active ? 0.3 : 0, shadowRadius: 6, elevation: active ? 4 : 0 }}>
        {icon && <Icon name={icon} size={16} color={active ? DS.bg : DS.textMuted} />}
        <Text style={{ fontSize: 13, fontWeight: '800', color: active ? DS.bg : DS.textPrimary }}>{label}</Text>
      </View>
    </AnimatedPressable>
  );
};

const SectionLabel = ({ text }) => {
  const DS = useTheme().colors;
  return (
    <Text style={{ fontSize: 12, fontWeight: '700', color: DS.textMuted, letterSpacing: 1.4, marginBottom: 10, marginTop: 20, textTransform: 'uppercase' }}>{text}</Text>
  );
};

const GroundField = ({ label, value, onChangeText, placeholder, multiline, keyboardType, required }) => {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.formLabel}>{label}{required ? ' *' : ''}</Text>
      <BottomSheetTextInput style={[styles.formInput, multiline && styles.formTextArea]} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={DS.textMuted} multiline={multiline} numberOfLines={multiline ? 4 : 1} keyboardType={keyboardType || 'default'} />
    </View>
  );
};

// ── Create Ground ───────────────────────────────────────────────────────────
// One scroll of cards, on the shared creation system — the same header, cards,
// fields, chips and pinned action as Create Post.
//
// It was a three-step wizard: a progress bar, Back/Next, and validation that
// fired as an Alert when you tried to leave a step. Three cards say the same
// thing without hiding two thirds of the form behind a button, and the fields
// are the ones the design brief lists rather than the twenty the wizard grew.
const SportConfigSection = ({ sport, configDef, state, updateState }) => {
  const meta = sportMeta(sport);
  const fields = configDef.fields || [];
  
  return (
    <SectionCard key={sport} title={`${meta.name} Configuration`} icon={meta.icon}>
      {fields.map(field => {
        if (field.type === 'select') {
          return (
            <ChipGroup key={field.key} label={field.label} options={field.options.map(o => ({ value: o, label: o }))}
              value={state[field.key]} onChange={(v) => updateState(sport, field.key, v || '')} />
          );
        }
        if (field.type === 'multi-select') {
          return (
            <ChipGroup key={field.key} label={field.label} multi options={field.options.map(o => ({ value: o, label: o }))}
              value={state[field.key] || []} onChange={(v) => updateState(sport, field.key, v)} />
          );
        }
        if (field.type === 'number') {
          return (
            <TextField key={field.key} label={field.label} value={state[field.key]} onChangeText={(v) => updateState(sport, field.key, v)} keyboardType="numeric" />
          );
        }
        if (field.type === 'text') {
          return (
            <TextField key={field.key} label={field.label} value={state[field.key]} onChangeText={(v) => updateState(sport, field.key, v)} />
          );
        }
        if (field.type === 'toggle') {
          return (
            <ChipGroup key={field.key} label={field.label} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
              value={state[field.key] ? 'yes' : 'no'} onChange={(v) => updateState(sport, field.key, v === 'yes')} />
          );
        }
        return null;
      })}
      
      {configDef.facilities && configDef.facilities.length > 0 && (
        <ChipGroup label="Facilities" multi options={configDef.facilities.map(f => ({ value: f, label: f }))} 
          value={state.facilities || []} onChange={(v) => updateState(sport, 'facilities', v)} />
      )}
      
      {configDef.pricingUnits && configDef.pricingUnits.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontWeight: '600', marginBottom: 8, color: '#333' }}>Pricing</Text>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <View style={{ flex: 1 }}>
              <TextField label="Amount" value={state.priceAmount} onChangeText={(v) => updateState(sport, 'priceAmount', v)} keyboardType="numeric" placeholder="e.g. 500" />
            </View>
            <View style={{ flex: 1 }}>
              <ChipGroup label="Unit" options={configDef.pricingUnits} value={state.priceUnit} onChange={(v) => updateState(sport, 'priceUnit', v || '')} />
            </View>
          </View>
        </View>
      )}

      <View style={{ marginTop: 16, flexDirection: 'row', gap: 16 }}>
        <View style={{ flex: 1 }}>
          <TimeField label="Opens" value={state.openTime} onPress={() => {}} />
        </View>
        <View style={{ flex: 1 }}>
          <TimeField label="Closes" value={state.closeTime} onPress={() => {}} />
        </View>
      </View>
    </SectionCard>
  );
};

const AddGroundForm = ({ onSubmit, onCancel, initialLocation, DS }) => {
  const cs = useCreateStyles();
  const [userSports, setUserSports] = useState([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  
  useEffect(() => {
    const fetchSports = async () => {
      try {
        const res = await (new (require('../services/LegendsApi').default)()).getUserProfile();
        if (res.data && res.data.sports && res.data.sports.length > 0) {
          setUserSports(res.data.sports.map(s => s.sport));
        } else {
          setUserSports([]);
        }
      } catch (e) {
        setUserSports([]);
      } finally {
        setLoadingProfile(false);
      }
    };
    fetchSports();
  }, []);

  const [name, setName] = useState('');
  const [localName, setLocalName] = useState('');
  const [area, setArea] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [address, setAddress] = useState('');
  const [lat] = useState(initialLocation?.latitude || null);
  const [lng] = useState(initialLocation?.longitude || null);
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [imageUris, setImageUris] = useState([]);
  const [description, setDescription] = useState('');
  
  const [sportConfigsState, setSportConfigsState] = useState({});

  const updateSportConfig = (sport, field, value) => {
    setSportConfigsState(prev => ({
      ...prev,
      [sport]: {
        ...(prev[sport] || { openTime: '06:00', closeTime: '22:00', facilities: [] }),
        [field]: value
      }
    }));
  };

  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');

  const addPhoto = async () => {
    if (imageUris.length >= 5) return;
    setUploading(true);
    const r = await pickAndUploadImage('grounds');
    setUploading(false);
    if (r.url) setImageUris((prev) => [...prev, r.url]);
    else if (r.error) setFormError(r.error);
  };
  const removePhoto = (idx) => setImageUris((prev) => prev.filter((_, i) => i !== idx));

  const dirty = !!(name || localName || area || city || stateName || address || phone || whatsapp || imageUris.length || description);
  const close = useDiscardGuard(dirty, onCancel, { title: 'Discard this ground?' });

  const handleSubmit = async () => {
    const problems = {};
    if (!name.trim()) problems.name = 'A ground needs a name';
    if (!city.trim()) problems.city = 'Which town or city is it in?';
    setErrors(problems);
    if (Object.keys(problems).length) return;

    setFormError('');
    setLoading(true);
    
    const sportsData = userSports.map(sport => {
      const config = sportConfigsState[sport] || {};
      const { priceAmount, priceUnit, openTime, closeTime, facilities, ...restConfig } = config;
      return {
        sport,
        configuration: restConfig,
        pricing: priceAmount && priceUnit ? { amount: parseInt(priceAmount, 10), unit: priceUnit } : undefined,
        availability: openTime && closeTime ? { openTime, closeTime } : undefined,
        facilities: facilities?.length ? facilities : undefined,
      };
    });
    
    const primarySport = userSports[0] || 'cricket';
    
    try {
      await onSubmit({
        name: name.trim(), localName: localName.trim() || undefined,
        location: area.trim() || undefined, area: area.trim() || undefined,
        city: city.trim(), state: stateName.trim() || undefined, address: address.trim() || undefined,
        sport: primarySport, 
        latitude: lat || undefined, longitude: lng || undefined, 
        phone: phone.trim() || undefined, whatsapp: whatsapp.trim() || undefined,
        images: imageUris.length > 0 ? imageUris : undefined,
        imageUrl: imageUris[0] || undefined,
        description: description.trim() || undefined,
        sports: sportsData,
      });
      setDone(true);
    } catch (e) {
      setFormError(e.message || 'Could not save that ground');
    } finally {
      setLoading(false);
    }
  };

  if (loadingProfile) {
    return (
      <View style={{ flex: 1, backgroundColor: DS.bg, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: DS.text, fontSize: 16 }}>Loading your sports configuration...</Text>
      </View>
    );
  }

  if (userSports.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: DS.bg }}>
        <DrawerHeader icon="stadium" title="Sport not configured" onClose={close} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ color: DS.text, fontSize: 16, textAlign: 'center', marginBottom: 20 }}>
            Your sport preference is required to configure a ground.
          </Text>
          <PrimaryButton label="Update Profile" onPress={onCancel} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: DS.bg }}>
      <DrawerHeader
        icon="stadium"
        title={userSports.length > 1 ? "Add Sports Ground" : `Add ${listSports().find(s => s.id === userSports[0])?.name || 'Cricket'} Ground`}
        subtitle={`Sports from your profile: ${userSports.map(s => listSports().find(meta => meta.id === s)?.name || s).join(' • ')}`}
        onClose={close}
      />

      <DrawerScroll>
        <SectionCard title="The ground" icon="stadium-outline">
          <ImagePickerField
            label="Photos"
            images={imageUris}
            onAdd={addPhoto}
            onRemove={removePhoto}
            busy={uploading}
            max={5}
            helper="Up to five — the first is the cover"
          />
          <TextField label="Ground name" required value={name} onChangeText={setName}
            error={errors.name} placeholder="e.g. M.A. Chidambaram Stadium" />
          <TextField label="Local name" value={localName} onChangeText={setLocalName}
            placeholder="e.g. Chepauk" helper="What people round there call it" />
        </SectionCard>

        <SectionCard title="Where it is" icon="map-marker-outline">
          <TextField label="City" required value={city} onChangeText={setCity}
            error={errors.city} placeholder="e.g. Chennai" />
          <TextField label="Area" value={area} onChangeText={setArea} placeholder="e.g. Chepauk" />
          <TextField label="State" value={stateName} onChangeText={setStateName} placeholder="e.g. Tamil Nadu" />
          <TextArea label="Full address" value={address} onChangeText={setAddress}
            placeholder="Street, landmark, pin code" last={!lat} />
          {!!lat && (
            <LocationField label="Map location" value={`${lat.toFixed(5)}, ${lng.toFixed(5)}`}
              helper="Taken from where you tapped the map" onPress={() => {}} last />
          )}
        </SectionCard>
        
        {userSports.map((sport) => {
          const cfg = getGroundConfig(sport) || {};
          const state = sportConfigsState[sport] || { openTime: '06:00', closeTime: '22:00', facilities: [] };
          return (
            <SportConfigSection 
              key={sport} 
              sport={sport} 
              configDef={cfg} 
              state={state} 
              updateState={updateSportConfig} 
            />
          );
        })}

        <SectionCard title="Contact" icon="phone-outline">
          <TextField label="Contact number" value={phone} onChangeText={setPhone}
            placeholder="Mobile number" keyboardType="phone-pad" />
          <TextField label="WhatsApp" value={whatsapp} onChangeText={setWhatsapp}
            placeholder="If different from the above" keyboardType="phone-pad" />
          <TextArea label="Description" value={description} onChangeText={setDescription}
            placeholder="Anything a player should know before turning up" last />
        </SectionCard>
      </DrawerScroll>

      <StickyFooter>
        <ValidationMessage message={formError} />
        <PrimaryButton label="Create Ground" icon="check" loading={loading} done={done} onPress={handleSubmit} />
      </StickyFooter>
    </View>
  );
};

export default function GroundsScreen({ navigation, pagerGesture, inline, onRegisterFab }) {
  const user = useCurrentUser();
  const DS = useTheme().colors;
  const P = pav(DS);
  const styles = useThemedStyles(makeStyles);
  const C = useThemedStyles(makeControls);

  const [grounds, setGrounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('All');
  // Where the viewer says they are — city first, then district or state, which
  // is what Edit Profile collects. Read once; it changes about never.
  const [place, setPlace] = useState('');
  const [placeEditor, setPlaceEditor] = useState(false);
  const [placeDraft, setPlaceDraft] = useState('');

  // Typed, not sensed. Saved to the profile so it is the same city Edit Profile
  // shows and it survives a reinstall, and used to filter the list — which is
  // what a line called "your location" on a grounds finder is promising.
  // The dock goes while the Add Ground form (or the admin review list) is up.
  // Both take the whole screen and have their own back and submit; the app's
  // bottom navigation floating over a form you are filling in is chrome in the
  // way of the keyboard. Released when you leave the form, and on blur.
  const lockDock = useDockLock();
  const formOpen = viewState === 'admin';
  useFocusEffect(useCallback(() => {
    lockDock(formOpen);
    return () => lockDock(false);
  }, [formOpen, lockDock]));

  const savePlace = useCallback(async (value) => {
    const next = value.trim();
    setPlace(next);
    setPlaceEditor(false);
    LegendsApi.updateUserProfile({ city: next || null }).catch(() => {});
  }, []);
  useEffect(() => {
    LegendsApi.getUserProfile().then((r) => {
      const u = (r?.success && r.data) || {};
      const parts = [u.city, u.district || u.state].filter(Boolean);
      setPlace([...new Set(parts)].join(', '));
    }).catch(() => {});
  }, []);
  const [filterSurface, setFilterSurface] = useState('');
  const [filterBall, setFilterBall] = useState('');
  const [filterVerified, setFilterVerified] = useState(false);
  
  const swipeDir = useRef(1);
  const handleSetType = (t) => {
    const idx = groundTypes.indexOf(t);
    const currIdx = groundTypes.indexOf(type);
    swipeDir.current = idx > currIdx ? 1 : -1;
    setType(t);
  };
  const filterSwipe = useFilterSwipe(groundTypes, type, handleSetType);

  const [meta, setMeta] = useState({});
  const [favs, setFavs] = useState(new Set());
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [reviewGround, setReviewGround] = useState(null);

  
  const addGroundSheetRef = useRef(null);
  
  const closeAddGround = useCallback(() => {
    addGroundSheetRef.current?.dismiss();
  }, []);

  const renderBackdrop = useCallback(
    (props) => <BottomSheetBackdrop {...props} {...DRAWER_BACKDROP} />,
    []
  );

  const [viewState, setViewState] = useState('list'); // 'list' | 'map' | 'form' | 'admin'
  const [adminRequests, setAdminRequests] = useState([]);
  const [adminScope, setAdminScope] = useState('review'); // 'review' | 'all'
  // The sport being browsed drives the filter chips as well as the query.
  const browsingSport = getSelectedSport().sport?.id || 'cricket';
  const groundTypes = groundTypesFor(browsingSport);
  const [submitters, setSubmitters] = useState({});
  const [mapLocation, setMapLocation] = useState(null);

  const scrollY = useRef(new Animated.Value(0)).current;
  const hideTabBar = useHideTabBarOnScroll();
  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true, listener: hideTabBar.onScroll }
  );
  const drawerSheet = useDrawerSheet();
  const tabClear = useTabBarClearance();

  const headerHeight = 110;
  const clampedScrollY = Animated.diffClamp(scrollY, 0, headerHeight);
  const headerTranslateY = clampedScrollY.interpolate({
    inputRange: [0, headerHeight],
    outputRange: [0, -headerHeight],
    extrapolate: 'clamp',
  });

  const fetchGrounds = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    const params = { 
      // Every other screen renders the SELECTED sport; this one showed every
      // ground to everybody, so a badminton player browsed cricket grounds.
      sport: getSelectedSport().sport?.id || 'cricket',
      q: query, 
      type: type === 'All' ? '' : type,
      surface: filterSurface,
      ball: filterBall,
      verified: filterVerified ? 'true' : '',
      // Your location, doing something. Empty means every ground.
      city: place,
    };
    // A hardcoded Chennai coordinate used to be injected here "for demo
    // purposes", which had three effects nobody would have chosen: every
    // user's grounds were ordered by distance from the middle of Chennai
    // wherever they actually were, the ordering silently changed when you left
    // the All tab, and the backend switched to fetching up to 1000 rows with
    // pagination disabled whenever lat/lng were present.
    //
    // Nothing in this app knows the device's location — there is no geolocation
    // library in it — so there is no honest coordinate to send. The API keeps
    // its distance sort for when there is one.
    const res = await LegendsApi.getGrounds(params);
    if (res.success) {
      setGrounds(res.data.grounds);
      setMeta({ typeCounts: res.data.typeCounts, total: res.data.total });
      setFavs(new Set(res.data.userFavIds || []));
      setIsAdmin(res.data.isAdmin);
      setPendingRequests(res.data.pendingCount || 0);
    }
    setLoading(false);
    setRefreshing(false);
  }, [query, type, filterSurface, filterBall, filterVerified, place]);

  useEffect(() => {
    const delay = setTimeout(fetchGrounds, 300);
    return () => clearTimeout(delay);
  }, [fetchGrounds]);

  const toggleFav = async (id) => {
    if (!user) return Alert.alert('Login Required', 'Please login to favourite grounds.');
    const newFavs = new Set(favs);
    if (newFavs.has(id)) newFavs.delete(id);
    else newFavs.add(id);
    setFavs(newFavs);

    const res = await LegendsApi.toggleGroundFavourite(id);
    if (!res.success) {
      const revertFavs = new Set(favs);
      setFavs(revertFavs);
      Alert.alert('Error', 'Failed to update favourite');
    }
  };

  const loadAdminRequests = async (scope = adminScope) => {
    setLoading(true);
    const res = await LegendsApi.getGroundRequests(scope);
    if (res.success) {
      setAdminScope(scope);
      setAdminRequests(res.data.grounds);
      setSubmitters(res.data.submitters);
      setViewState('admin');
    }
    setLoading(false);
  };

  const handleApprove = async (id) => {
    const res = await LegendsApi.approveGround(id);
    if (res.success) {
      setAdminRequests(prev => prev.filter(g => g.id !== id));
      setPendingRequests(prev => Math.max(0, prev - 1));
      setReviewGround(null);
      Alert.alert('Approved', 'Ground has been approved and is now live.');
    } else {
      Alert.alert('Error', res.error || 'Failed to approve ground.');
    }
  };

  const handleReject = async (id) => {
    Alert.prompt('Reject Ground', 'Reason for rejection:', async (reason) => {
      if (!reason) return Alert.alert('Error', 'Reason is required');
      const res = await LegendsApi.rejectGround(id, reason);
      if (res.success) {
        setAdminRequests(prev => prev.filter(g => g.id !== id));
        setPendingRequests(prev => Math.max(0, prev - 1));
        setReviewGround(null);
        Alert.alert('Rejected', 'Ground has been rejected.');
      }
    });
  };

  const handleToggleBooking = async (id, enabled) => {
    const res = await LegendsApi.setGroundBooking(id, enabled);
    if (res.success) {
      setAdminRequests(prev => prev.map(g => (g.id === id ? { ...g, bookingEnabled: enabled } : g)));
      if (reviewGround && reviewGround.id === id) {
        setReviewGround(prev => ({ ...prev, bookingEnabled: enabled }));
      }
    } else {
      Alert.alert('Could not change bookings', res.error || 'Please try again.');
    }
  };

  const handleRequestChanges = async (id) => {
    Alert.prompt('Request Changes', 'Reason for changes:', async (reason) => {
      if (!reason) return Alert.alert('Error', 'Reason is required');
      const res = await LegendsApi.requestGroundChanges(id, reason);
      if (res.success) {
        setAdminRequests(prev => prev.filter(g => g.id !== id));
        setPendingRequests(prev => Math.max(0, prev - 1));
        setReviewGround(null);
        Alert.alert('Changes Requested', 'The owner has been notified.');
      }
    });
  };

  const handleSuspend = async (id) => {
    Alert.prompt('Suspend Ground', 'Reason for suspension:', async (reason) => {
      if (!reason) return Alert.alert('Error', 'Reason is required');
      const res = await LegendsApi.suspendGround(id, reason);
      if (res.success) {
        setAdminRequests(prev => prev.filter(g => g.id !== id));
        setPendingRequests(prev => Math.max(0, prev - 1));
        setReviewGround(null);
        Alert.alert('Suspended', 'Ground has been suspended and removed from public view.');
      }
    });
  };

  const handleFormSubmit = async (data) => {
    const res = await LegendsApi.submitGroundRequest(data);
    if (res.success) {
      Alert.alert('Success', 'Ground request submitted for review.');
      closeAddGround();
      setMapLocation(null);
    } else {
      Alert.alert('Error', res.error || 'Failed to submit');
    }
  };

  // The add button is the Pavilion's now, not this screen's own floating one.
  // Grounds drew a MagneticFAB of its own while the clubhouse drew nothing for
  // this tab, so its primary action shared a corner with the map toggle and lost.
  // Scout has always done it the other way — register the action, let the shared
  // button carry it — so the two neighbouring tabs now put their primary action
  // in the same place, at the same size, in the same words.
  const openAddGround = useCallback(() => { setMapLocation(null); addGroundSheetRef.current?.present(); }, []);
  // Withdrawn while the form is open. The Pavilion draws this button, not this
  // screen, so it kept floating over the Add Ground form it had just opened —
  // and tapping it again re-entered the form on top of itself.
  useEffect(() => {
    if (!inline) return;
    const canAdd = user && (viewState === 'list' || viewState === 'map');
    onRegisterFab?.(canAdd ? openAddGround : null);
  }, [inline, user, viewState, onRegisterFab, openAddGround]);

  const openFormWithLocation = (coord) => {
    setMapLocation(coord);
    addGroundSheetRef.current?.present();
  };

  

  if (viewState === 'admin') {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => { setViewState('list'); fetchGrounds(); }} style={styles.backBtn}>
            <Icon name="arrow-left" size={24} color={DS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>{adminScope === 'all' ? 'All Grounds' : 'Review Requests'}</Text>
          <View style={{width: 40}} />
        </View>

        {/* Verifying a ground takes it out of the review list, and the bookings
            switch lives on these cards — so without a way back to a verified
            ground there was no way to stop its bookings again. */}
        <View style={styles.scopeRow}>
          {[['review', 'Needs review'], ['all', 'All grounds']].map(([id, label]) => (
            <TouchableOpacity
              key={id}
              style={[styles.scopeBtn, adminScope === id && styles.scopeBtnOn]}
              onPress={() => { if (adminScope !== id) loadAdminRequests(id); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.scopeBtnText, adminScope === id && styles.scopeBtnTextOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <FlatList
          data={adminRequests}
          keyExtractor={i => i.id}
          renderItem={({item}) => (
            <AdminRequestCard 
              ground={item} 
              submitter={submitters[item.submittedById]}
              onReview={(g) => setReviewGround(g)}
              styles={styles} 
              DS={DS} 
            />
          )}
          contentContainerStyle={{padding: 16}}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconWrap}><Icon name="check-all" size={32} color={DS.lime} /></View>
              <Text style={styles.emptyText}>{adminScope === 'all' ? 'No grounds yet' : 'All caught up'}</Text>
              <Text style={styles.emptySubText}>
                {adminScope === 'all'
                  ? 'Nobody has added a ground. They appear here as soon as someone does.'
                  : 'Every ground has been reviewed. Switch to All grounds to change bookings on one.'}
              </Text>
            </View>
          }
        />
        <AdminReviewModal
          visible={!!reviewGround}
          ground={reviewGround}
          submitter={reviewGround ? submitters[reviewGround.submittedById] : null}
          onClose={() => setReviewGround(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onRequestChanges={handleRequestChanges}
          onSuspend={handleSuspend}
          onToggleBooking={handleToggleBooking}
          DS={DS}
          styles={styles}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        backgroundColor: DS.bg,
        transform: [{ translateY: viewState === 'list' ? headerTranslateY : 0 }]
      }}>
        {isAdmin && pendingRequests > 0 && (
          <TouchableOpacity style={styles.adminBanner} onPress={loadAdminRequests}>
            <Icon name="shield-check" size={18} color="#000" />
            <Text style={styles.adminBannerText}>{pendingRequests} Pending Ground Requests. Review now.</Text>
          </TouchableOpacity>
        )}

        <FilterBar 
          query={query} setQuery={setQuery} 
          activeType={type} setActiveType={handleSetType} 
          counts={meta.typeCounts} 
          groundTypes={groundTypes}
          pagerGesture={pagerGesture}
          DS={DS} P={P} styles={styles} C={C}
          place={place}
          onSetPlace={() => { setPlaceDraft(place); setPlaceEditor(true); }}
          mapOpen={viewState === 'map'}
          onToggleMap={() => setViewState((v) => (v === 'map' ? 'list' : 'map'))}
        />
      </Animated.View>

      {loading && !refreshing ? (
        <View style={{ paddingTop: headerHeight + 10 }}>
          <GroundSkeleton DS={DS} />
        </View>
      ) : viewState === 'map' ? (
        <View style={{ flex: 1, paddingTop: headerHeight }}>
          <GroundsMap 
            grounds={grounds} 
            onAddRequest={openFormWithLocation} 
            onGroundPress={(id) => navigation.navigate('GroundDetail', { id })}
            DS={DS} P={P} styles={styles}
          />
        </View>
      ) : (
        <GestureDetector gesture={filterSwipe}>
          <Reanimated.View 
            key={type}
            style={{ flex: 1 }}
            entering={swipeDir.current === 1 ? SlideInRight.duration(200).withInitialValues({ transform: [{ translateX: 50 }] }) : SlideInLeft.duration(200).withInitialValues({ transform: [{ translateX: -50 }] })}
          >
            <Animated.FlatList
              data={grounds}
              keyExtractor={item => item.id}
              contentContainerStyle={[styles.listContainer, { paddingTop: headerHeight + 10, paddingBottom: tabClear + 100 }]}
              onScroll={onScroll}
              scrollEventThrottle={16}
              renderItem={({ item, index }) => (
                <GroundCard 
                  ground={item} 
                  index={index}
                  isFav={favs.has(item.id)} 
                  onToggleFav={toggleFav} 
                  onPress={(id) => navigation.navigate('GroundDetail', { id })}
                  styles={styles} DS={DS} P={P}
                />
              )}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchGrounds(true); }} tintColor={DS.lime} />}
              ListEmptyComponent={
                // Two different empty states wearing one message. "Try adjusting
                // your filters" is good advice to somebody who has filters on,
                // and nonsense to somebody looking at a list that is empty
                // because there is nothing in it — they have nothing to adjust,
                // and the sentence blames them for it. The second case is real:
                // a fresh install, or a database with no grounds in it yet.
                <View style={styles.emptyState}>
                  <View style={styles.emptyBox}>
                    <View style={styles.emptyIconWrap}><Icon name="stadium" size={32} color={DS.lime} /></View>
                    {query.trim() || type !== 'All' ? (
                      <>
                        <Text style={styles.emptyText}>No grounds found</Text>
                        <Text style={styles.emptySubText}>Try adjusting your filters or search query.</Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.emptyText}>No grounds yet</Text>
                        <Text style={styles.emptySubText}>
                          {user ? 'Add the first one — tap the + button below.'
                                : 'Sign in to add the first one.'}
                        </Text>
                      </>
                    )}
                  </View>
                </View>
              }
            />
          </Reanimated.View>
        </GestureDetector>
      )}

      
      <BottomSheetModal
        {...drawerSheet}
        ref={addGroundSheetRef}
        backdropComponent={renderBackdrop}
      >
        <AddGroundForm onSubmit={handleFormSubmit} onCancel={closeAddGround} initialLocation={mapLocation} DS={DS} />
      </BottomSheetModal>

      {/* ── Where are you? ──
          Typed, because the app cannot sense it: there is no geolocation
          library here, and adding one is a native dependency plus a runtime
          permission. A text field answers the same question today, is
          correctable when the guess would have been wrong, and is the only
          option at all for someone who wants to browse a town they are not
          standing in. */}
      <Modal visible={placeEditor} transparent animationType="fade" onRequestClose={() => setPlaceEditor(false)}>
        <Pressable style={styles.placeBackdrop} onPress={() => setPlaceEditor(false)} />
        <View style={styles.placeSheet}>
          <Text style={styles.placeTitle}>Your location</Text>
          <Text style={styles.placeHint}>Grounds are filtered to this town or city. Leave it empty to see them all.</Text>
          <BottomSheetTextInput
            style={styles.placeInput}
            value={placeDraft}
            onChangeText={setPlaceDraft}
            placeholder="e.g. Vellore"
            placeholderTextColor={DS.textMuted}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => savePlace(placeDraft)}
          />
          <View style={styles.placeActions}>
            <TouchableOpacity onPress={() => savePlace('')} style={styles.placeClear}>
              <Text style={styles.placeClearTxt}>Show all</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => savePlace(placeDraft)} style={styles.placeSave}>
              <Text style={styles.placeSaveTxt}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const makeStyles = (DS, P) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: Platform.OS === 'ios' ? 50 : 16 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.surfaceHigh, borderRadius: 12 },
  title: { fontSize: 20, fontWeight: '800', color: DS.textPrimary },
  
  adminBanner: { flexDirection: 'row', backgroundColor: '#FBBF24', padding: 14, alignItems: 'center', justifyContent: 'center' },
  adminBannerText: { color: '#000', fontWeight: '800', fontSize: 13, marginLeft: 8 },
  
  filterContainer: { paddingTop: 12, borderBottomWidth: 1, borderBottomColor: DS.faint, backgroundColor: DS.bg },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: DS.surface, borderRadius: 10, paddingHorizontal: 12, marginHorizontal: 16, marginBottom: 8, borderWidth: 1, borderColor: DS.faint },
  searchInput: { flex: 1, color: DS.textPrimary, height: 44, marginLeft: 8, fontSize: 14 },

  listContainer: { paddingHorizontal: 16 },
  card: { flex: 1, backgroundColor: DS.surface, borderRadius: 16, overflow: 'hidden', marginBottom: 10, borderWidth: 1, borderColor: DS.faint },
  cardImageContainer: { width: '100%', height: 120 },
  cardImage: { width: '100%', height: '100%' },
  placeBackdrop: { flex: 1, backgroundColor: '#0009' },
  placeSheet: {
    position: 'absolute', left: 20, right: 20, top: '30%',
    backgroundColor: DS.surfaceLow, borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: DS.border,
  },
  placeTitle: { fontSize: 17, fontWeight: '900', color: DS.textPrimary },
  placeHint: { fontSize: 12, fontWeight: '600', color: DS.textMuted, marginTop: 6, lineHeight: 17 },
  placeInput: {
    height: 48, borderRadius: 12, paddingHorizontal: 14, marginTop: 14,
    backgroundColor: DS.surfaceHigh, borderWidth: 1.5, borderColor: DS.border,
    color: DS.textPrimary, fontSize: 15, fontWeight: '700',
  },
  placeActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  placeClear: { paddingVertical: 10, paddingHorizontal: 4 },
  placeClearTxt: { fontSize: 13, fontWeight: '800', color: DS.textMuted },
  placeSave: { paddingVertical: 11, paddingHorizontal: 22, borderRadius: 12, backgroundColor: DS.lime },
  placeSaveTxt: { fontSize: 14, fontWeight: '900', color: DS.onLime },

  cardGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%', backgroundColor: 'rgba(0,0,0,0.4)' },
  favButton: { position: 'absolute', top: 10, right: 10, borderRadius: 20, overflow: 'hidden' },
  favBlur: { padding: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  ratingBadge: { position: 'absolute', bottom: 10, left: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  ratingText: { color: '#FFF', fontWeight: '800', marginLeft: 4, fontSize: 10 },
  
  cardContent: { padding: 12 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: DS.textPrimary },
  cardLocationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 8 },
  cardSubtitle: { color: DS.textMuted, fontSize: 11, marginLeft: 4, fontWeight: '500' },
  
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: DS.lime + '20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  tagText: { color: DS.lime, fontSize: 9, fontWeight: '800' },
  tagOutline: { borderWidth: 1, borderColor: DS.faint, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  tagOutlineText: { color: DS.textMuted, fontSize: 9, fontWeight: '600' },

  emptyState: { padding: 16, marginTop: 40 },
  emptyBox: { width: '100%', alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, backgroundColor: DS.surface, borderRadius: 24, borderWidth: 1.5, borderColor: DS.faint, borderStyle: 'dashed' },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: DS.lime + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyText: { fontSize: 17, fontWeight: '800', color: DS.textPrimary, marginTop: 12, textAlign: 'center' },
  emptySubText: { fontSize: 13.5, color: DS.textMuted, marginTop: 6, textAlign: 'center', lineHeight: 20 },

  formContainer: { padding: 20 },
  formHeader: { marginBottom: 24 },
  formTitle: { fontSize: 28, fontWeight: '800', color: DS.textPrimary, marginBottom: 8 },
  formSubtitle: { fontSize: 15, color: DS.textMuted, lineHeight: 22 },
  formActions: { flexDirection: 'row', marginTop: 24 },
  
  btn: { paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: P.control },
  btnPrimaryText: { color: P.onControl, fontWeight: '800', fontSize: 16 },
  btnSecondary: { backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.faint },
  btnSecondaryText: { color: DS.textPrimary, fontWeight: '700', fontSize: 16 },

  adminCard: { backgroundColor: DS.surface, padding: 20, borderRadius: 20, marginBottom: 16, borderWidth: 1, borderColor: DS.faint, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  adminCardTitle: { color: DS.textPrimary, fontSize: 18, fontWeight: '800', marginBottom: 6 },
  adminText: { color: DS.textMuted, fontSize: 13, marginLeft: 4, fontWeight: '500' },
  adminActions: { flexDirection: 'row', marginTop: 20, gap: 12 },
  adminBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  adminBtnApprove: { backgroundColor: DS.lime },
  bookablePill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    marginTop: 5, paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 6, backgroundColor: DS.lime + '18',
  },
  bookablePillText: { color: DS.lime, fontSize: 10, fontWeight: '800', marginLeft: 3 },
  scopeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
  scopeBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    backgroundColor: DS.surface, borderWidth: 1, borderColor: DS.faint,
  },
  scopeBtnOn: { backgroundColor: DS.lime + '18', borderColor: DS.lime },
  scopeBtnText: { color: DS.textMuted, fontSize: 12, fontWeight: '800' },
  scopeBtnTextOn: { color: DS.lime },
  bookingToggle: {
    flexDirection: 'row', alignItems: 'center', marginTop: 12,
    padding: 10, borderRadius: 10, backgroundColor: DS.bg,
    borderWidth: 1, borderColor: DS.faint,
  },
  bookingToggleOn: { borderColor: DS.lime + '80', backgroundColor: DS.lime + '10' },
  bookingToggleLabel: { color: DS.textPrimary, fontSize: 13, fontWeight: '800' },
  bookingToggleHint: { color: DS.textMuted, fontSize: 11, fontWeight: '600', marginTop: 2 },
  adminBtnTextApprove: { color: DS.bg, fontWeight: '800', fontSize: 15 },
  adminBtnReject: { backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.faint },
  adminBtnTextReject: { color: DS.coral, fontWeight: '800', fontSize: 15 },

  formBackArrow: { color: DS.textPrimary, fontSize: 18, fontWeight: '600' },
  formProfileIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center' },
  formProfileText: { color: DS.textVariant, fontSize: 14, fontWeight: '600' },
  formSectionTitle: { color: DS.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, marginBottom: 14 },
  formLabel: { fontSize: 12, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.8, marginBottom: 8, marginTop: 16, textTransform: 'uppercase' },
  formInput: { backgroundColor: DS.surfaceLow, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: DS.textPrimary, borderWidth: 0 },
  formTextArea: { height: 110, textAlignVertical: 'top', paddingTop: 13 },
});

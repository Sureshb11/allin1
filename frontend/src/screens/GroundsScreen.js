import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, ActivityIndicator, RefreshControl,
  ScrollView, Platform, Alert, TextInput, Animated, Modal, Pressable
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
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

  const Bar = ({ w, h, r = 6, mt = 0, shimmer }) => {
    const translateX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-100, 400] });
    return (
      <View style={{ width: w, height: h, borderRadius: r, backgroundColor: DS.surfaceHigh, marginTop: mt, overflow: 'hidden' }}>
        <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, width: 100, backgroundColor: 'rgba(255,255,255,0.4)', transform: [{ translateX }] }} />
      </View>
    );
  };

  const SkeletonCard = ({ shimmer }) => (
    <View style={{ flex: 1, backgroundColor: DS.surface, borderRadius: 16, overflow: 'hidden', marginBottom: 10, borderWidth: 1, borderColor: DS.faint }}>
      <Bar w="100%" h={120} r={0} shimmer={shimmer} />
      <View style={{ padding: 12 }}>
        <Bar w="80%" h={14} mt={4} shimmer={shimmer} />
        <Bar w="50%" h={10} mt={10} shimmer={shimmer} />
        <Bar w="30%" h={10} mt={10} shimmer={shimmer} />
      </View>
    </View>
  );

  return (
    <View style={{ paddingHorizontal: 16 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
          <SkeletonCard shimmer={shimmers[i]} />
          <SkeletonCard shimmer={shimmers[i]} />
        </View>
      ))}
    </View>
  );
}

const FILTER_ICONS = {
  All: 'view-grid-outline',
  outdoor: 'tree-outline',
  indoor: 'home-outline',
  box_cricket: 'cube-outline',
  nets: 'grid',
  stadium: 'stadium'
};

const GROUND_TYPES = ['All', 'outdoor', 'indoor', 'box_cricket', 'nets', 'stadium'];

const FilterBar = ({ query, setQuery, activeType, setActiveType, counts, pagerGesture, DS, P, styles, C, place, onSetPlace, onToggleMap, mapOpen }) => {
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
          {GROUND_TYPES.map((t, index) => {
            const active = activeType === t;
            return (
              <TouchableOpacity
                key={t}
                onLayout={(e) => {
                  // roughly center by subtracting half screen width
                  if (!filterScroll.tabPositions) filterScroll.tabPositions = {};
                  filterScroll.tabPositions[index] = e.nativeEvent.layout.x;
                }}
                style={{ paddingBottom: 12, borderBottomWidth: 3, borderBottomColor: active ? '#3B82F6' : 'transparent' }}
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
  const image = ground.images?.[0]?.imageUrl || 'https://via.placeholder.com/400x200?text=No+Image';
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
          <Image source={{ uri: image }} style={{ width: '100%', height: '100%' }} />
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%', backgroundColor: 'rgba(0,0,0,0.4)' }} />
          
          <TouchableOpacity style={styles.favButton} onPress={handleHeartPress} activeOpacity={0.8}>
            <View style={styles.favBlur}>
              <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                <Icon name={isFav ? "heart" : "heart-outline"} size={16} color={isFav ? DS.coral : '#FFF'} />
              </Animated.View>
            </View>
          </TouchableOpacity>

          <View style={{ position: 'absolute', bottom: 12, left: 12, backgroundColor: 'rgba(0,0,0,0.7)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 }}>
            <Text style={{ fontSize: 13, marginRight: 4 }}>🏏</Text>
            <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 13 }}>Cricket</Text>
          </View>
        </View>

        <View style={{ paddingVertical: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: DS.textPrimary }} numberOfLines={1}>
                {ground.name}
                <Text style={{ fontSize: 15, fontWeight: '400', color: DS.textMuted }}>, {ground.area || ground.city || ground.location}</Text>
              </Text>
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
                <Text style={{ color: '#3B82F6', fontSize: 13, fontWeight: '700' }}>{ground.distance.toFixed(1)} km</Text>
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

const AdminRequestCard = ({ ground, submitter, onApprove, onReject, styles, DS }) => (
  <View style={styles.adminCard}>
    <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'}}>
      <View style={{flex: 1}}>
        <Text style={styles.adminCardTitle}>{ground.name}</Text>
        <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 4}}>
          <Icon name="map-marker" size={14} color={DS.textMuted} />
          <Text style={styles.adminText}>{ground.location}</Text>
        </View>
      </View>
      <View style={{backgroundColor: DS.amber + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: DS.amber + '50'}}>
        <Text style={{color: DS.amber, fontSize: 11, fontWeight: '800'}}>PENDING</Text>
      </View>
    </View>
    
    {submitter && (
      <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 12, backgroundColor: DS.bg, padding: 10, borderRadius: 10}}>
        <Icon name="account-circle" size={18} color={DS.textVariant} />
        <Text style={{color: DS.textPrimary, fontSize: 13, fontWeight: '600', marginLeft: 8}}>{submitter.firstName} <Text style={{color: DS.textMuted, fontWeight: '400'}}>({submitter.phone})</Text></Text>
      </View>
    )}
    
    <View style={styles.adminActions}>
      <TouchableOpacity style={[styles.adminBtn, styles.adminBtnReject]} onPress={() => onReject(ground.id)}>
        <Text style={styles.adminBtnTextReject}>Reject</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.adminBtn, styles.adminBtnApprove]} onPress={() => onApprove(ground.id)}>
        <Text style={styles.adminBtnTextApprove}>Approve</Text>
      </TouchableOpacity>
    </View>
  </View>
);

const GROUND_TYPES_LIST = [
  { key: 'outdoor', label: 'Outdoor', icon: 'weather-sunny' },
  { key: 'indoor', label: 'Indoor', icon: 'home-city' },
  { key: 'box_cricket', label: 'Box Cricket', icon: 'cube-outline' },
  { key: 'stadium', label: 'Stadium', icon: 'stadium' },
  { key: 'nets', label: 'Nets', icon: 'tennis' },
  { key: 'academy', label: 'Academy', icon: 'school' },
];
const SURFACES = [
  { key: 'turf', label: 'Turf' }, { key: 'grass', label: 'Grass' },
  { key: 'mat', label: 'Mat' }, { key: 'concrete', label: 'Concrete' },
  { key: 'synthetic', label: 'Synthetic' }, { key: 'clay', label: 'Clay' },
];
const BALL_TYPES_LIST = [
  { key: 'leather', label: 'Leather' }, { key: 'tennis', label: 'Tennis' },
  { key: 'soft', label: 'Soft' }, { key: 'tape', label: 'Tape' },
];
const AMENITY_OPTIONS = [
  'Flood Lights', 'Parking', 'Washroom', 'Drinking Water', 'Dressing Room',
  'Scorer Table', 'Practice Nets', 'Seating', 'Canteen', 'First Aid', 'WiFi', 'Sound System',
];
const CATEGORIES = ['Cricket Ground', 'Sports Complex', 'Stadium', 'Academy', 'Private Ground', 'Community Ground'];

const AddGroundForm = ({ onSubmit, onCancel, styles, initialLocation, DS }) => {
  const [step, setStep] = useState(1);
  const totalSteps = 3;
  // Step 1
  const [name, setName] = useState('');
  const [localName, setLocalName] = useState('');
  const [category, setCategory] = useState('');
  const [area, setArea] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [address, setAddress] = useState('');
  const [lat] = useState(initialLocation?.latitude || null);
  const [lng] = useState(initialLocation?.longitude || null);
  // Step 2
  const [groundType, setGroundType] = useState('outdoor');
  const [playingSurface, setPlayingSurface] = useState('');
  const [ballTypes, setBallTypes] = useState([]);
  const [price, setPrice] = useState('');
  const [amenities, setAmenities] = useState([]);
  const [openTime, setOpenTime] = useState('06:00');
  const [closeTime, setCloseTime] = useState('22:00');
  // Step 3
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [imageUris, setImageUris] = useState([]);
  const [description, setDescription] = useState('');

  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggleBall = (key) => setBallTypes(prev => prev.includes(key) ? prev.filter(b => b !== key) : [...prev, key]);
  const toggleAmenity = (a) => setAmenities(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);

  const addPhoto = async () => {
    if (imageUris.length >= 5) return Alert.alert('Limit', 'Maximum 5 photos allowed.');
    setUploading(true);
    const r = await pickAndUploadImage('grounds');
    setUploading(false);
    if (r.url) setImageUris(prev => [...prev, r.url]);
    else if (r.error) Alert.alert('Upload failed', r.error);
  };
  const removePhoto = (idx) => setImageUris(prev => prev.filter((_, i) => i !== idx));

  const validateStep = () => {
    if (step === 1 && !name.trim()) { Alert.alert('Required', 'Ground name is required.'); return false; }
    if (step === 1 && !city.trim()) { Alert.alert('Required', 'City is required.'); return false; }
    return true;
  };
  const nextStep = () => { if (validateStep()) setStep(Math.min(step + 1, totalSteps)); };
  const prevStep = () => setStep(Math.max(step - 1, 1));

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onSubmit({
        name: name.trim(), localName: localName.trim() || undefined, category: category || undefined,
        location: area.trim() || undefined, area: area.trim() || undefined,
        city: city.trim(), state: stateName.trim() || undefined, address: address.trim() || undefined,
        latitude: lat || undefined, longitude: lng || undefined, groundType,
        playingSurface: playingSurface || undefined,
        ballTypes: ballTypes.length > 0 ? ballTypes : undefined,
        price: price ? parseInt(price) : undefined,
        amenities: amenities.length > 0 ? amenities : undefined,
        openTime: openTime || undefined, closeTime: closeTime || undefined,
        phone: phone.trim() || undefined, whatsapp: whatsapp.trim() || undefined,
        email: email.trim() || undefined, website: website.trim() || undefined,
        images: imageUris.length > 0 ? imageUris : undefined,
        imageUrl: imageUris[0] || undefined,
        description: description.trim() || undefined,
      });
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  };

  const Chip = ({ label, active, onPress, icon }) => (
    <TouchableOpacity onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: active ? '#3B82F6' : DS.surfaceHigh, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: active ? '#3B82F6' : DS.border }}>
      {icon && <Icon name={icon} size={16} color={active ? '#FFF' : DS.textMuted} />}
      <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#FFF' : DS.textPrimary }}>{label}</Text>
    </TouchableOpacity>
  );
  const SectionLabel = ({ text }) => (
    <Text style={{ fontSize: 12, fontWeight: '700', color: DS.textMuted, letterSpacing: 1.4, marginBottom: 10, marginTop: 20, textTransform: 'uppercase' }}>{text}</Text>
  );
  const Field = ({ label, value, onChangeText, placeholder, multiline, keyboardType, required }) => (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.formLabel}>{label}{required ? ' *' : ''}</Text>
      <TextInput style={[styles.formInput, multiline && styles.formTextArea]} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={DS.textMuted} multiline={multiline} numberOfLines={multiline ? 4 : 1} keyboardType={keyboardType || 'default'} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: DS.bg }}>
      {/* Header */}
      <View style={styles.formTopHeader}>
        <TouchableOpacity onPress={step > 1 ? prevStep : onCancel} style={styles.formBackBtn}>
          <Icon name={step > 1 ? 'arrow-left' : 'close'} size={18} color={DS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.formHeaderTitle}>ADD GROUND</Text>
        <Text style={{ color: DS.textMuted, fontSize: 13, fontWeight: '700' }}>Step {step}/{totalSteps}</Text>
      </View>

      {/* Progress Bar */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 4, marginBottom: 8 }}>
        {[1, 2, 3].map(s => (
          <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: s <= step ? '#3B82F6' : DS.surfaceHigh }} />
        ))}
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* ═══ STEP 1: BASICS & LOCATION ═══ */}
        {step === 1 && (
          <View>
            <Text style={{ fontSize: 22, fontWeight: '800', color: DS.textPrimary, marginBottom: 4, marginTop: 8 }}>Basics & Location</Text>
            <Text style={{ fontSize: 14, color: DS.textMuted, marginBottom: 16 }}>Tell us about the ground and where it is.</Text>
            <View style={styles.formCardBlock}>
              <Field label="Ground Name" value={name} onChangeText={setName} placeholder="e.g. M.A. Chidambaram Stadium" required />
              <Field label="Local / Regional Name" value={localName} onChangeText={setLocalName} placeholder="e.g. Chepauk" />
              <SectionLabel text="Category" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {CATEGORIES.map(c => <Chip key={c} label={c} active={category === c} onPress={() => setCategory(category === c ? '' : c)} />)}
              </View>
            </View>
            <View style={styles.formCardBlock}>
              <Field label="Area / Locality" value={area} onChangeText={setArea} placeholder="e.g. Chepauk" />
              <Field label="City" value={city} onChangeText={setCity} placeholder="e.g. Chennai" required />
              <Field label="State" value={stateName} onChangeText={setStateName} placeholder="e.g. Tamil Nadu" />
              <Field label="Full Address" value={address} onChangeText={setAddress} placeholder="Full physical address..." multiline />
            </View>
            {(lat && lng) && (
              <View style={[styles.locationBadge, { marginBottom: 24 }]}>
                <Icon name="crosshairs-gps" size={20} color={DS.lime} />
                <View style={{marginLeft: 12}}>
                  <Text style={{color: DS.textPrimary, fontWeight: '800', fontSize: 14}}>Location Pinned</Text>
                  <Text style={styles.locationBadgeText}>{lat.toFixed(4)}, {lng.toFixed(4)}</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ═══ STEP 2: GROUND DETAILS ═══ */}
        {step === 2 && (
          <View>
            <Text style={{ fontSize: 22, fontWeight: '800', color: DS.textPrimary, marginBottom: 4, marginTop: 8 }}>Ground Details</Text>
            <Text style={{ fontSize: 14, color: DS.textMuted, marginBottom: 16 }}>Describe the playing conditions & facilities.</Text>
            <View style={styles.formCardBlock}>
              <SectionLabel text="Ground Type" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {GROUND_TYPES_LIST.map(t => <Chip key={t.key} label={t.label} icon={t.icon} active={groundType === t.key} onPress={() => setGroundType(t.key)} />)}
              </View>
              <SectionLabel text="Playing Surface" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {SURFACES.map(sf => <Chip key={sf.key} label={sf.label} active={playingSurface === sf.key} onPress={() => setPlayingSurface(playingSurface === sf.key ? '' : sf.key)} />)}
              </View>
              <SectionLabel text="Ball Types Allowed" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {BALL_TYPES_LIST.map(b => <Chip key={b.key} label={b.label} active={ballTypes.includes(b.key)} onPress={() => toggleBall(b.key)} />)}
              </View>
            </View>
            <View style={styles.formCardBlock}>
              <SectionLabel text="Price (per hour)" />
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: DS.surfaceLow, borderRadius: 10, paddingHorizontal: 14 }}>
                <Text style={{ color: DS.textMuted, fontSize: 18, fontWeight: '700', marginRight: 4 }}>₹</Text>
                <TextInput style={[styles.formInput, { flex: 1, backgroundColor: 'transparent', paddingHorizontal: 0 }]} value={price} onChangeText={setPrice} placeholder="e.g. 500" placeholderTextColor={DS.textMuted} keyboardType="numeric" />
              </View>
            </View>
            <View style={styles.formCardBlock}>
              <SectionLabel text="Amenities & Facilities" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {AMENITY_OPTIONS.map(a => <Chip key={a} label={a} active={amenities.includes(a)} onPress={() => toggleAmenity(a)} />)}
              </View>
            </View>
            <View style={styles.formCardBlock}>
              <SectionLabel text="Opening Hours" />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: DS.textMuted, fontSize: 11, fontWeight: '600', marginBottom: 6 }}>Opens at</Text>
                  <TextInput style={styles.formInput} value={openTime} onChangeText={setOpenTime} placeholder="06:00" placeholderTextColor={DS.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: DS.textMuted, fontSize: 11, fontWeight: '600', marginBottom: 6 }}>Closes at</Text>
                  <TextInput style={styles.formInput} value={closeTime} onChangeText={setCloseTime} placeholder="22:00" placeholderTextColor={DS.textMuted} />
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ═══ STEP 3: CONTACT & PHOTOS ═══ */}
        {step === 3 && (
          <View>
            <Text style={{ fontSize: 22, fontWeight: '800', color: DS.textPrimary, marginBottom: 4, marginTop: 8 }}>Contact & Photos</Text>
            <Text style={{ fontSize: 14, color: DS.textMuted, marginBottom: 16 }}>How can players reach you?</Text>
            <View style={styles.formCardBlock}>
              <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="Phone number" keyboardType="phone-pad" />
              <Field label="WhatsApp" value={whatsapp} onChangeText={setWhatsapp} placeholder="WhatsApp number" keyboardType="phone-pad" />
              <Field label="Email" value={email} onChangeText={setEmail} placeholder="ground@example.com" keyboardType="email-address" />
              <Field label="Website" value={website} onChangeText={setWebsite} placeholder="https://..." />
            </View>
            <View style={styles.formSection}>
              <SectionLabel text={`Photos (${imageUris.length}/5)`} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.formPhotoRow}>
                {imageUris.map((uri, idx) => (
                  <View key={idx} style={styles.formPhotoThumbWrap}>
                    <Image source={{ uri }} style={styles.formPhotoThumb} />
                    <TouchableOpacity style={styles.formPhotoThumbX} onPress={() => removePhoto(idx)}>
                      <Icon name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                    {idx === 0 && (
                      <View style={{ position: 'absolute', bottom: 4, left: 4, backgroundColor: '#3B82F6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '800' }}>COVER</Text>
                      </View>
                    )}
                  </View>
                ))}
                {imageUris.length < 5 && (
                  <TouchableOpacity style={styles.formAddPhotoBtn} onPress={addPhoto} disabled={uploading}>
                    {uploading ? <ActivityIndicator size="small" color={DS.lime} /> : <><Icon name="camera-plus" size={24} color={DS.lime} /><Text style={styles.formAddPhotoTxt}>Add photo</Text></>}
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>
            <View style={styles.formCardBlock}>
              <Field label="Description" value={description} onChangeText={setDescription} placeholder="Describe the ground, pitch condition, how to reach..." multiline />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 34 : 16, paddingTop: 12, gap: 12, borderTopWidth: 1, borderTopColor: DS.faint, backgroundColor: DS.bg }}>
        {step > 1 && (
          <TouchableOpacity onPress={prevStep} style={{ flex: 1, paddingVertical: 16, borderRadius: 12, alignItems: 'center', backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.border }}>
            <Text style={{ color: DS.textPrimary, fontWeight: '700', fontSize: 15 }}>Back</Text>
          </TouchableOpacity>
        )}
        {step < totalSteps ? (
          <TouchableOpacity onPress={nextStep} style={{ flex: 2, paddingVertical: 16, borderRadius: 12, alignItems: 'center', backgroundColor: '#3B82F6' }}>
            <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 15 }}>Next</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handleSubmit} disabled={loading} style={{ flex: 2, paddingVertical: 16, borderRadius: 12, alignItems: 'center', backgroundColor: DS.lime, opacity: loading ? 0.6 : 1 }}>
            {loading ? <ActivityIndicator color={DS.bg} /> : <Text style={{ color: DS.bg, fontWeight: '800', fontSize: 15, letterSpacing: 1 }}>POST LISTING</Text>}
          </TouchableOpacity>
        )}
      </View>
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
  const formOpen = viewState === 'form' || viewState === 'admin';
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
    const idx = GROUND_TYPES.indexOf(t);
    const currIdx = GROUND_TYPES.indexOf(type);
    swipeDir.current = idx > currIdx ? 1 : -1;
    setType(t);
  };
  const filterSwipe = useFilterSwipe(GROUND_TYPES, type, handleSetType);

  const [meta, setMeta] = useState({});
  const [favs, setFavs] = useState(new Set());
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);

  const [viewState, setViewState] = useState('list'); // 'list' | 'map' | 'form' | 'admin'
  const [adminRequests, setAdminRequests] = useState([]);
  const [submitters, setSubmitters] = useState({});
  const [mapLocation, setMapLocation] = useState(null);

  const scrollY = useRef(new Animated.Value(0)).current;
  const hideTabBar = useHideTabBarOnScroll();
  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true, listener: hideTabBar.onScroll }
  );
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

  const loadAdminRequests = async () => {
    setLoading(true);
    const res = await LegendsApi.getGroundRequests();
    if (res.success) {
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
      setPendingRequests(prev => prev - 1);
      Alert.alert('Success', 'Ground approved and published.');
    }
  };

  const handleReject = async (id) => {
    Alert.prompt('Reject Ground', 'Reason for rejection:', async (reason) => {
      const res = await LegendsApi.rejectGround(id, reason);
      if (res.success) {
        setAdminRequests(prev => prev.filter(g => g.id !== id));
        setPendingRequests(prev => prev - 1);
      }
    });
  };

  const handleFormSubmit = async (data) => {
    const res = await LegendsApi.submitGroundRequest(data);
    if (res.success) {
      Alert.alert('Success', 'Ground request submitted for review.');
      setViewState('list');
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
  const openAddGround = useCallback(() => { setMapLocation(null); setViewState('form'); }, []);
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
    setViewState('form');
  };

  if (viewState === 'form') {
    return (
      <View style={styles.container}>
        <AddGroundForm onSubmit={handleFormSubmit} onCancel={() => setViewState('list')} styles={styles} initialLocation={mapLocation} DS={DS} />
      </View>
    );
  }

  if (viewState === 'admin') {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => { setViewState('list'); fetchGrounds(); }} style={styles.backBtn}>
            <Icon name="arrow-left" size={24} color={DS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Review Requests</Text>
          <View style={{width: 40}} />
        </View>
        <FlatList
          data={adminRequests}
          keyExtractor={i => i.id}
          renderItem={({item}) => (
            <AdminRequestCard 
              ground={item} 
              submitter={submitters[item.submittedById]}
              onApprove={handleApprove}
              onReject={handleReject}
              styles={styles}
              DS={DS}
            />
          )}
          contentContainerStyle={{padding: 16}}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconWrap}><Icon name="check-all" size={32} color={DS.lime} /></View>
              <Text style={styles.emptyText}>All caught up</Text>
              <Text style={styles.emptySubText}>No pending ground requests to review.</Text>
            </View>
          }
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
          <TextInput
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
  adminBtnTextApprove: { color: DS.bg, fontWeight: '800', fontSize: 15 },
  adminBtnReject: { backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.faint },
  adminBtnTextReject: { color: DS.coral, fontWeight: '800', fontSize: 15 },

  locationBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: DS.surfaceHigh, padding: 16, borderRadius: 16, marginTop: 16, borderWidth: 1, borderColor: DS.lime + '40' },
  locationBadgeText: { color: DS.textMuted, fontWeight: '500', fontSize: 12, marginTop: 2 },

  formTopHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 50 : 16, paddingBottom: 14, backgroundColor: DS.bg },
  formBackBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: DS.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  formBackArrow: { color: DS.textPrimary, fontSize: 18, fontWeight: '600' },
  formHeaderTitle: { color: DS.textPrimary, fontSize: 16, fontWeight: '700', letterSpacing: 1.2 },
  formProfileIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: DS.surfaceHighest, alignItems: 'center', justifyContent: 'center' },
  formProfileText: { color: DS.textVariant, fontSize: 14, fontWeight: '600' },
  formSection: { marginTop: 8, marginBottom: 20 },
  formSectionTitle: { color: DS.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, marginBottom: 14 },
  formPhotoRow: { gap: 10, paddingRight: 16 },
  formPhotoThumbWrap: { position: 'relative' },
  formPhotoThumb: { width: 90, height: 90, borderRadius: 12, backgroundColor: DS.surfaceHigh },
  formPhotoThumbX: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: DS.coral, alignItems: 'center', justifyContent: 'center' },
  formAddPhotoBtn: { width: 90, height: 90, borderRadius: 12, borderWidth: 1.5, borderColor: DS.lime, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
  formAddPhotoTxt: { color: DS.lime, fontSize: 11, fontWeight: '700' },
  formCardBlock: { backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 18, marginBottom: 24 },
  formLabel: { fontSize: 12, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.8, marginBottom: 8, marginTop: 16, textTransform: 'uppercase' },
  formInput: { backgroundColor: DS.surfaceLow, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: DS.textPrimary, borderWidth: 0 },
  formTextArea: { height: 110, textAlignVertical: 'top', paddingTop: 13 },
  formSubmitBtn: { backgroundColor: DS.lime, paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  formSubmitBtnText: { color: DS.bg, fontSize: 15, fontWeight: '800', letterSpacing: 1.2 }
});

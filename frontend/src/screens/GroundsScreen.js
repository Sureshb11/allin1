import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, ActivityIndicator, RefreshControl,
  ScrollView, Platform, Alert, TextInput, Animated
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCurrentUser } from '../utils/currentUser';
import LegendsApi from '../services/LegendsApi';

import { Field, ImageField } from '../components/FormKit';
import { uploadImage, pickAndUploadImage } from '../utils/imageUpload';
import MapView, { Marker, Callout } from 'react-native-maps';

import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useFilterSwipe } from '../utils/useFilterSwipe';
import Reanimated, { useAnimatedRef, useSharedValue, scrollTo, withTiming, SlideInRight, SlideInLeft, FadeInDown } from 'react-native-reanimated';
import AnimatedPressable from '../components/AnimatedPressable';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { pav } from '../theme/pavilion';
import { makeControls } from '../theme/controls';
import { useHideTabBarOnScroll, useTabBarClearance } from '../components/AutoHideTabBar';
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

const FilterBar = ({ query, setQuery, activeType, setActiveType, counts, pagerGesture, DS, P, styles, C }) => {
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
    <View style={styles.filterContainer}>
      <View style={styles.searchBox}>
        <Icon name="magnify" size={20} color={DS.textMuted} />
        <TextInput
          placeholder="Search grounds, cities..."
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

      <GestureDetector gesture={filterPan}>
        <Reanimated.ScrollView
          ref={filterScroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          scrollEventThrottle={16}
          onLayout={(e) => { filterViewW.current = e.nativeEvent.layout.width; recomputeMax(); }}
          onContentSizeChange={(w) => { filterContentW.current = w; recomputeMax(); }}
          contentContainerStyle={[C.filterBar, { paddingHorizontal: 16 }]}
        >
          {GROUND_TYPES.map(t => {
            const active = activeType === t;
            return (
              <TouchableOpacity
                key={t}
                style={[C.filterChip, active && C.filterChipActive]}
                onPress={() => setActiveType(t)}
                activeOpacity={0.7}
              >
                <Icon name={FILTER_ICONS[t] || 'stadium'} size={14} color={active ? DS.lime : DS.textMuted} />
                <Text style={[C.filterText, active && C.filterTextActive]}>
                  {t === 'All' ? 'All' : t.replace('_', ' ').toUpperCase()}
                </Text>
                {t !== 'All' && counts?.[t] > 0 && (
                  <View style={[C.filterCount, active && C.filterCountOn]}>
                    <Text style={[C.filterCountText, active && C.filterCountTextOn]}>{counts[t]}</Text>
                  </View>
                )}
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

  return (
    <Reanimated.View style={{ flex: 1 }} entering={FadeInDown.delay((index % 8) * 60).duration(400).springify()}>
      <AnimatedPressable style={styles.card} onPress={() => onPress(ground.id)}>
      <View style={styles.cardImageContainer}>
        <Image source={{ uri: image }} style={styles.cardImage} />
        <View style={styles.cardGradient} />
        
        <TouchableOpacity style={styles.favButton} onPress={() => onToggleFav(ground.id)}>
          <View style={styles.favBlur}>
            <Icon name={isFav ? "heart" : "heart-outline"} size={16} color={isFav ? DS.coral : '#FFF'} />
          </View>
        </TouchableOpacity>

        <View style={styles.ratingBadge}>
          <Icon name="star" size={10} color="#FBBF24" />
          <Text style={styles.ratingText}>{rating}</Text>
        </View>
      </View>

      <View style={styles.cardContent}>
        <Text style={styles.cardTitle} numberOfLines={1}>{ground.name}</Text>
        <View style={styles.cardLocationRow}>
          <Icon name="map-marker" size={12} color={DS.textMuted} />
          <Text style={styles.cardSubtitle} numberOfLines={1}>{ground.location}</Text>
        </View>
        
        <View style={styles.tagsContainer}>
          {ground.groundType && <View style={styles.tag}><Text style={styles.tagText}>{ground.groundType.replace('_', ' ')}</Text></View>}
          {ground.playingSurface && <View style={styles.tagOutline}><Text style={styles.tagOutlineText}>{ground.playingSurface}</Text></View>}
          {ground.amenities?.slice(0, 1).map(a => (
            <View key={a.id} style={styles.tagOutline}><Text style={styles.tagOutlineText}>{a.amenity}</Text></View>
          ))}
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
              <View style={{ backgroundColor: DS.lime, padding: 8, borderRadius: 24, borderWidth: 3, borderColor: DS.surface, shadowColor: DS.lime, shadowOpacity: 0.6, shadowRadius: 10, elevation: 8 }}>
                <Icon name="stadium" size={18} color={DS.bg} />
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

const AddGroundForm = ({ onSubmit, onCancel, styles, initialLocation, DS }) => {
  const [form, setForm] = useState({ 
    name: '', location: '', city: '', address: '', groundType: 'outdoor', phone: '', description: '',
    latitude: initialLocation?.latitude || null,
    longitude: initialLocation?.longitude || null
  });
  const [imageUri, setImageUri] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);

  const addPhoto = async () => {
    setUploading(true);
    const r = await pickAndUploadImage('grounds');
    setUploading(false);
    if (r.url) setImageUri(r.url);
    else if (r.error) Alert.alert('Upload failed', r.error);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.city) return Alert.alert('Error', 'Name and City are required');
    setLoading(true);
    try {
      await onSubmit({ ...form, imageUrl: imageUri });
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: DS.bg }}>
      {/* Header */}
      <View style={styles.formTopHeader}>
        <TouchableOpacity onPress={onCancel} style={styles.formBackBtn}>
          <Text style={styles.formBackArrow}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.formHeaderTitle}>ADD GROUND</Text>
        <View style={styles.formProfileIcon}>
          <Text style={styles.formProfileText}>P</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Photos */}
        <View style={styles.formSection}>
          <Text style={styles.formSectionTitle}>PHOTOS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.formPhotoRow}>
            {imageUri && (
              <View style={styles.formPhotoThumbWrap}>
                <Image source={{ uri: imageUri }} style={styles.formPhotoThumb} />
                <TouchableOpacity style={styles.formPhotoThumbX} onPress={() => setImageUri(null)}>
                  <Icon name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
            {!imageUri && (
              <TouchableOpacity style={styles.formAddPhotoBtn} onPress={addPhoto} disabled={uploading}>
                {uploading ? <ActivityIndicator size="small" color={DS.lime} /> : <><Icon name="camera-plus" size={24} color={DS.lime} /><Text style={styles.formAddPhotoTxt}>Add photo</Text></>}
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>

        {/* Form Fields */}
        <View style={styles.formCardBlock}>
          <Text style={styles.formLabel}>Ground Name *</Text>
          <TextInput style={styles.formInput} value={form.name} onChangeText={t => setForm({...form, name: t})} placeholder="e.g. M.A. Chidambaram" placeholderTextColor={DS.textMuted} />
          
          <Text style={styles.formLabel}>Location (Area) *</Text>
          <TextInput style={styles.formInput} value={form.location} onChangeText={t => setForm({...form, location: t})} placeholder="e.g. Chepauk" placeholderTextColor={DS.textMuted} />
          
          <Text style={styles.formLabel}>City *</Text>
          <TextInput style={styles.formInput} value={form.city} onChangeText={t => setForm({...form, city: t})} placeholder="e.g. Chennai" placeholderTextColor={DS.textMuted} />
          
          <Text style={styles.formLabel}>Description</Text>
          <TextInput style={[styles.formInput, styles.formTextArea]} value={form.description} onChangeText={t => setForm({...form, description: t})} placeholder="Facilities, pitch details..." placeholderTextColor={DS.textMuted} multiline numberOfLines={4} />

          <Text style={styles.formLabel}>Full Address</Text>
          <TextInput style={[styles.formInput, styles.formTextArea]} value={form.address} onChangeText={t => setForm({...form, address: t})} placeholder="Full physical address..." placeholderTextColor={DS.textMuted} multiline numberOfLines={3} />
          
          <Text style={styles.formLabel}>Phone Contact</Text>
          <TextInput style={styles.formInput} value={form.phone} onChangeText={t => setForm({...form, phone: t})} placeholder="Phone number" placeholderTextColor={DS.textMuted} keyboardType="phone-pad" />
        </View>

        {(form.latitude && form.longitude) && (
          <View style={[styles.locationBadge, { marginBottom: 24 }]}>
            <Icon name="crosshairs-gps" size={20} color={DS.lime} />
            <View style={{marginLeft: 12}}>
              <Text style={{color: DS.textPrimary, fontWeight: '800', fontSize: 14}}>Location Pinned</Text>
              <Text style={styles.locationBadgeText}>Coordinates saved from map.</Text>
            </View>
          </View>
        )}

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.formSubmitBtn, loading && {opacity: 0.6}]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.8}>
          {loading ? <ActivityIndicator color={DS.bg} /> : <Text style={styles.formSubmitBtnText}>POST LISTING</Text>}
        </TouchableOpacity>
      </ScrollView>
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
    const params = { q: query, type: type === 'All' ? '' : type };
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
  }, [query, type]);

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
  useEffect(() => { if (inline && user) onRegisterFab?.(openAddGround); }, [inline, user, onRegisterFab, openAddGround]);

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
      {/* Collapsible Sticky Header */}
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
              numColumns={2}
              columnWrapperStyle={{ gap: 10 }}
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

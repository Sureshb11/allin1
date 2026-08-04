import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity,
  ActivityIndicator, Platform, Linking, Animated
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import MapView, { Marker } from 'react-native-maps';
import LegendsApi from '../services/LegendsApi';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { pav } from '../theme/pavilion';

const HEADER_HEIGHT = 300;

export default function GroundDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const [ground, setGround] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const DS = useTheme().colors;
  const P = pav(DS);
  const styles = useThemedStyles(makeStyles);
  
  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadGround();
  }, [id]);

  const loadGround = async () => {
    const res = await LegendsApi.getGroundDetail(id);
    if (res.success) {
      setGround(res.data.ground);
    }
    setLoading(false);
  };

  const openMaps = () => {
    if (ground.googleMapsUrl) {
      Linking.openURL(ground.googleMapsUrl);
    } else if (ground.latitude && ground.longitude) {
      const url = Platform.select({
        ios: `maps:0,0?q=${ground.name}@${ground.latitude},${ground.longitude}`,
        android: `geo:0,0?q=${ground.latitude},${ground.longitude}(${ground.name})`
      });
      Linking.openURL(url);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={DS.lime} />
      </View>
    );
  }

  if (!ground) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: DS.textPrimary, fontSize: 16 }}>Ground not found</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{marginTop: 20}}>
          <Text style={{color: DS.lime}}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const image = ground.images?.[0]?.imageUrl || 'https://via.placeholder.com/600x400?text=No+Image';

  const imageTranslateY = scrollY.interpolate({
    inputRange: [-HEADER_HEIGHT, 0, HEADER_HEIGHT],
    outputRange: [-HEADER_HEIGHT / 2, 0, HEADER_HEIGHT / 2],
    extrapolate: 'clamp',
  });

  const headerOpacity = scrollY.interpolate({
    inputRange: [HEADER_HEIGHT - 100, HEADER_HEIGHT - 20],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      {/* STICKY HEADER */}
      <Animated.View style={[styles.stickyHeader, { opacity: headerOpacity }]}>
        <Text style={styles.stickyTitle} numberOfLines={1}>{ground.name}</Text>
      </Animated.View>

      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Icon name="arrow-back" size={24} color="#FFF" />
      </TouchableOpacity>

      <Animated.ScrollView
        style={styles.scrollContainer}
        bounces={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* PARALLAX IMAGE */}
        <Animated.View style={[styles.imageContainer, { transform: [{ translateY: imageTranslateY }] }]}>
          <Image source={{ uri: image }} style={styles.coverImage} />
          <View style={styles.gradient} />
          <View style={styles.headerContent}>
            <Text style={styles.title}>{ground.name}</Text>
            <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 4}}>
              <Icon name="location" size={14} color="#E0E0E0" />
              <Text style={styles.subtitle}>{ground.location}</Text>
            </View>
          </View>
        </Animated.View>

        <View style={styles.content}>
          {/* STATS ROW */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Icon name="star" size={24} color="#FBBF24" />
              <Text style={styles.statValue}>{ground.averageRating ? ground.averageRating.toFixed(1) : 'New'}</Text>
              <Text style={styles.statLabel}>{ground.reviewCount || 0} Reviews</Text>
            </View>
            <View style={styles.statBox}>
              <Icon name="football" size={24} color={DS.lime} />
              <Text style={styles.statValue}>{ground.groundType ? ground.groundType.replace('_', ' ') : 'Unknown'}</Text>
              <Text style={styles.statLabel}>Type</Text>
            </View>
            <View style={styles.statBox}>
              <Icon name="baseball" size={24} color={DS.lime} />
              <Text style={styles.statValue}>{ground.playingSurface || 'Unknown'}</Text>
              <Text style={styles.statLabel}>Surface</Text>
            </View>
          </View>

          {/* ABOUT */}
          {ground.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.paragraph}>{ground.description}</Text>
            </View>
          )}

          {/* BALL TYPES & AMENITIES */}
          <View style={styles.tagsSection}>
            {ground.ballTypes && ground.ballTypes.length > 0 && (
              <View style={{flex: 1}}>
                <Text style={styles.sectionTitle}>Allowed Balls</Text>
                <View style={styles.tagsContainer}>
                  {ground.ballTypes.map((b, i) => (
                    <View key={i} style={styles.tag}><Text style={styles.tagText}>{b} ball</Text></View>
                  ))}
                </View>
              </View>
            )}
            {ground.amenities && ground.amenities.length > 0 && (
              <View style={{flex: 1}}>
                <Text style={styles.sectionTitle}>Amenities</Text>
                <View style={styles.tagsContainer}>
                  {ground.amenities.map(a => (
                    <View key={a.id} style={styles.tagOutline}><Text style={styles.tagOutlineText}>{a.amenity}</Text></View>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* MAP */}
          {ground.latitude && ground.longitude && (
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Location</Text>
                <TouchableOpacity onPress={openMaps} style={styles.dirBtn}>
                  <Text style={styles.dirBtnText}>Get Directions</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.paragraph}>{ground.address || ground.city}</Text>
              <View style={styles.mapContainer}>
                <MapView
                  style={styles.map}
                  initialRegion={{
                    latitude: ground.latitude,
                    longitude: ground.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                  userInterfaceStyle="dark"
                  scrollEnabled={false}
                  zoomEnabled={false}
                >
                  <Marker coordinate={{ latitude: ground.latitude, longitude: ground.longitude }} title={ground.name} />
                </MapView>
              </View>
            </View>
          )}
        </View>
      </Animated.ScrollView>

      {/* BOTTOM ACTION BAR */}
      <View style={styles.bottomBar}>
        <View style={styles.priceCol}>
          <Text style={styles.priceLabel}>Starting from</Text>
          <Text style={styles.priceVal}>₹500 <Text style={styles.priceUnit}>/ hr</Text></Text>
        </View>
        <TouchableOpacity style={styles.bookBtn}>
          <Text style={styles.bookBtnText}>Book Now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (DS, P) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  scrollContainer: { flex: 1 },
  
  stickyHeader: { position: 'absolute', top: 0, left: 0, right: 0, height: Platform.OS === 'ios' ? 100 : 80, paddingTop: Platform.OS === 'ios' ? 50 : 20, backgroundColor: DS.surfaceHigh, zIndex: 10, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: DS.faint },
  stickyTitle: { color: DS.textPrimary, fontSize: 17, fontWeight: '700' },
  
  imageContainer: { height: HEADER_HEIGHT, width: '100%', position: 'relative' },
  coverImage: { width: '100%', height: '100%' },
  gradient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
  
  backButton: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 20, left: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', zIndex: 11 },
  
  headerContent: { position: 'absolute', bottom: 30, left: 24, right: 24 },
  title: { fontSize: 32, fontWeight: '800', color: '#FFF', marginBottom: 6 },
  subtitle: { fontSize: 15, color: '#E0E0E0', marginLeft: 6, fontWeight: '500' },

  content: { padding: 24, backgroundColor: DS.bg, borderTopLeftRadius: 30, borderTopRightRadius: 30, marginTop: -30 },
  
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32, backgroundColor: DS.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: DS.faint, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 5 },
  statBox: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 15, fontWeight: '800', color: DS.textPrimary, marginTop: 10, textTransform: 'capitalize' },
  statLabel: { fontSize: 12, color: DS.textMuted, marginTop: 4, fontWeight: '600' },

  section: { marginBottom: 32 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 19, fontWeight: '800', color: DS.textPrimary, marginBottom: 12 },
  paragraph: { fontSize: 15, color: DS.textVariant, lineHeight: 24 },

  tagsSection: { flexDirection: 'row', gap: 20, marginBottom: 32 },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: DS.lime + '20', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  tagText: { color: DS.lime, fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
  tagOutline: { borderColor: DS.faint, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: DS.surfaceHigh },
  tagOutlineText: { color: DS.textVariant, fontSize: 13, fontWeight: '600' },

  dirBtn: { backgroundColor: DS.surfaceHigh, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: DS.faint },
  dirBtnText: { color: DS.textPrimary, fontSize: 13, fontWeight: '700' },

  mapContainer: { height: 220, width: '100%', borderRadius: 16, overflow: 'hidden', marginTop: 16, borderWidth: 1, borderColor: DS.faint },
  map: { flex: 1 },
  
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: DS.surfaceHigh, paddingHorizontal: 24, paddingTop: 16, paddingBottom: Platform.OS === 'ios' ? 34 : 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: DS.faint },
  priceCol: {},
  priceLabel: { fontSize: 12, color: DS.textMuted, fontWeight: '600', marginBottom: 2 },
  priceVal: { fontSize: 22, fontWeight: '800', color: DS.textPrimary },
  priceUnit: { fontSize: 14, color: DS.textMuted, fontWeight: '600' },
  bookBtn: { backgroundColor: DS.lime, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  bookBtnText: { color: DS.bg, fontSize: 16, fontWeight: '800' }
});

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity,
  ActivityIndicator, Platform, Linking, Animated, ScrollView, Dimensions,
  Share, Modal, TouchableWithoutFeedback, TextInput, Alert
} from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import Icon from 'react-native-vector-icons/Ionicons';
import MapView, { Marker } from 'react-native-maps';
import LegendsApi from '../services/LegendsApi';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { pav } from '../theme/pavilion';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const HEADER_HEIGHT = 300;

function DetailSkeleton({ DS }) {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  return (
    <View style={{ flex: 1, backgroundColor: DS.bg }}>
      <Animated.View style={{ height: HEADER_HEIGHT, backgroundColor: DS.surfaceHigh, opacity: pulseAnim }} />
      <View style={{ padding: 20, backgroundColor: DS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -24 }}>
        <Animated.View style={{ width: '60%', height: 32, borderRadius: 8, backgroundColor: DS.surfaceHigh, opacity: pulseAnim, marginBottom: 8 }} />
        <Animated.View style={{ width: '40%', height: 20, borderRadius: 8, backgroundColor: DS.surfaceHigh, opacity: pulseAnim, marginBottom: 24 }} />
        <Animated.View style={{ width: '100%', height: 1, backgroundColor: DS.surfaceHigh, opacity: pulseAnim, marginBottom: 24 }} />
        
        <Animated.View style={{ width: '30%', height: 24, borderRadius: 8, backgroundColor: DS.surfaceHigh, opacity: pulseAnim, marginBottom: 12 }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <Animated.View style={{ width: 100, height: 40, borderRadius: 12, backgroundColor: DS.surfaceHigh, opacity: pulseAnim }} />
          <Animated.View style={{ width: 140, height: 40, borderRadius: 12, backgroundColor: DS.surfaceHigh, opacity: pulseAnim }} />
          <Animated.View style={{ width: 120, height: 40, borderRadius: 12, backgroundColor: DS.surfaceHigh, opacity: pulseAnim }} />
        </View>
      </View>
    </View>
  );
}

export default function GroundDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const [ground, setGround] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isLightboxVisible, setLightboxVisible] = useState(false);
  const [activeLightboxIndex, setActiveLightboxIndex] = useState(0);
  
  // Reviews state
  const [reviews, setReviews] = useState([]);
  const [reviewUsers, setReviewUsers] = useState({});
  const [isReviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Booking state
  const [isBookingModalVisible, setBookingModalVisible] = useState(false);
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split('T')[0]);
  const [bookingSlot, setBookingSlot] = useState('Morning (6AM - 10AM)');
  const [submittingBooking, setSubmittingBooking] = useState(false);
  
  // Weather state
  const [weather, setWeather] = useState(null);
  
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
    const revRes = await LegendsApi.getGroundReviews(id);
    if (revRes.success) {
      setReviews(revRes.data.reviews || []);
      setReviewUsers(revRes.data.users || {});
    }

    // Fetch Weather if coordinates exist
    const g = res.data?.ground;
    if (g && g.latitude && g.longitude) {
      try {
        const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto`);
        const wData = await wRes.json();
        if (wData.daily) {
          setWeather({
            max: wData.daily.temperature_2m_max[0],
            min: wData.daily.temperature_2m_min[0],
            code: wData.daily.weathercode[0]
          });
        }
      } catch (err) {
        console.log("Weather fetch failed", err);
      }
    }

    setLoading(false);
  };

  const submitReview = async () => {
    if (submittingReview) return;
    setSubmittingReview(true);
    const res = await LegendsApi.addGroundReview(id, { rating: reviewRating, review: reviewText });
    setSubmittingReview(false);
    if (res.success) {
      setReviewModalVisible(false);
      setReviewText('');
      setReviewRating(5);
      loadGround(); // refresh ground and reviews to get updated averages
      Alert.alert('Success', 'Review submitted successfully!');
    } else {
      Alert.alert('Error', res.error || 'Failed to submit review');
    }
  };

  const submitBooking = async () => {
    if (submittingBooking) return;
    setSubmittingBooking(true);
    const res = await LegendsApi.bookGround(id, bookingDate, bookingSlot);
    setSubmittingBooking(false);
    if (res.success) {
      setBookingModalVisible(false);
      Alert.alert('Booking Requested', 'Your booking request has been sent to the ground admin.');
    } else {
      Alert.alert('Error', res.error || 'Failed to book ground');
    }
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

  const openPhone = () => {
    if (ground.phone) {
      Linking.openURL(`tel:${ground.phone}`);
    }
  };

  const handleShare = async () => {
    try {
      const message = `Check out ${ground.name} on Pavilion!\n${ground.location || ground.address}\n\nBook now via our app.`;
      await Share.share({
        message,
        title: `Book ${ground.name}`
      });
    } catch (error) {
      console.log(error.message);
    }
  };

  const handleImageScroll = (event) => {
    const slide = Math.ceil(event.nativeEvent.contentOffset.x / event.nativeEvent.layoutMeasurement.width - 0.1);
    if (slide !== activeImageIndex) setActiveImageIndex(slide);
  };

  if (loading) {
    return <DetailSkeleton DS={DS} />;
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

  const images = ground.images?.length > 0 
    ? ground.images.map(img => img.imageUrl) 
    : ['https://via.placeholder.com/600x400?text=No+Image'];

  const rating = ground.averageRating ? ground.averageRating.toFixed(1) : 'New';
  const reviewsCount = ground.reviewCount || 0;

  const headerOpacity = scrollY.interpolate({
    inputRange: [HEADER_HEIGHT - 100, HEADER_HEIGHT - 20],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      {/* STICKY HEADER */}
      <Animated.View style={[styles.stickyHeader, { opacity: headerOpacity, backgroundColor: DS.bg + 'E6' }]}>
        <Text style={styles.stickyTitle} numberOfLines={1}>{ground.name}</Text>
      </Animated.View>

      <TouchableOpacity style={styles.backButton} onPress={() => { ReactNativeHapticFeedback.trigger("selection"); navigation.goBack(); }}>
        <Icon name="arrow-back" size={24} color="#FFF" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.shareButton} onPress={() => { ReactNativeHapticFeedback.trigger("selection"); handleShare(); }}>
        <Icon name="share-social" size={22} color="#FFF" />
      </TouchableOpacity>

      <Animated.ScrollView
        style={styles.scrollContainer}
        bounces={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* CAROUSEL IMAGE */}
        <View style={styles.imageContainer}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleImageScroll}
            scrollEventThrottle={16}
            style={{ flex: 1 }}
          >
            {images.map((img, i) => (
              <TouchableWithoutFeedback key={i} onPress={() => { setActiveLightboxIndex(i); setLightboxVisible(true); }}>
                <Image source={{ uri: img }} style={styles.coverImage} />
              </TouchableWithoutFeedback>
            ))}
          </ScrollView>
          <View style={styles.pagination}>
            {images.map((_, i) => (
              <View key={i} style={[styles.dot, activeImageIndex === i && styles.activeDot]} />
            ))}
          </View>
        </View>

        <View style={styles.content}>
          {/* TITLE & META */}
          <View style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.title, { flexShrink: 1 }]}>{ground.name}</Text>
              {!!ground.verified && (
                <Icon name="check-decagram" size={19} color={DS.lime} style={{ marginLeft: 7 }} />
              )}
            </View>
            <Text style={styles.subtitle}>{ground.area || ground.city || ground.location}</Text>

            {/* Anyone can add a ground, so the page has to say whether anyone
                has checked this one. Stated positively where it is true and
                factually where it is not — "not verified yet" is the honest
                status of a new listing, not a warning about it. */}
            <View style={[styles.trustRow, ground.verified && styles.trustRowOn]}>
              <Icon
                name={ground.verified ? 'shield-check' : 'shield-alert-outline'}
                size={15}
                color={ground.verified ? DS.lime : DS.textMuted}
              />
              <Text style={[styles.trustText, ground.verified && { color: DS.lime }]}>
                {ground.verified
                  ? 'Verified ground — checked by Local Legends'
                  : 'Not verified yet — added by a player, confirm details before you travel'}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
              <Text style={{ fontSize: 14 }}>🏏</Text>
              <Text style={{ color: DS.textPrimary, fontWeight: '700', fontSize: 14, marginLeft: 6 }}>Cricket</Text>
              <Text style={{ color: DS.textMuted, fontSize: 14, marginHorizontal: 8 }}>•</Text>
              <Text style={{ color: DS.textPrimary, fontWeight: '700', fontSize: 14 }}>{rating} <Icon name="star" size={12} color="#FBBF24" /></Text>
              <Text style={{ color: DS.textMuted, fontSize: 14, marginLeft: 4 }}>({reviewsCount} ratings)</Text>
            </View>
          </View>

          {/* ADDRESS SECTION */}
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <Icon name="map-marker-outline" size={20} color={DS.textMuted} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.paragraph}>{ground.address || ground.location}</Text>
                <View style={{ flexDirection: 'row', marginTop: 16, gap: 12 }}>
                  <TouchableOpacity style={styles.pillBtn} onPress={openMaps}>
                    <Text style={styles.pillBtnText}>Get Directions</Text>
                  </TouchableOpacity>
                  {ground.phone && (
                    <TouchableOpacity style={[styles.pillBtn, { paddingHorizontal: 16 }]} onPress={openPhone}>
                      <Icon name="call" size={16} color={DS.textPrimary} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          {/* VENUE INFO */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Venue info</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
              <View style={styles.infoChip}><Text style={styles.infoChipText}>Pitch: 6 Nets</Text></View>
              <View style={styles.infoChip}><Text style={styles.infoChipText}>Equipment Provided</Text></View>
              {ground.playingSurface && <View style={styles.infoChip}><Text style={styles.infoChipText}>{ground.playingSurface}</Text></View>}
              <View style={styles.infoChip}><Text style={styles.infoChipText}>Artificial Turf</Text></View>
            </View>
          </View>

          <View style={styles.divider} />

          {/* AMENITIES */}
          {ground.amenities && ground.amenities.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Amenities</Text>
              <View style={{ marginTop: 12 }}>
                {ground.amenities.map(a => (
                  <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                    <Icon name="checkmark-circle" size={20} color={DS.textMuted} />
                    <Text style={{ color: DS.textPrimary, fontSize: 16, marginLeft: 12 }}>{a.amenity}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {ground.amenities && ground.amenities.length > 0 && <View style={styles.divider} />}

          {/* REVIEWS */}
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.sectionTitle}>Reviews</Text>
              <TouchableOpacity onPress={() => setReviewModalVisible(true)}>
                <Text style={{ color: DS.lime, fontWeight: '700', fontSize: 14 }}>Write Review</Text>
              </TouchableOpacity>
            </View>
            <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center' }}>
              <Icon name="star" size={24} color="#FBBF24" />
              <Text style={{ fontSize: 24, fontWeight: '800', color: DS.textPrimary, marginLeft: 8 }}>{rating}</Text>
              <Text style={{ fontSize: 14, color: DS.textMuted, marginLeft: 8, marginTop: 6 }}>/ 5 ({reviewsCount} reviews)</Text>
            </View>

            {reviews.length > 0 && (
              <View style={{ marginTop: 24 }}>
                {reviews.map(r => {
                  const author = reviewUsers[r.userId];
                  return (
                    <View key={r.id} style={{ marginBottom: 16, padding: 12, backgroundColor: DS.surfaceHigh, borderRadius: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: DS.surface, alignItems: 'center', justifyContent: 'center' }}>
                          {author?.avatarUrl ? <Image source={{ uri: author.avatarUrl }} style={{ width: 32, height: 32, borderRadius: 16 }} /> : <Text style={{ color: DS.textPrimary, fontWeight: '700' }}>{(author?.firstName || 'U')[0]}</Text>}
                        </View>
                        <View style={{ marginLeft: 10, flex: 1 }}>
                          <Text style={{ color: DS.textPrimary, fontWeight: '700', fontSize: 14 }}>{author?.firstName} {author?.lastName}</Text>
                          <View style={{ flexDirection: 'row', marginTop: 2 }}>
                            {[1, 2, 3, 4, 5].map(star => (
                              <Icon key={star} name="star" size={12} color={star <= r.rating ? '#FBBF24' : DS.border} />
                            ))}
                          </View>
                        </View>
                      </View>
                      {r.review ? <Text style={{ color: DS.textPrimary, fontSize: 14, lineHeight: 20 }}>{r.review}</Text> : null}
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.divider} />

          {/* WEATHER WIDGET */}
          {weather && (
            <View style={{ backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 16, marginBottom: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ color: DS.textMuted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 }}>Today's Weather</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: DS.textPrimary, fontSize: 24, fontWeight: '800' }}>{weather.max}°C</Text>
                  <Text style={{ color: DS.textMuted, fontSize: 16, marginLeft: 8, fontWeight: '600' }}>/ {weather.min}°C</Text>
                </View>
              </View>
              <View style={{ backgroundColor: DS.surface, width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={weather.code < 3 ? "sunny" : weather.code < 60 ? "partly-sunny" : "rainy"} size={24} color={weather.code < 3 ? "#FBBF24" : weather.code < 60 ? "#9CA3AF" : "#60A5FA"} />
              </View>
            </View>
          )}

          {/* VENUE RULES */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Venue rules</Text>
            <View style={{ marginTop: 12 }}>
              {(ground.description || "• Keep the premises clean.\n• No outside food allowed.\n• Wear appropriate sports shoes.").split('\n').map((rule, idx) => (
                <View key={idx} style={{ flexDirection: 'row', marginBottom: 8, paddingRight: 16 }}>
                  <Text style={{ color: DS.textMuted, fontSize: 16, marginRight: 8 }}>•</Text>
                  <Text style={{ color: DS.textPrimary, fontSize: 15, lineHeight: 22 }}>{rule.replace(/^•\s*/, '')}</Text>
                </View>
              ))}
            </View>
          </View>

        </View>
      </Animated.ScrollView>

      {/* BOTTOM ACTION BAR
          Most grounds are a listing — an address and a phone number — and only
          an admin turns bookings on, after checking the place is real and the
          person listing it may actually let it out. Offering "Book Now" on the
          rest sends the user into a request the server refuses with a 409. */}
      <View style={styles.bottomBar}>
        <View style={styles.priceCol}>
          {ground.price ? (
            <>
              <Text style={styles.priceLabel}>Starting from</Text>
              <Text style={styles.priceVal}>₹{ground.price} <Text style={styles.priceUnit}>/ hr</Text></Text>
            </>
          ) : (
            /* The fallback here used to be ₹500/hr, invented for any ground
               whose owner never gave a rate. A made-up price on a booking
               screen is the one number that must never be a guess. */
            <>
              <Text style={styles.priceLabel}>Price</Text>
              <Text style={styles.priceVal}>Ask the ground</Text>
            </>
          )}
        </View>

        {ground.bookingEnabled ? (
          <TouchableOpacity style={styles.bookBtn} onPress={() => { ReactNativeHapticFeedback.trigger("impactLight"); setBookingModalVisible(true); }}>
            <Text style={styles.bookBtnText}>Book Now</Text>
          </TouchableOpacity>
        ) : ground.phone ? (
          <TouchableOpacity
            style={styles.bookBtn}
            onPress={() => {
              ReactNativeHapticFeedback.trigger('impactLight');
              Linking.openURL(`tel:${String(ground.phone).replace(/\s/g, '')}`).catch(() => {});
            }}
          >
            <Text style={styles.bookBtnText}>Call Ground</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.bookBtn, { backgroundColor: DS.surfaceHigh }]}>
            <Text style={[styles.bookBtnText, { color: DS.textMuted }]}>Listed only</Text>
          </View>
        )}
      </View>

      {/* FULLSCREEN LIGHTBOX MODAL */}
      <Modal visible={isLightboxVisible} transparent={true} animationType="fade" onRequestClose={() => setLightboxVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
          <TouchableOpacity style={{ position: 'absolute', top: Platform.OS === 'ios' ? 50 : 20, right: 20, zIndex: 20, padding: 8 }} onPress={() => setLightboxVisible(false)}>
            <Icon name="close" size={32} color="#FFF" />
          </TouchableOpacity>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: activeLightboxIndex * SCREEN_WIDTH, y: 0 }}
          >
            {images.map((img, i) => (
              <View key={i} style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, justifyContent: 'center', alignItems: 'center' }}>
                <Image source={{ uri: img }} style={{ width: '100%', height: '80%', resizeMode: 'contain' }} />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* WRITE REVIEW MODAL */}
      <Modal visible={isReviewModalVisible} transparent={true} animationType="slide" onRequestClose={() => setReviewModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: DS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, minHeight: 350 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: DS.textPrimary }}>Write a Review</Text>
              <TouchableOpacity onPress={() => setReviewModalVisible(false)}>
                <Icon name="close" size={24} color={DS.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 24, gap: 12 }}>
              {[1, 2, 3, 4, 5].map(star => (
                <TouchableOpacity key={star} onPress={() => setReviewRating(star)}>
                  <Icon name="star" size={40} color={star <= reviewRating ? '#FBBF24' : DS.border} />
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={{ backgroundColor: DS.surfaceHigh, borderRadius: 12, padding: 16, color: DS.textPrimary, fontSize: 16, minHeight: 120, textAlignVertical: 'top' }}
              placeholder="Share your experience..."
              placeholderTextColor={DS.textMuted}
              multiline
              value={reviewText}
              onChangeText={setReviewText}
            />
            <TouchableOpacity style={[styles.bookBtn, { marginTop: 24, alignItems: 'center', opacity: submittingReview ? 0.7 : 1 }]} onPress={submitReview} disabled={submittingReview}>
              {submittingReview ? <ActivityIndicator color="#FFF" /> : <Text style={styles.bookBtnText}>Submit Review</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* BOOKING MODAL */}
      <Modal visible={isBookingModalVisible} transparent={true} animationType="slide" onRequestClose={() => setBookingModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: DS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, minHeight: 400 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: DS.textPrimary }}>Book Ground</Text>
              <TouchableOpacity onPress={() => setBookingModalVisible(false)}>
                <Icon name="close" size={24} color={DS.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <Text style={{ fontSize: 14, fontWeight: '700', color: DS.textMuted, marginBottom: 8, textTransform: 'uppercase' }}>Select Date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }}>
              {Array.from({length: 14}).map((_, i) => {
                const d = new Date();
                d.setDate(d.getDate() + i);
                const iso = d.toISOString().split('T')[0];
                const isSelected = bookingDate === iso;
                const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
                const dayNum = d.getDate();
                return (
                  <TouchableOpacity key={iso} onPress={() => setBookingDate(iso)} style={{ width: 64, height: 72, borderRadius: 16, backgroundColor: isSelected ? DS.lime : DS.surfaceHigh, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1, borderColor: isSelected ? DS.lime : DS.border }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: isSelected ? DS.bg : DS.textMuted, marginBottom: 4 }}>{dayName}</Text>
                    <Text style={{ fontSize: 20, fontWeight: '800', color: isSelected ? DS.bg : DS.textPrimary }}>{dayNum}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={{ fontSize: 14, fontWeight: '700', color: DS.textMuted, marginBottom: 8, textTransform: 'uppercase' }}>Select Slot</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 32 }}>
              {['Morning (6AM - 10AM)', 'Afternoon (11AM - 3PM)', 'Evening (4PM - 8PM)'].map(slot => {
                const isSelected = bookingSlot === slot;
                return (
                  <TouchableOpacity key={slot} onPress={() => setBookingSlot(slot)} style={{ backgroundColor: isSelected ? DS.lime : DS.surfaceHigh, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: isSelected ? DS.lime : DS.border }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: isSelected ? DS.bg : DS.textPrimary }}>{slot}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={[styles.bookBtn, { alignItems: 'center', opacity: submittingBooking ? 0.7 : 1 }]} onPress={submitBooking} disabled={submittingBooking}>
              {submittingBooking ? <ActivityIndicator color="#FFF" /> : <Text style={styles.bookBtnText}>Request Booking</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (DS, P) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  scrollContainer: { flex: 1 },
  
  stickyHeader: { position: 'absolute', top: 0, left: 0, right: 0, height: Platform.OS === 'ios' ? 100 : 80, paddingTop: Platform.OS === 'ios' ? 50 : 20, backgroundColor: DS.surfaceHigh, zIndex: 10, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: DS.faint },
  stickyTitle: { color: DS.textPrimary, fontSize: 17, fontWeight: '700' },
  
  imageContainer: { height: HEADER_HEIGHT, width: '100%', position: 'relative' },
  coverImage: { width: SCREEN_WIDTH, height: HEADER_HEIGHT, resizeMode: 'cover' },
  
  pagination: { position: 'absolute', bottom: 30, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.4)', marginHorizontal: 4 },
  activeDot: { backgroundColor: '#FFF', width: 24 },
  
  backButton: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 20, left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 11 },
  shareButton: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 20, right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 11 },
  
  content: { padding: 20, backgroundColor: DS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -24 },
  
  title: { fontSize: 24, fontWeight: '800', color: DS.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 15, color: DS.textMuted, fontWeight: '500' },
  trustRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: 12,
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10,
    backgroundColor: DS.surface, borderWidth: 1, borderColor: DS.faint,
  },
  trustRowOn: { backgroundColor: DS.lime + '12', borderColor: DS.lime + '55' },
  trustText: { flex: 1, marginLeft: 8, fontSize: 12, fontWeight: '700', color: DS.textMuted },

  section: { paddingVertical: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: DS.textPrimary },
  paragraph: { fontSize: 15, color: DS.textPrimary, lineHeight: 22 },
  
  divider: { height: 1, backgroundColor: DS.faint, marginVertical: 20 },

  pillBtn: { backgroundColor: DS.surfaceHigh, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24, borderWidth: 1, borderColor: DS.faint, alignItems: 'center', justifyContent: 'center' },
  pillBtnText: { color: DS.textPrimary, fontSize: 14, fontWeight: '700' },

  infoChip: { backgroundColor: DS.surfaceHigh, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  infoChipText: { color: DS.textPrimary, fontSize: 14, fontWeight: '600' },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: DS.surface, borderTopWidth: 1, borderTopColor: DS.faint, flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: Platform.OS === 'ios' ? 32 : 16 },
  priceCol: { flex: 1 },
  priceLabel: { color: DS.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 2 },
  priceVal: { color: DS.textPrimary, fontSize: 20, fontWeight: '800' },
  priceUnit: { color: DS.textMuted, fontSize: 14, fontWeight: '500' },
  
  bookBtn: { backgroundColor: DS.lime, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 16 },
  bookBtnText: { color: DS.bg, fontSize: 16, fontWeight: '700' }
});

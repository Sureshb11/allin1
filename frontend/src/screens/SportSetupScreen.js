/**
 * SportSetupScreen
 * Shows scoring format / game-type selection for the chosen sport.
 * Appears between SportPickerScreen and MainApp on every launch.
 *
 * Visual: "Kinetic Athlete" / "Stadium Under Lights" dark design system.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  StatusBar, Animated, Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { setSelectedSport } from '../utils/selectedSport';
import { getFormats } from '../sports/formats';

const { width: W } = Dimensions.get('window');
const CARD_W = (W - 48) / 2;

// ── Design System ───────────────────────────────────────────────────────────
const DS = {
  bg:              '#0f131f',
  surfaceLow:      '#171b28',
  surfaceHigh:     '#262a37',
  surfaceHighest:  '#313442',
  lime:            '#abd600',
  limeDark:        '#8ab000',
  textPrimary:     '#dfe2f3',
  textSecondary:   '#c3c5d9',
  textMuted:       '#8d90a2',
};


// ── Format card ───────────────────────────────────────────────────────────────
function FormatCard({ format, selected, color, onPress, delay }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 350,
      delay,
      useNativeDriver: true,
    }).start();
  }, [anim, delay]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] });

  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY }] }}>
      <TouchableOpacity
        style={[
          styles.card,
          selected && {
            borderColor: DS.lime,
            borderWidth: 2,
            backgroundColor: DS.lime + '10',
          },
        ]}
        onPress={onPress}
        activeOpacity={0.75}
      >
        {/* Selection indicator */}
        <View style={[
          styles.cardCheck,
          selected && { backgroundColor: DS.lime, borderColor: DS.lime },
        ]}>
          {selected && <Icon name="check" size={11} color={DS.bg} />}
        </View>

        {/* Icon circle */}
        <View style={[
          styles.cardIconCircle,
          { backgroundColor: selected ? DS.lime + '20' : DS.surfaceHighest },
        ]}>
          <Icon
            name={format.icon}
            size={26}
            color={selected ? DS.lime : DS.textMuted}
          />
        </View>

        <Text
          style={[styles.cardLabel, selected && { color: DS.lime }]}
          numberOfLines={2}
        >
          {format.label}
        </Text>
        <Text style={styles.cardDesc} numberOfLines={2}>{format.desc}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function SportSetupScreen({ route, navigation }) {
  const { sport } = route.params || {};
  const color     = sport?.c1 || '#22c55e';
  const cfg       = getFormats(sport?.id);

  const [selectedId, setSelectedId] = useState(cfg.formats[0]?.id || null);

  const headerAnim = useRef(new Animated.Value(0)).current;
  const btnAnim    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerAnim, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(btnAnim,    { toValue: 1, duration: 500, delay: cfg.formats.length * 60 + 200, useNativeDriver: true }),
    ]).start();
  }, [headerAnim, btnAnim, cfg.formats.length]);

  const handlePlay = () => {
    const selectedFormat = cfg.formats.find(f => f.id === selectedId) || cfg.formats[0];
    // Store in singleton so HomeScreen always reads the latest selection,
    // bypassing the unreliable initialParams chain in nested navigators.
    setSelectedSport(sport, selectedFormat);
    // Reset the stack so back from the app doesn't return to setup/Arena picker.
    navigation.reset({ index: 0, routes: [{ name: 'MainApp', params: { sport, format: selectedFormat } }] });
  };

  const headerTranslate = headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] });
  const btnTranslate    = btnAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={DS.bg} />

      {/* Header area with logo + sport info */}
      <Animated.View style={[
        styles.header,
        { opacity: headerAnim, transform: [{ translateY: headerTranslate }] },
      ]}>
        {/* Back button */}
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="chevron-left" size={22} color={DS.textSecondary} />
        </TouchableOpacity>

        {/* LOCAL LEGENDS logo */}
        <View style={styles.logoRow}>
          <View style={styles.logoStarBox}>
            <Icon name="star-four-points" size={12} color={DS.bg} />
          </View>
          <Text style={styles.logoLocal}>LOCAL</Text>
          <View style={styles.logoBadge}>
            <Text style={styles.logoBadgeText}>LEGENDS</Text>
          </View>
        </View>

        {/* Sport icon */}
        <View style={[styles.sportCircle, { shadowColor: color }]}>
          <Icon name={sport?.icon || 'trophy'} size={40} color={DS.lime} />
        </View>

        <Text style={styles.sportName}>{sport?.label || sport?.name || 'Sport'}</Text>

        {/* Title & subtitle */}
        <Text style={styles.sectionTitle}>{cfg.title.toUpperCase()}</Text>
        <Text style={styles.sectionSubtitle}>{cfg.subtitle}</Text>
      </Animated.View>

      {/* Format grid */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
      >
        {cfg.formats.map((fmt, i) => (
          <FormatCard
            key={fmt.id}
            format={fmt}
            selected={selectedId === fmt.id}
            color={color}
            onPress={() => setSelectedId(fmt.id)}
            delay={i * 55}
          />
        ))}
      </ScrollView>

      {/* Play button */}
      <Animated.View style={[
        styles.footer,
        { opacity: btnAnim, transform: [{ translateY: btnTranslate }] },
      ]}>
        <Text style={styles.footerHint}>
          {cfg.formats.find(f => f.id === selectedId)?.desc || ''}
        </Text>
        <TouchableOpacity
          style={styles.playBtn}
          onPress={handlePlay}
          activeOpacity={0.85}
        >
          <Icon name="play" size={20} color={DS.bg} />
          <Text style={styles.playBtnText}>LET'S PLAY</Text>
          <Icon name="arrow-right" size={18} color={DS.bg} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: DS.bg,
  },

  // ── Header
  header: {
    alignItems: 'center',
    paddingTop: 52,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: DS.surfaceLow,
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    top: 52,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: DS.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Logo
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
  },
  logoStarBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: DS.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLocal: {
    fontSize: 15,
    fontWeight: '900',
    color: DS.textPrimary,
    letterSpacing: 2,
  },
  logoBadge: {
    backgroundColor: DS.lime,
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  logoBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: DS.bg,
    letterSpacing: 1.5,
  },

  // ── Sport circle
  sportCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: DS.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  sportName: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 4,
    textTransform: 'uppercase',
    color: DS.textPrimary,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: DS.lime,
    letterSpacing: 3,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: DS.textMuted,
    marginTop: 4,
    letterSpacing: 0.5,
  },

  // ── Grid
  scroll: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 10,
    paddingBottom: 24,
  },

  // ── Card
  card: {
    width: CARD_W,
    backgroundColor: DS.surfaceHigh,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
    gap: 8,
    position: 'relative',
    minHeight: 135,
  },
  cardCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: DS.surfaceHighest,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: DS.textPrimary,
    letterSpacing: 0.5,
    lineHeight: 18,
  },
  cardDesc: {
    fontSize: 11,
    color: DS.textMuted,
    lineHeight: 15,
    letterSpacing: 0.2,
  },

  // ── Footer / play button
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 36,
    gap: 10,
    alignItems: 'center',
    backgroundColor: DS.surfaceLow,
  },
  footerHint: {
    fontSize: 11,
    color: DS.textMuted,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: W - 32,
    backgroundColor: DS.lime,
    shadowColor: DS.lime,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  playBtnText: {
    fontSize: 17,
    fontWeight: '900',
    color: DS.bg,
    letterSpacing: 2,
  },
});

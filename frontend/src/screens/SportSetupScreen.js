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

// ── Per-sport format definitions ─────────────────────────────────────────────
const SPORT_FORMATS = {
  cricket: {
    title: 'Select Format',
    subtitle: 'Choose match type & overs',
    formats: [
      { id: 't20',      label: 'T20',           icon: 'lightning-bolt',      desc: '20 overs per side',      overs: 20  },
      { id: 'odi',      label: 'ODI',           icon: 'cricket',             desc: '50 overs per side',      overs: 50  },
      { id: 't10',      label: 'T10',           icon: 'flash',               desc: '10 overs per side',      overs: 10  },
      { id: 'tapeball', label: 'Tape-Ball',     icon: 'circle',              desc: 'Tape ball, 10 overs',    overs: 10  },
      { id: 'test',     label: 'Test Match',    icon: 'calendar-range',      desc: '5 days, 2 innings',      overs: 0   },
      { id: 'custom',   label: 'Custom',        icon: 'tune',                desc: 'Set your own overs',     overs: null },
    ],
  },
  football: {
    title: 'Select Format',
    subtitle: 'Choose game type & duration',
    formats: [
      { id: 'full',     label: '90 Min',        icon: 'soccer',              desc: '2 × 45 min halves'  },
      { id: '60min',    label: '60 Min',        icon: 'timer-outline',       desc: '2 × 30 min halves'  },
      { id: 'futsal',   label: 'Futsal',        icon: 'soccer',              desc: '2 × 20 min halves'  },
      { id: 'friendly', label: 'Friendly',      icon: 'handshake',           desc: 'No time limit'      },
    ],
  },
  basketball: {
    title: 'Select Format',
    subtitle: 'Choose game type',
    formats: [
      { id: 'full',     label: 'Full Game',     icon: 'basketball',          desc: '4 × 10 min quarters' },
      { id: '3x3',      label: '3×3 Basketball',icon: 'numeric-3-box',       desc: 'Half court, 21 pts'  },
      { id: 'nba',      label: 'NBA Rules',     icon: 'star',                desc: '4 × 12 min quarters' },
      { id: '21pts',    label: '21 Points',     icon: 'counter',             desc: 'First to 21 wins'    },
    ],
  },
  tennis: {
    title: 'Select Format',
    subtitle: 'Choose match format',
    formats: [
      { id: 'bo3',      label: 'Best of 3',     icon: 'tennis',              desc: 'First to 2 sets'    },
      { id: 'bo5',      label: 'Best of 5',     icon: 'tennis',              desc: 'First to 3 sets'    },
      { id: 'tiebreak', label: 'Tie-Break',     icon: 'lightning-bolt',      desc: '10-point super TB'  },
      { id: 'fast4',    label: 'Fast4',         icon: 'flash',               desc: '4 games per set'    },
    ],
  },
  volleyball: {
    title: 'Select Format',
    subtitle: 'Choose format',
    formats: [
      { id: 'bo5',      label: 'Best of 5',     icon: 'volleyball',          desc: 'First to 3 sets'    },
      { id: 'bo3',      label: 'Best of 3',     icon: 'volleyball',          desc: 'First to 2 sets'    },
      { id: 'beach',    label: 'Beach 2v2',     icon: 'beach',               desc: 'Best of 3 sets'     },
    ],
  },
  badminton: {
    title: 'Select Format',
    subtitle: 'Choose match format',
    formats: [
      { id: 'bo3',      label: 'Best of 3',     icon: 'badminton',           desc: '21 pts per game'    },
      { id: 'bo5',      label: 'Best of 5',     icon: 'badminton',           desc: 'Tournament format'  },
      { id: 'singles',  label: 'Singles',       icon: 'account',             desc: '1v1 format'         },
      { id: 'doubles',  label: 'Doubles',       icon: 'account-multiple',    desc: '2v2 format'         },
    ],
  },
  tabletennis: {
    title: 'Select Format',
    subtitle: 'Choose match format',
    formats: [
      { id: 'bo7',      label: 'Best of 7',     icon: 'table-tennis',        desc: '11 pts per game'    },
      { id: 'bo5',      label: 'Best of 5',     icon: 'table-tennis',        desc: '11 pts per game'    },
      { id: 'bo3',      label: 'Best of 3',     icon: 'table-tennis',        desc: 'Quick format'       },
    ],
  },
  hockey: {
    title: 'Select Format',
    subtitle: 'Choose game format',
    formats: [
      { id: '4q',       label: 'Field Hockey',  icon: 'hockey-sticks',       desc: '4 × 15 min quarters'},
      { id: '2h',       label: '2 Halves',      icon: 'hockey-sticks',       desc: '2 × 35 min halves'  },
      { id: 'indoor',   label: 'Indoor Hockey', icon: 'home',                desc: '2 × 20 min halves'  },
      { id: 'mini',     label: 'Mini Hockey',   icon: 'hockey-sticks',       desc: 'Youth / friendly'   },
    ],
  },
  kabaddi: {
    title: 'Select Format',
    subtitle: 'Choose match format',
    formats: [
      { id: 'pro',      label: 'Pro Kabaddi',   icon: 'run-fast',            desc: '2 × 20 min halves'  },
      { id: 'amateur',  label: 'Amateur',       icon: 'run-fast',            desc: '2 × 15 min halves'  },
      { id: 'circle',   label: 'Circle Style',  icon: 'circle-outline',      desc: 'Traditional format' },
    ],
  },
  khokho: {
    title: 'Select Format',
    subtitle: 'Choose match format',
    formats: [
      { id: 'full',     label: 'Full Match',    icon: 'run',                 desc: '4 turns × 7 min'   },
      { id: 'super',    label: 'Super Kho-Kho', icon: 'flash',               desc: 'Fast-paced format'  },
    ],
  },
  boxing: {
    title: 'Select Rounds',
    subtitle: 'Choose number of rounds',
    formats: [
      { id: 'r12',      label: '12 Rounds',     icon: 'boxing-glove',        desc: 'Championship bout'  },
      { id: 'r10',      label: '10 Rounds',     icon: 'boxing-glove',        desc: 'Main event bout'    },
      { id: 'r8',       label: '8 Rounds',      icon: 'boxing-glove',        desc: 'Semi-main event'    },
      { id: 'r6',       label: '6 Rounds',      icon: 'boxing-glove',        desc: 'Undercard bout'     },
      { id: 'r4',       label: '4 Rounds',      icon: 'boxing-glove',        desc: 'Beginner bout'      },
    ],
  },
  karate: {
    title: 'Select Discipline',
    subtitle: 'Choose event type',
    formats: [
      { id: 'kumite',   label: 'Kumite',        icon: 'karate',              desc: 'Sparring match'     },
      { id: 'kata',     label: 'Kata',          icon: 'account',             desc: 'Forms & patterns'   },
      { id: 'team',     label: 'Team Kumite',   icon: 'account-group',       desc: '3v3 team sparring'  },
    ],
  },
  judo: {
    title: 'Select Format',
    subtitle: 'Choose bout duration',
    formats: [
      { id: '5m',       label: '5 Min Bout',    icon: 'human-handsup',       desc: 'Senior competition' },
      { id: '4m',       label: '4 Min Bout',    icon: 'human-handsup',       desc: 'Standard bout'      },
      { id: 'gs',       label: 'Golden Score',  icon: 'star',                desc: 'Sudden death OT'    },
    ],
  },
  wrestling: {
    title: 'Select Style',
    subtitle: 'Choose wrestling style',
    formats: [
      { id: 'freestyle',label: 'Freestyle',     icon: 'arm-flex-outline',    desc: '2 × 3 min periods'  },
      { id: 'greco',    label: 'Greco-Roman',   icon: 'arm-flex-outline',    desc: 'Upper body only'    },
      { id: 'beach',    label: 'Beach',         icon: 'beach',               desc: 'Outdoor format'     },
    ],
  },
  handball: {
    title: 'Select Format',
    subtitle: 'Choose game format',
    formats: [
      { id: 'full',     label: 'Full Match',    icon: 'handball',            desc: '2 × 30 min halves'  },
      { id: 'beach',    label: 'Beach Handball',icon: 'beach',               desc: 'Beach 2v2 format'   },
      { id: 'mini',     label: 'Mini Handball', icon: 'handball',            desc: 'Youth / friendly'   },
    ],
  },
  golf: {
    title: 'Select Format',
    subtitle: 'Choose round type',
    formats: [
      { id: '18',       label: '18 Holes',      icon: 'golf',                desc: 'Full stroke round'  },
      { id: '9',        label: '9 Holes',       icon: 'golf',                desc: 'Half round'         },
      { id: 'match',    label: 'Match Play',    icon: 'trophy-outline',      desc: 'Hole-by-hole win'   },
      { id: 'stroke',   label: 'Stroke Play',   icon: 'format-list-numbered',desc: 'Lowest total score' },
    ],
  },
  archery: {
    title: 'Select Discipline',
    subtitle: 'Choose archery type',
    formats: [
      { id: '70m',      label: '70m Recurve',   icon: 'bow-arrow',           desc: 'Olympic distance'   },
      { id: '50m',      label: '50m Field',     icon: 'bow-arrow',           desc: 'Standard distance'  },
      { id: '18m',      label: '18m Indoor',    icon: 'home',                desc: 'Indoor target'      },
      { id: 'compound', label: 'Compound',      icon: 'bow-arrow',           desc: 'Compound bow'       },
      { id: '3d',       label: '3D Archery',    icon: 'forest',              desc: 'Field course'       },
    ],
  },
  squash: {
    title: 'Select Format',
    subtitle: 'Choose match format',
    formats: [
      { id: 'bo5',      label: 'Best of 5',     icon: 'racquetball',         desc: 'Tournament format'  },
      { id: 'bo3',      label: 'Best of 3',     icon: 'racquetball',         desc: 'Quick match'        },
      { id: 'psa',      label: 'PSA Rules',     icon: 'star',                desc: 'Professional rules' },
    ],
  },
  pickleball: {
    title: 'Select Format',
    subtitle: 'Choose game format',
    formats: [
      { id: 'bo3',      label: 'Best of 3',     icon: 'tennis',              desc: 'Race to 11 per game'},
      { id: 'single',   label: 'Single Game',   icon: 'tennis',              desc: 'Race to 11 points'  },
      { id: 'doubles',  label: 'Doubles',       icon: 'account-multiple',    desc: '2v2 format'         },
      { id: 'singles',  label: 'Singles',       icon: 'account',             desc: '1v1 format'         },
    ],
  },
  billiards: {
    title: 'Select Game',
    subtitle: 'Choose billiards type',
    formats: [
      { id: 'snooker',  label: 'Snooker',       icon: 'billiards',           desc: '22 balls on table'  },
      { id: '8ball',    label: '8-Ball Pool',   icon: 'billiards',           desc: '15 balls, sink 8 last'},
      { id: '9ball',    label: '9-Ball Pool',   icon: 'billiards',           desc: 'Lowest numbered ball'},
      { id: 'carom',    label: 'Carom',         icon: 'billiards',           desc: 'No pockets'         },
    ],
  },
  snowboarding: {
    title: 'Select Discipline',
    subtitle: 'Choose event type',
    formats: [
      { id: 'halfpipe', label: 'Halfpipe',      icon: 'snowboard',           desc: 'Trick & style score'},
      { id: 'slopestyle',label: 'Slopestyle',   icon: 'snowboard',           desc: 'Rails & jumps'      },
      { id: 'bigair',   label: 'Big Air',       icon: 'snowboard',           desc: 'One big jump'       },
      { id: 'parallel', label: 'Parallel GS',   icon: 'snowboard',           desc: 'Side-by-side race'  },
    ],
  },
};

// ── Fallback for any sport not in the list ────────────────────────────────────
const DEFAULT_FORMATS = {
  title: 'Select Format',
  subtitle: 'Choose game format',
  formats: [
    { id: 'standard', label: 'Standard',  icon: 'trophy-outline', desc: 'Regular format'   },
    { id: 'friendly', label: 'Friendly',  icon: 'handshake',      desc: 'Casual match'     },
    { id: 'custom',   label: 'Custom',    icon: 'tune',           desc: 'Custom settings'  },
  ],
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
  const cfg       = SPORT_FORMATS[sport?.id] || DEFAULT_FORMATS;

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
    navigation.replace('MainApp', { sport, format: selectedFormat });
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

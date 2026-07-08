import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  RefreshControl, Modal, Dimensions, StatusBar, Animated,
  Image, FlatList
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { useTheme } from '../theme/ThemeContext';
import { useCurrentUser } from '../utils/currentUser';

const { width } = Dimensions.get('window');

const AnimatedPulse = ({ children }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.02, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulseAnim]);
  return <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>{children}</Animated.View>;
};

function HeroMatchSlider({ liveMatches, navigation }) {
  const { colors: DS, typography } = useTheme();
  
  // Try to find a live match and a scheduled match
  const liveMatch = liveMatches.find(m => m.status === 'live') || {
    team1: 'Chennai Chargers', team2: 'Mumbai Mavericks', score1: '217/4', score2: '—',
    overs: '11.0', rr: '19.7'
  };
  const upcomingMatch = liveMatches.find(m => m.status === 'scheduled') || {
    team1: 'Silver Caps', team2: 'D-Vigo-S XI', venue: 'Lords Ground, Mumbai'
  };

  const styles = StyleSheet.create({
    container: {
      paddingVertical: 24,
      backgroundColor: DS.bg,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      paddingHorizontal: 16,
      marginBottom: 16,
    },
    title: {
      fontSize: 20,
      fontFamily: typography.headline.fontFamily,
      fontWeight: typography.headline.fontWeight,
      color: DS.textPrimary,
    },
    subtitle: {
      fontSize: 14,
      fontFamily: typography.label.fontFamily,
      fontWeight: typography.label.fontWeight,
      color: DS.textVariant,
      marginTop: 2,
    },
    seeAll: {
      fontSize: 14,
      fontFamily: typography.label.fontFamily,
      fontWeight: '800',
      color: DS.blueDeep,
    },
    slideWrap: {
      width: width * 0.85,
      marginRight: 16,
    },
    // --- Live Card ---
    cardLive: {
      backgroundColor: DS.surface, 
      borderRadius: 16,
      padding: 24,
      elevation: 6,
      shadowColor: DS.danger,
      shadowOpacity: 0.1,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      borderWidth: 1,
      borderColor: DS.border,
    },
    cardLiveHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 24,
    },
    livePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    liveDot: {
      width: 8, height: 8,
      backgroundColor: DS.danger,
      borderRadius: 4,
    },
    liveTxt: {
      color: DS.danger,
      fontSize: 12,
      fontFamily: typography.label.fontFamily,
      fontWeight: '800',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    leagueBadge: {
      backgroundColor: DS.blueDeep,
      paddingHorizontal: 8, paddingVertical: 2,
      borderRadius: 4,
    },
    leagueBadgeTxt: {
      color: DS.onBlue,
      fontSize: 10,
      fontFamily: typography.label.fontFamily,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    scoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 24,
    },
    teamCol: {
      flex: 1,
      alignItems: 'center',
      gap: 8,
    },
    teamInitialBox: {
      width: 56, height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 2,
      shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    },
    teamInitialTxt: {
      color: DS.white,
      fontSize: 24,
      fontFamily: typography.headline.fontFamily,
      fontWeight: '900',
    },
    teamName: {
      color: DS.textPrimary,
      fontSize: 14,
      fontFamily: typography.label.fontFamily,
      fontWeight: '700',
      textAlign: 'center',
      minHeight: 34,
    },
    scoreTxt: {
      color: DS.textPrimary,
      fontSize: 24,
      fontFamily: typography.display.fontFamily,
      fontWeight: '900',
    },
    vsLine: {
      width: 1, height: 40,
      backgroundColor: DS.border,
      marginHorizontal: 10,
    },
    matchMeta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    metaTxt: {
      color: DS.textVariant,
      fontSize: 12,
      fontFamily: typography.label.fontFamily,
      fontWeight: '700',
    },
    metaTxtAccent: {
      color: DS.lime,
      fontSize: 12,
      fontFamily: typography.label.fontFamily,
      fontWeight: '700',
    },
    progressBar: {
      width: '100%', height: 6,
      backgroundColor: DS.surface,
      borderRadius: 3,
      marginBottom: 24,
      overflow: 'hidden',
    },
    progressFill: {
      width: '65%',
      height: '100%',
      backgroundColor: DS.lime,
      borderRadius: 3,
    },
    liveBtn: {
      backgroundColor: DS.blueDeep,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      height: 48,
      borderRadius: 8,
      shadowColor: DS.blueDeep, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    liveBtnTxt: {
      color: DS.onBlue,
      fontSize: 14,
      fontFamily: typography.label.fontFamily,
      fontWeight: '800',
      letterSpacing: 1,
    },

    // --- Ended Card (Instead of upcoming, let's match the second card in HTML) ---
    cardEnded: {
      backgroundColor: DS.surface,
      borderRadius: 16,
      padding: 24,
      borderWidth: 1,
      borderColor: DS.border,
    },
    endedLabel: {
      color: DS.textVariant,
      fontSize: 12,
      fontFamily: typography.label.fontFamily,
      fontWeight: '800',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    leagueBadgeMuted: {
      backgroundColor: DS.surfaceHigh,
      paddingHorizontal: 8, paddingVertical: 2,
      borderRadius: 4,
    },
    leagueBadgeMutedTxt: {
      color: DS.textVariant,
      fontSize: 10,
      fontFamily: typography.label.fontFamily,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    vsTxtSmall: {
      color: DS.textMuted,
      fontSize: 14,
      fontFamily: typography.label.fontFamily,
      fontWeight: '900',
    },
    resultBox: {
      backgroundColor: 'rgba(204,255,0,0.1)', // lime tint
      padding: 12,
      borderRadius: 8,
      alignItems: 'center',
      marginBottom: 24,
    },
    resultTxt: {
      color: DS.limeDark,
      fontSize: 14,
      fontFamily: typography.label.fontFamily,
      fontWeight: '800',
    },
    summaryBtn: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: DS.textMuted,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      height: 48,
      borderRadius: 8,
    },
    summaryBtnTxt: {
      color: DS.textPrimary,
      fontSize: 14,
      fontFamily: typography.label.fontFamily,
      fontWeight: '800',
    },
  });

  const getInitials = (name) => (name || 'T').substring(0, 2).toUpperCase();

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>From Your Circle</Text>
          <Text style={styles.subtitle}>Teams you've played for · friends' matches</Text>
        </View>
        <TouchableOpacity>
          <Text style={styles.seeAll}>See all</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={width * 0.85 + 16}
        decelerationRate="fast"
        contentContainerStyle={{ paddingLeft: 16, paddingRight: 16 }}
      >
        {/* Card 1: Live Now */}
        <View style={styles.slideWrap}>
          <View style={styles.cardLive}>
            <View style={styles.cardLiveHeader}>
              <View style={styles.livePill}>
                <AnimatedPulse><View style={styles.liveDot} /></AnimatedPulse>
                <Text style={styles.liveTxt}>Live Now</Text>
              </View>
              <View style={styles.leagueBadge}>
                <Text style={styles.leagueBadgeTxt}>T20 LEAGUE</Text>
              </View>
            </View>
            <View style={styles.scoreRow}>
              <View style={styles.teamCol}>
                <View style={[styles.teamInitialBox, { backgroundColor: DS.danger }]}>
                  <Text style={styles.teamInitialTxt}>{getInitials(liveMatch.team1)}</Text>
                </View>
                <Text style={styles.teamName}>{liveMatch.team1}</Text>
                <Text style={styles.scoreTxt}>{liveMatch.score1}</Text>
              </View>
              <View style={styles.vsLine} />
              <View style={styles.teamCol}>
                <View style={[styles.teamInitialBox, { backgroundColor: '#506600' }]}>
                  <Text style={styles.teamInitialTxt}>{getInitials(liveMatch.team2)}</Text>
                </View>
                <Text style={styles.teamName}>{liveMatch.team2}</Text>
                <Text style={[styles.scoreTxt, { color: DS.textVariant }]}>{liveMatch.score2}</Text>
              </View>
            </View>
            <View style={styles.matchMeta}>
              <Text style={styles.metaTxt}>Overs: {liveMatch.overs || '11.0'}</Text>
              <Text style={styles.metaTxtAccent}>RR: {liveMatch.rr || '19.7'}</Text>
            </View>
            <View style={styles.progressBar}>
              <View style={styles.progressFill} />
            </View>
            <TouchableOpacity 
              style={styles.liveBtn}
              onPress={() => navigation.navigate('Scorecard', { matchId: liveMatch.id || 'mock' })}
            >
              <Icon name="chart-box-outline" size={20} color={DS.onBlue} />
              <Text style={styles.liveBtnTxt}>LIVE SCORECARD</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Card 2: Match Ended */}
        <View style={styles.slideWrap}>
          <View style={styles.cardEnded}>
            <View style={styles.cardLiveHeader}>
              <Text style={styles.endedLabel}>Final Result</Text>
              <View style={styles.leagueBadgeMuted}>
                <Text style={styles.leagueBadgeMutedTxt}>Club Match</Text>
              </View>
            </View>
            <View style={styles.scoreRow}>
              <View style={styles.teamCol}>
                <View style={[styles.teamInitialBox, { backgroundColor: DS.textVariant }]}>
                  <Text style={styles.teamInitialTxt}>DX</Text>
                </View>
                <Text style={styles.teamName}>D-Vigo-S XI</Text>
                <Text style={styles.scoreTxt}>142/8</Text>
              </View>
              <Text style={styles.vsTxtSmall}>VS</Text>
              <View style={styles.teamCol}>
                <View style={[styles.teamInitialBox, { backgroundColor: DS.blueDeep }]}>
                  <Text style={styles.teamInitialTxt}>SC</Text>
                </View>
                <Text style={styles.teamName}>Silver Caps</Text>
                <Text style={styles.scoreTxt}>112/10</Text>
              </View>
            </View>
            <View style={styles.resultBox}>
              <Text style={styles.resultTxt}>D-Vigo-S XI won by 30 runs</Text>
            </View>
            <TouchableOpacity style={styles.summaryBtn}>
              <Text style={styles.summaryBtnTxt}>VIEW SUMMARY</Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

function FeedPost({ post }) {
  const { colors: DS, typography } = useTheme();
  const [liked, setLiked] = useState(false);

  const styles = StyleSheet.create({
    post: {
      borderBottomWidth: 1,
      borderBottomColor: DS.border,
      backgroundColor: DS.bg,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    avatar: {
      width: 48, height: 48,
      borderRadius: 24,
      backgroundColor: post.avatarColor || DS.blueDeep,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarTxt: {
      color: DS.white,
      fontSize: 20,
      fontFamily: typography.headline.fontFamily,
      fontWeight: '700',
    },
    name: {
      color: DS.textPrimary,
      fontSize: 16,
      fontFamily: typography.body.fontFamily,
      fontWeight: '700',
    },
    time: {
      color: DS.textVariant,
      fontSize: 12,
      fontFamily: typography.label.fontFamily,
      fontWeight: '600',
      marginTop: 2,
    },
    imageWrap: {
      width: '100%',
      aspectRatio: post.isVideo ? 16/9 : 1,
      backgroundColor: DS.surface,
    },
    image: {
      width: '100%',
      height: '100%',
    },
    playOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.2)',
    },
    playBtn: {
      width: 64, height: 64,
      borderRadius: 32,
      backgroundColor: 'rgba(255,255,255,0.25)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.5)',
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    actionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 24,
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    likeTxt: {
      color: DS.textPrimary,
      fontSize: 14,
      fontFamily: typography.label.fontFamily,
      fontWeight: '700',
    },
    captionWrap: {
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    caption: {
      color: DS.textPrimary,
      fontSize: 16,
      fontFamily: typography.body.fontFamily,
      lineHeight: 24,
    },
    captionBold: {
      fontWeight: '700',
    }
  });

  return (
    <View style={styles.post}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarTxt}>{post.initial}</Text>
          </View>
          <View>
            <Text style={styles.name}>{post.name}</Text>
            <Text style={styles.time}>· {post.time}</Text>
          </View>
        </View>
        <TouchableOpacity>
          <Icon name="dots-horizontal" size={24} color={DS.textVariant} />
        </TouchableOpacity>
      </View>

      <View style={styles.imageWrap}>
        <Image source={{ uri: post.image }} style={styles.image} resizeMode="cover" />
        {post.isVideo && (
          <View style={styles.playOverlay}>
            <View style={styles.playBtn}>
              <Icon name="play" size={40} color={DS.white} />
            </View>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <View style={styles.actionLeft}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setLiked(!liked)}>
            <Icon name={liked ? "heart" : "heart-outline"} size={24} color={liked ? DS.danger : DS.textVariant} />
            <Text style={styles.likeTxt}>{liked ? post.likes + 1 : post.likes} likes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <Icon name="comment-outline" size={24} color={DS.textVariant} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <Icon name="send-outline" size={24} color={DS.textVariant} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity>
          <Icon name="bookmark-outline" size={24} color={DS.textVariant} />
        </TouchableOpacity>
      </View>

      <View style={styles.captionWrap}>
        <Text style={styles.caption}>
          <Text style={styles.captionBold}>{post.handle}</Text> {post.caption}
        </Text>
      </View>
    </View>
  );
}


export default function HomeScreen({ navigation }) {
  const { colors: DS, typography, isDark } = useTheme();
  const meUser = useCurrentUser();
  const [liveMatches, setLiveMatches] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const lm = await legendsApi.getCircleMatches({ sport: 'cricket' });
      if (lm?.success) {
        setLiveMatches((lm.data || []).map(m => ({
          ...m,
          team1: typeof m.team1 === 'object' ? (m.team1?.name || 'Team 1') : String(m.team1 || 'Team 1'),
          team2: typeof m.team2 === 'object' ? (m.team2?.name || 'Team 2') : String(m.team2 || 'Team 2'),
          score1: String(m.score1 || '—'), score2: String(m.score2 || '—'),
          status: String(m.status || 'scheduled'), matchType: String(m.matchType || 'T20'),
        })));
      }
    } catch {}
  };

  useEffect(() => { load(); }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const styles = StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: DS.bg,
    },
    // Top App Bar
    topAppBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: DS.surface,
      borderBottomWidth: 1,
      borderBottomColor: DS.border,
      zIndex: 50,
    },
    logoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    logoLocal: {
      fontSize: 24,
      fontFamily: typography.headline.fontFamily,
      fontWeight: '900',
      letterSpacing: -0.5,
      color: DS.textPrimary,
    },
    logoLegendsPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: DS.lime,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 12,
      marginLeft: 4,
    },
    logoLegendsTxt: {
      color: DS.onLime,
      fontSize: 12,
      fontFamily: typography.label.fontFamily,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    topRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    avatarWrap: {
      width: 32, height: 32,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: DS.border,
    },
    feedTitleWrap: {
      paddingHorizontal: 16,
      paddingVertical: 16,
      backgroundColor: DS.bg,
    },
    feedTitle: {
      fontSize: 20,
      fontFamily: typography.headline.fontFamily,
      fontWeight: '700',
      color: DS.textPrimary,
    },
    fab: {
      position: 'absolute',
      bottom: 80,
      right: 24,
      width: 56, height: 56,
      borderRadius: 28,
      backgroundColor: DS.blueDeep,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 8,
      shadowColor: DS.blueDeep, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
      zIndex: 40,
    },
    // Bottom Nav (Mock)
    bottomNav: {
      position: 'absolute',
      bottom: 0, width: '100%',
      height: 64,
      backgroundColor: DS.surfaceHighest,
      borderTopWidth: 1,
      borderTopColor: DS.border,
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
      paddingHorizontal: 16,
      zIndex: 50,
    },
    navItem: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    navTxtActive: {
      color: DS.textPrimary,
      fontSize: 12,
      fontFamily: typography.label.fontFamily,
      fontWeight: '800',
    },
    navTxtInactive: {
      color: DS.textVariant,
      fontSize: 12,
      fontFamily: typography.label.fontFamily,
      fontWeight: '600',
    }
  });

  const MOCK_POSTS = [
    {
      id: '1', name: 'New Player', handle: 'new_player', time: '3d ago',
      initial: 'N', avatarColor: DS.blueDeep,
      image: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?q=80&w=800&auto=format&fit=crop', // generic cricket
      likes: 2, caption: 'prod like-persist test showing off the new field gear!',
      isVideo: false,
    },
    {
      id: '2', name: 'Strike Master', handle: 'strike_master', time: '5h ago',
      initial: 'S', avatarColor: DS.limeDark,
      image: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?q=80&w=800&auto=format&fit=crop', // generic stadium
      likes: 42, caption: 'Night games hits different. The intensity is on another level tonight! 🏏✨',
      isVideo: true,
    }
  ];

  return (
    <View style={styles.root}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={DS.surface} />
      
      {/* Top App Bar */}
      <View style={styles.topAppBar}>
        <View style={styles.logoRow}>
          <Text style={styles.logoLocal}>LOCAL</Text>
          <View style={styles.logoLegendsPill}>
            <Icon name="plus" size={14} color={DS.onLime} />
            <Text style={styles.logoLegendsTxt}>LEGENDS</Text>
          </View>
        </View>
        <View style={styles.topRight}>
          <TouchableOpacity><Icon name="plus-box-outline" size={24} color={DS.textVariant} /></TouchableOpacity>
          <TouchableOpacity><Icon name="bell-outline" size={24} color={DS.textVariant} /></TouchableOpacity>
          <TouchableOpacity style={styles.avatarWrap} onPress={() => navigation.navigate('Profile')}>
            {meUser?.avatarUrl ? (
              <Image source={{ uri: meUser.avatarUrl }} style={{ width: '100%', height: '100%' }} />
            ) : (
              <View style={{ width: '100%', height: '100%', backgroundColor: DS.textMuted, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="account" size={20} color={DS.white} />
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DS.lime} />}
      >
        <HeroMatchSlider liveMatches={liveMatches} navigation={navigation} />
        
        <View style={styles.feedTitleWrap}>
          <Text style={styles.feedTitle}>Latest from Players</Text>
        </View>

        {MOCK_POSTS.map(post => (
          <FeedPost key={post.id} post={post} />
        ))}
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('StartMatch')}>
        <Icon name="plus" size={32} color={DS.onBlue} />
      </TouchableOpacity>

      {/* Bottom Nav Bar (Matches the design exactly) */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem}>
          <Icon name="home" size={24} color={DS.limeDark} />
          <Text style={styles.navTxtActive}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Icon name="cricket" size={24} color={DS.textVariant} />
          <Text style={styles.navTxtInactive}>My Cricket</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Icon name="stadium" size={24} color={DS.textVariant} />
          <Text style={styles.navTxtInactive}>Pavilion</Text>
        </TouchableOpacity>
      </View>

    </View>
  );
}

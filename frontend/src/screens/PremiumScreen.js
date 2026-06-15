import React from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const DS = {
  bg: '#0f131f', surfaceLow: '#171b28', surfaceHigh: '#262a37', surfaceHighest: '#313442',
  lime: '#abd600', textPrimary: '#dfe2f3', textVariant: '#c3c5d9', textMuted: '#8d90a2',
  success: '#22c55e',
};

const FEATURES = [
  { icon: 'chart-line',     title: 'Advanced Analytics',       desc: 'Detailed match insights, player performance analytics, and tactical reports' },
  { icon: 'broadcast',      title: 'Live Streaming',            desc: 'Stream your matches live to followers and fans worldwide' },
  { icon: 'trophy',         title: 'Tournament Management',     desc: 'Create and manage professional tournaments with advanced features' },
  { icon: 'database',       title: 'Unlimited Storage',         desc: 'Store unlimited match videos, photos, and scorecards' },
  { icon: 'video',          title: 'Video Analysis',            desc: 'AI-powered video analysis for technique improvement' },
  { icon: 'headset',        title: 'Priority Support',          desc: '24/7 premium customer support and faster response times' },
  { icon: 'stadium',        title: 'Ground Directory',          desc: 'Access to premium cricket grounds and booking discounts' },
  { icon: 'chart-box',      title: 'Team Insights',             desc: 'Advanced team performance metrics and comparison tools' },
];

const PremiumScreen = () => (
  <View style={styles.container}>
    <StatusBar barStyle="light-content" backgroundColor={DS.bg} />
    <View style={styles.hero}>
      <Icon name="crown" size={32} color="#ffd700" />
      <View style={{ flex: 1 }}>
        <Text style={styles.heroTitle}>All Features Included</Text>
        <Text style={styles.heroSub}>Enjoy all premium features completely FREE!</Text>
      </View>
    </View>

    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
      <View style={styles.freeBanner}>
        <Icon name="check-circle" size={22} color={DS.success} />
        <Text style={styles.freeText}>
          You have access to all premium features at no cost!
        </Text>
      </View>

      <View style={styles.sectionHeader}>
        <Icon name="star-circle" size={16} color={DS.lime} />
        <Text style={styles.sectionTitle}>AVAILABLE FEATURES</Text>
      </View>

      {FEATURES.map((f, i) => (
        <View key={i} style={styles.featureCard}>
          <View style={styles.featureIcon}>
            <Icon name={f.icon} size={22} color={DS.lime} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.featureTitle}>{f.title}</Text>
            <Text style={styles.featureDesc}>{f.desc}</Text>
            <View style={styles.freePill}>
              <Icon name="check" size={12} color={DS.success} />
              <Text style={styles.freePillText}>Available for FREE</Text>
            </View>
          </View>
        </View>
      ))}

      <View style={styles.thankCard}>
        <Icon name="heart" size={28} color="#ef4444" />
        <Text style={styles.thankTitle}>Thank You!</Text>
        <Text style={styles.thankText}>
          We believe cricket should be accessible to everyone. That's why we've made all our premium features available to all users at no cost.
        </Text>
      </View>
    </ScrollView>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 18, paddingHorizontal: 16,
  },
  heroTitle: { fontSize: 20, fontWeight: '800', color: DS.textPrimary },
  heroSub: { fontSize: 12, color: DS.textMuted, marginTop: 2 },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  freeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: 16, padding: 16,
  },
  freeText: { flex: 1, fontSize: 14, fontWeight: '600', color: DS.success },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: DS.textMuted, letterSpacing: 1.5 },
  featureCard: {
    backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
  },
  featureIcon: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: DS.surfaceHighest,
    alignItems: 'center', justifyContent: 'center',
  },
  featureTitle: { fontSize: 15, fontWeight: '800', color: DS.textPrimary, marginBottom: 4 },
  featureDesc: { fontSize: 13, color: DS.textVariant, lineHeight: 19, marginBottom: 8 },
  freePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start',
  },
  freePillText: { fontSize: 11, fontWeight: '700', color: DS.success },
  thankCard: {
    backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 16,
    alignItems: 'center', gap: 8,
  },
  thankTitle: { fontSize: 18, fontWeight: '900', color: DS.textPrimary },
  thankText: { fontSize: 13, color: DS.textVariant, textAlign: 'center', lineHeight: 20 },
});

export default PremiumScreen;

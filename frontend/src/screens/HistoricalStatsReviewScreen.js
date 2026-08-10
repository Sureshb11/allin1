import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, StatusBar, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { haptic } from '../utils/haptics';
import GradientButton from '../components/GradientButton';
import { showToast } from '../components/Toast';
import legendsApi from '../services/LegendsApi';

import Animated, { FadeInDown, FadeIn, Layout } from 'react-native-reanimated';

export default function HistoricalStatsReviewScreen({ navigation, route }) {
  const { colors: DS, isDark } = useTheme();
  const s = useThemedStyles(makeStyles);
  const sport = route.params?.sport;

  const [activeTab, setActiveTab] = useState('Batting');
  const [saving, setSaving] = useState(false);

  // State objects for Batting and Bowling
  // Using simulated data to make it look like OCR extracted values from the scorecard
  const [batting, setBatting] = useState({
    matches: '48', innings: '42', notOuts: '6', runs: '1284', highestScore: '86', 
    battingAverage: '35.6', battingStrikeRate: '124.5', halfCenturies: '8', centuries: '0', 
    fours: '112', sixes: '34', battingDotBalls: '450', ducks: '2'
  });

  const [bowling, setBowling] = useState({
    matches: '48', innings: '36', oversBowled: '112.4', maidens: '4', wickets: '72', 
    runsConceded: '840', bestBowling: '4/12', economy: '7.46', bowlingStrikeRate: '15.6', 
    bowlingAverage: '11.6', wides: '24', noBalls: '6', dotBalls: '280', foursConceded: '64', sixesConceded: '18'
  });

  const handleUpdate = (type, field, value) => {
    const numericValue = value.replace(/[^0-9.]/g, ''); // allow decimals for avg/sr/overs
    if (type === 'batting') {
      setBatting(prev => ({ ...prev, [field]: numericValue }));
    } else {
      setBowling(prev => ({ ...prev, [field]: numericValue }));
    }
  };

  const handleSave = async () => {
    // Collect all fields that have a value
    const data = {};
    Object.entries(batting).forEach(([key, val]) => {
      if (val !== '') data[key] = parseFloat(val);
    });
    Object.entries(bowling).forEach(([key, val]) => {
      if (val !== '') {
        // Handle bestBowling strings vs numbers if needed, but for now we parse float
        // Wait, bestBowling is a string like "4/12". If they enter it, parse float will break it.
        // Let's not parse bestBowling yet if it's a string, or keep it as string.
        if (key === 'bestBowling') {
          data[key] = val; // leave as string
        } else {
          data[key] = parseFloat(val);
        }
      }
    });

    if (Object.keys(data).length === 0) {
      showToast('Please enter at least some stats.', 'error');
      return;
    }

    haptic.tick();
    setSaving(true);
    
    try {
      const profileRes = await legendsApi.getUserProfile(sport?.id);
      if (!profileRes.success || !profileRes.player?.id) {
        setSaving(false);
        showToast('Could not find your player profile.', 'error');
        return;
      }

      const playerId = profileRes.player.id;
      
      const payload = {
        data,
        imageUrls: route.params?.imageUris || []
      };

      const res = await legendsApi.submitHistoricalStats(playerId, payload);
      
      if (res.success) {
        await AsyncStorage.setItem('hasHistoricalStats', 'true');
        navigation.navigate('HistoricalStatsSuccess');
      } else {
        showToast(res.error || 'Failed to submit stats.', 'error');
      }
    } catch (e) {
      showToast('An error occurred.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const battingFields = [
    { label: 'Matches', key: 'matches' }, { label: 'Innings', key: 'innings' },
    { label: 'Runs', key: 'runs' }, { label: 'Highest Score', key: 'highestScore' },
    { label: 'Not Outs', key: 'notOuts' }, { label: 'Average', key: 'battingAverage' },
    { label: 'Strike Rate', key: 'battingStrikeRate' }, { label: 'Hundreds (100s)', key: 'centuries' },
    { label: 'Fifties (50s)', key: 'halfCenturies' }, { label: 'Fours (4s)', key: 'fours' },
    { label: 'Sixes (6s)', key: 'sixes' }, { label: 'Dot Balls', key: 'battingDotBalls' },
    { label: 'Ducks', key: 'ducks' }
  ];

  const bowlingFields = [
    { label: 'Matches', key: 'matches' }, { label: 'Innings', key: 'innings' },
    { label: 'Overs', key: 'oversBowled' }, { label: 'Wickets', key: 'wickets' },
    { label: 'Maidens', key: 'maidens' }, { label: 'Runs Conceded', key: 'runsConceded' },
    { label: 'Best Bowling', key: 'bestBowling', placeholder: 'e.g. 4/12' }, { label: 'Economy', key: 'economy' },
    { label: 'Average', key: 'bowlingAverage' }, { label: 'Strike Rate', key: 'bowlingStrikeRate' },
    { label: 'Dot Balls', key: 'dotBalls' }, { label: 'Wides', key: 'wides' },
    { label: 'No Balls', key: 'noBalls' }, { label: 'Fours Given', key: 'foursConceded' },
    { label: 'Sixes Given', key: 'sixesConceded' }
  ];

  return (
    <SafeAreaView style={s.screen}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={DS.bg} />
      
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="chevron-left" size={26} color={DS.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Edit Extracted Stats</Text>
      </View>

      {/* Tabs */}
      <View style={s.tabContainer}>
        <TouchableOpacity 
          style={[s.tab, activeTab === 'Batting' && s.activeTab]} 
          onPress={() => setActiveTab('Batting')}
        >
          <Text style={[s.tabText, activeTab === 'Batting' && s.activeTabText]}>Batting</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[s.tab, activeTab === 'Bowling' && s.activeTab]} 
          onPress={() => setActiveTab('Bowling')}
        >
          <Text style={[s.tabText, activeTab === 'Bowling' && s.activeTabText]}>Bowling</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeInDown.duration(400)} style={s.warningBox}>
          <Icon name="alert-circle-outline" size={20} color="#ffb703" />
          <Text style={s.warningText}>We've extracted as much as we could. Please fill in or correct the fields.</Text>
        </Animated.View>

        <Animated.View key={activeTab} entering={FadeIn.duration(300)} layout={Layout.springify()} style={s.statsGrid}>
          {(activeTab === 'Batting' ? battingFields : bowlingFields).map((field, idx) => (
            <View key={field.key} style={s.gridItem}>
              <Text style={s.statLabel}>{field.label}</Text>
              <TextInput
                style={s.statInput}
                value={activeTab === 'Batting' ? batting[field.key] : bowling[field.key]}
                onChangeText={(t) => handleUpdate(activeTab.toLowerCase(), field.key, t)}
                keyboardType={field.key === 'bestBowling' ? 'default' : 'decimal-pad'}
                placeholder={field.placeholder || '0'}
                placeholderTextColor={DS.textMuted}
              />
            </View>
          ))}
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(400).delay(300)} style={s.footer}>
          <GradientButton
            label={saving ? "Saving..." : "Confirm & Verify"}
            icon="check-circle"
            iconRight
            onPress={handleSave}
            disabled={saving}
            height={56}
            style={s.primaryBtn}
            textStyle={{ fontSize: 16 }}
            colors={[DS.lime, DS.lime]}
          />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: DS.bg },
  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingTop: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: DS.border
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: DS.textPrimary },
  
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: DS.surface,
    padding: 4, marginHorizontal: 20, marginTop: 16, borderRadius: 12,
    borderWidth: 1, borderColor: DS.border
  },
  tab: {
    flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8,
  },
  activeTab: { backgroundColor: DS.surfaceHighest },
  tabText: { fontSize: 14, fontWeight: '600', color: DS.textMuted },
  activeTabText: { color: DS.textPrimary, fontWeight: '800' },

  body: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  
  warningBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    backgroundColor: '#ffb7031a', borderRadius: 12, borderWidth: 1, borderColor: '#ffb70340',
    marginBottom: 24,
  },
  warningText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#ffb703', lineHeight: 18 },

  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    gap: 12,
  },
  gridItem: {
    width: '48%', backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 12,
    borderWidth: 1, borderColor: DS.surfaceHighest || '#2a2f42',
    marginBottom: 8,
  },
  statLabel: { fontSize: 13, fontWeight: '700', color: DS.textVariant, marginBottom: 8 },
  statInput: {
    backgroundColor: DS.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 16, fontWeight: '800', color: DS.textPrimary,
    borderWidth: 1, borderColor: DS.border,
  },
  footer: { marginTop: 32 },
  primaryBtn: { borderRadius: 16 },
});

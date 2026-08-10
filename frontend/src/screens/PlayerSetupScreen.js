import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView,
  ImageBackground, Platform, StatusBar, Modal, Pressable
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { haptic } from '../utils/haptics';
import { markPlayerSetup } from '../utils/playerSetup';
import legendsApi from '../services/LegendsApi';
import { showToast } from '../components/Toast';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import ThemeToggleButton from '../components/ThemeToggleButton';
import { BATTING_STYLES, BOWLING_STYLES } from '../sports/cricketProfile';

const bgImageRole = "https://lh3.googleusercontent.com/aida-public/AB6AXuCVSML0CIC5ZV7B_wKNRxJ8xUasBrR0BX8i0VAa7Mw7KwFZDbiyoWmZ594YyIH9y7aYE7y_EnV3XINdMcqxC9P1DIjyqEzeKDAaIdz0ehPR6GDfErtUSyjQhD6PK3ALLkD7f1XRpNoPu9BzibABPAayD4hPxTBA5mtmKZf7TxGdH4tAxUF1slU-XzqEZy2jRS_sr717Vc1pLVktuDjVeXIHyD3C4zYkvv8BPxWwQmjUBYArZtryzR3zOh1WImJOZFGEV1KciaVAHXQ";

const ROLES = [
  { id: 'Batter', title: 'Batter', desc: 'Focus on scoring runs, building partnerships, and anchoring the innings.', icon: 'cricket' },
  { id: 'Bowler', title: 'Bowler', desc: "Take crucial wickets and relentlessly restrict the opposition's scoring rate.", icon: 'baseball' },
  { id: 'All-rounder', title: 'All-rounder', desc: 'Provide vital balance to the team by contributing with both bat and ball.', icon: 'swap-horizontal' },
  { id: 'Wicketkeeper', title: 'Wicketkeeper', desc: 'The anchor of the fielding unit, commanding the game from behind the stumps.', icon: 'hand-back-left' },
];

export default function PlayerSetupScreen({ navigation, route }) {
  const DS = useTheme().colors;
  const s = useThemedStyles(makeStyles);
  
  const sport = route.params?.sport;
  const sportId = sport?.id || 'cricket';

  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState('ask'); // ask -> form -> styles
  const [saving, setSaving] = useState(false);
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);
  const [battingStyle, setBattingStyle] = useState(null);
  const [bowlingStyle, setBowlingStyle] = useState(null);
  const [bowlingOpen, setBowlingOpen] = useState(false);
  
  const enter = async (answer) => {
    await markPlayerSetup(sportId, answer);
    if (answer === 'player') {
      navigation.navigate('HistoricalStatsQuestion', { sport });
    } else {
      navigation.reset({ index: 0, routes: [{ name: 'MainApp', params: { sport } }] });
    }
  };

  useEffect(() => {
    let live = true;
    legendsApi.getUserProfile().then((res) => {
      if (!live) return;
      const p = res?.player || null;
      if (p?.role && p.role !== 'Player' && p.battingStyle) {
        enter('player');
        return;
      }
      setChecking(false);
    }).catch(() => live && setChecking(false));
    return () => { live = false; };
  }, []);

  const saveRoles = async () => {
    haptic.tick();
    if (selectedRoleIds.length === 0 || !battingStyle) return;
    setSaving(true);
    const primaryRole = selectedRoleIds.join(', ');
    const res = await legendsApi.saveMyPlayer({
      sport: sportId,
      role: primaryRole,
      battingStyle: battingStyle,
      bowlingStyle: bowlingStyle,
    });
    setSaving(false);
    if (!res.success) {
      showToast(res.error || 'Could not save that — try again, or skip for now.', 'error');
      return;
    }
    enter('player');
  };

  const toggleRole = (roleId) => {
    haptic.impact();
    setSelectedRoleIds(prev => 
      prev.includes(roleId) ? prev.filter(r => r !== roleId) : [...prev, roleId]
    );
  };


  if (checking) {
    return (
      <SafeAreaView style={s.root}>
        <StatusBar barStyle={DS.mode === 'dark' ? 'light-content' : 'dark-content'} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={DS.lime} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle={DS.mode === 'dark' ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
      
      {/* Background Image */}
      <ImageBackground source={{ uri: bgImageRole }} style={s.bgImage} imageStyle={{ opacity: DS.mode === 'dark' ? 0.3 : 0.05 }} />
      <View style={[s.ambientGlow, { backgroundColor: DS.lime }]} />

      <SafeAreaView style={{ flex: 1 }}>
        <ThemeToggleButton style={{ position: 'absolute', top: Platform.OS === 'ios' ? 60 : 40, right: 16, zIndex: 100 }} />
        
        {/* Top Bar */}
        <View style={s.topBar}>
          <TouchableOpacity style={s.backBtn} onPress={() => step === 'styles' ? setStep('form') : step === 'form' ? setStep('ask') : navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-left" size={24} color={DS.textPrimary} />
          </TouchableOpacity>
          <Text style={[s.stepText, { color: DS.lime }]}>{step === 'ask' ? 'STEP 1 OF 3' : step === 'form' ? 'STEP 2 OF 3' : 'STEP 3 OF 3'}</Text>
          <TouchableOpacity style={s.skipBtn} onPress={() => enter('skipped')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.skipTxt}>Skip</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Progress Bar */}
          <View style={s.stepper}>
            <View style={[s.stepDot, { backgroundColor: DS.lime }]} />
            <View style={[s.stepDot, (step === 'form' || step === 'styles') ? { backgroundColor: DS.lime } : {}]} />
            <View style={[s.stepDot, step === 'styles' ? { backgroundColor: DS.lime } : {}]} />
          </View>

          {/* Header */}
          <View style={s.header}>
            <Text style={s.h1}>{step === 'ask' ? "What's your role?" : step === 'form' ? "What's your game?" : "How do you play?"}</Text>
            <Text style={s.sub}>{step === 'ask' ? "How do you experience the game?" : step === 'form' ? "Tell us how you play. You can choose more than one." : "Your styles show up in squad lists and scorecards."}</Text>
          </View>

          {step === 'ask' && (
            <View style={s.askGrid}>
              <TouchableOpacity style={s.roleCard} activeOpacity={0.8} onPress={() => { haptic.impact(); setStep('form'); }}>
                <View style={s.iconContainer}>
                  <Icon name="cricket" size={40} color={DS.lime} />
                </View>
                <Text style={s.cardTitle}>I'm a Player</Text>
                <Text style={s.cardDesc}>I play, compete and build my stats</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.roleCard} activeOpacity={0.8} onPress={() => { haptic.impact(); enter('watching'); }}>
                <View style={s.iconContainer}>
                  <Icon name="stadium" size={40} color={DS.lime} />
                </View>
                <Text style={s.cardTitle}>I'm a Spectator</Text>
                <Text style={s.cardDesc}>I follow matches, teams and local legends</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'form' && (
            <View style={s.formGrid}>
              {ROLES.map(role => {
                const isSelected = selectedRoleIds.includes(role.id);
                return (
                  <TouchableOpacity 
                    key={role.id} 
                    style={[s.bentoCard, isSelected && { borderColor: DS.lime, backgroundColor: DS.lime + '0F' }]} 
                    activeOpacity={0.8} 
                    onPress={() => toggleRole(role.id)}
                  >
                    <View style={s.bentoHeader}>
                      <View style={[s.bentoIcon, isSelected && { backgroundColor: DS.lime + '33' }]}>
                        <Icon name={role.icon} size={28} color={DS.lime} />
                      </View>
                      <View style={[s.checkCircle, isSelected && { backgroundColor: DS.lime, borderColor: DS.lime }]}>
                        {isSelected && <Icon name="check" size={14} color={DS.onLime || '#fff'} />}
                      </View>
                    </View>
                    <Text style={[s.bentoTitle, isSelected && { color: DS.lime }]}>{role.title}</Text>
                    <Text style={s.bentoDesc}>{role.desc}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          {step === 'styles' && (
            <View style={s.stylesGrid}>
              <View style={s.head}>
                <Text style={s.label}>Batting style</Text>
                <Text style={s.req}>Required</Text>
              </View>
              <View style={s.segment}>
                {BATTING_STYLES.map((b) => {
                  const on = battingStyle === b;
                  return (
                    <TouchableOpacity key={b} style={[s.segBtn, on && s.segBtnOn]}
                      onPress={() => setBattingStyle(b)} activeOpacity={0.85}>
                      <Text style={[s.segText, on && s.segTextOn]}>{b.replace(' Bat', '')}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[s.head, { marginTop: 32 }]}>
                <Text style={s.label}>Bowling style</Text>
                <Text style={s.opt}>Optional</Text>
              </View>
              <TouchableOpacity style={s.select} onPress={() => setBowlingOpen(true)} activeOpacity={0.8}>
                <Icon name="bowling" size={20} color={DS.textMuted} />
                <Text style={[s.selectText, !bowlingStyle && { color: DS.textMuted }]}>
                  {bowlingStyle || 'Add a bowling style'}
                </Text>
                <Icon name="chevron-down" size={24} color={DS.textMuted} />
              </TouchableOpacity>
            </View>
          )}

        </ScrollView>

        {(step === 'form' || step === 'styles') && (
          <View style={s.footer}>
            <TouchableOpacity 
              style={[s.cta, (step === 'form' ? selectedRoleIds.length === 0 : !battingStyle) ? s.ctaDisabled : { backgroundColor: DS.lime }]} 
              activeOpacity={0.8} 
              onPress={() => step === 'form' ? setStep('styles') : saveRoles()}
              disabled={(step === 'form' ? selectedRoleIds.length === 0 : !battingStyle) || saving}
            >
              {saving ? <ActivityIndicator color={DS.onLime || '#fff'} /> : (
                <>
                  <Text style={[s.ctaText, (step === 'form' ? selectedRoleIds.length === 0 : !battingStyle) ? s.ctaTextDisabled : { color: DS.onLime || '#fff' }]}>{step === 'form' ? 'Continue' : 'Save & Continue'}</Text>
                  <Icon name="arrow-right" size={24} color={(step === 'form' ? selectedRoleIds.length === 0 : !battingStyle) ? DS.textMuted : (DS.onLime || '#fff')} style={{ opacity: (step === 'form' ? selectedRoleIds.length === 0 : !battingStyle) ? 0.5 : 1 }} />
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>

      <Modal visible={bowlingOpen} transparent animationType="slide" onRequestClose={() => setBowlingOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setBowlingOpen(false)} />
        <View style={s.sheet}>
          <View style={s.grab} />
          <Text style={s.sheetTitle}>Bowling style</Text>
          <ScrollView style={{ maxHeight: 400 }}>
            {BOWLING_STYLES.map((g) => (
              <View key={g.group}>
                <Text style={s.groupLabel}>{g.group.toUpperCase()}</Text>
                {g.options.map((o) => {
                  const on = bowlingStyle === o;
                  return (
                    <TouchableOpacity key={o} style={s.optionRow}
                      onPress={() => { setBowlingStyle(o); setBowlingOpen(false); }}>
                      <Text style={[s.optionText, on && { color: DS.lime, fontWeight: '800' }]}>{o}</Text>
                      {on && <Icon name="check" size={17} color={DS.lime} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  root: { flex: 1, backgroundColor: DS.bg },
  bgImage: { position: 'absolute', inset: 0, width: '100%', height: '100%', mixBlendMode: 'overlay' },
  ambientGlow: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0.05 },
  
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 64, backgroundColor: DS.bg + 'CC' },
  backBtn: { padding: 8, marginLeft: -8, width: 40, alignItems: 'center' },
  stepText: { fontSize: 14, fontWeight: '700', letterSpacing: 2 },
  skipBtn: { padding: 8, marginRight: 24, width: 40, alignItems: 'center' }, // adjusted marginRight to make room for theme toggle
  skipTxt: { color: DS.textMuted, fontSize: 14, fontWeight: '600' },
  
  scroll: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 120 },
  
  stepper: { flexDirection: 'row', gap: 8, marginBottom: 40, width: '100%', maxWidth: 200, alignSelf: 'center' },
  stepDot: { height: 6, flex: 1, backgroundColor: DS.surfaceHighest, borderRadius: 3 },
  
  header: { alignItems: 'center', marginBottom: 40 },
  h1: { fontSize: 36, fontWeight: '900', color: DS.textPrimary, letterSpacing: -1.5, textAlign: 'center' },
  sub: { fontSize: 16, color: DS.textVariant, marginTop: 8, textAlign: 'center', maxWidth: '80%', lineHeight: 22 },
  
  askGrid: { gap: 16, alignItems: 'center' },
  roleCard: { 
    width: '100%', maxWidth: 400, backgroundColor: DS.surface, borderRadius: 20, 
    borderWidth: 1, borderColor: DS.border, padding: 32, alignItems: 'center' 
  },
  iconContainer: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 24, backgroundColor: DS.surfaceHigh },
  cardTitle: { fontSize: 24, fontWeight: '700', color: DS.textPrimary, marginBottom: 8 },
  cardDesc: { fontSize: 15, color: DS.textVariant, textAlign: 'center' },

  formGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' },
  bentoCard: { 
    width: '47%', minWidth: 160, backgroundColor: DS.surface, borderRadius: 20, 
    borderWidth: 2, borderColor: DS.border, padding: 20 
  },
  bentoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  bentoIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: DS.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  checkCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: DS.textMuted, alignItems: 'center', justifyContent: 'center' },
  bentoTitle: { fontSize: 18, fontWeight: '700', color: DS.textPrimary, marginBottom: 8 },
  bentoDesc: { fontSize: 13, color: DS.textVariant, lineHeight: 18 },
  
  footer: { 
    position: 'absolute', bottom: 0, left: 0, right: 0, 
    paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 32 : 24, paddingTop: 16,
    backgroundColor: DS.bg + 'F2'
  },
  cta: {
    height: 56, borderRadius: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: DS.lime, shadowOffset: { width: 0, height: 4 }, shadowOpacity: DS.mode === 'dark' ? 0.3 : 0.1, shadowRadius: 10, elevation: 5
  },
  ctaDisabled: { backgroundColor: DS.surfaceHigh, shadowOpacity: 0, elevation: 0 },
  ctaText: { fontSize: 18, fontWeight: '700' },
  ctaTextDisabled: { color: DS.textMuted },

  // Step 3 Styles
  stylesGrid: { gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '800', color: DS.textPrimary, letterSpacing: 0.5 },
  req: { fontSize: 12, fontWeight: '800', color: DS.lime, letterSpacing: 0.5 },
  opt: { fontSize: 12, fontWeight: '700', color: DS.textMuted, letterSpacing: 0.5 },

  segment: { flexDirection: 'row', gap: 12 },
  segBtn: {
    flex: 1, paddingVertical: 18, borderRadius: 16, alignItems: 'center',
    backgroundColor: DS.surface, borderWidth: 2, borderColor: DS.border,
  },
  segBtnOn: { borderColor: DS.lime, backgroundColor: DS.lime + '1A' },
  segText: { fontSize: 15, fontWeight: '800', color: DS.textVariant },
  segTextOn: { color: DS.lime },

  select: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: DS.surface,
    borderWidth: 2, borderColor: DS.border, borderRadius: 16, padding: 18, gap: 12
  },
  selectText: { flex: 1, fontSize: 15, fontWeight: '800', color: DS.textPrimary },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: DS.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 20 },
  grab: { width: 40, height: 6, backgroundColor: DS.border, borderRadius: 3, alignSelf: 'center', marginBottom: 24 },
  sheetTitle: { fontSize: 22, fontWeight: '900', color: DS.textPrimary, marginBottom: 16, textAlign: 'center' },
  groupLabel: { fontSize: 14, fontWeight: '800', color: DS.textMuted, marginTop: 16, marginBottom: 12, letterSpacing: 1 },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: DS.faint },
  optionText: { fontSize: 17, fontWeight: '700', color: DS.textPrimary },
});

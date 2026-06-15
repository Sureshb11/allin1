import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
  StatusBar, ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';

const DS = {
  bg:       '#0b0f1e',
  bgMid:    '#111827',
  surface:  '#1a2035',
  card:     '#1e2538',
  border:   '#2a3050',
  lime:     '#abd600',
  blue:     '#3b82f6',
  blueDark: '#1d4ed8',
  onSurf:   '#e8eaf6',
  muted:    '#8892a4',
  dim:      '#374151',
};

const COUNTRIES = [
  { code: '+91', name: 'India', flag: '🇮🇳' },
  { code: '+1',  name: 'USA',   flag: '🇺🇸' },
  { code: '+44', name: 'UK',    flag: '🇬🇧' },
  { code: '+61', name: 'AUS',   flag: '🇦🇺' },
  { code: '+965',name: 'KWT',   flag: '🇰🇼' },
];

export default function LoginScreen({ navigation }) {
  const [countryCode, setCountryCode]         = useState('+91');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [phoneNumber, setPhoneNumber]         = useState('');
  const [otp, setOtp]                         = useState('');
  const [showOtpStep, setShowOtpStep]         = useState(false);
  const [loading, setLoading]                 = useState(false);

  const selectedCountry = COUNTRIES.find(c => c.code === countryCode) || COUNTRIES[0];

  const handleSendOtp = async () => {
    const cleaned = phoneNumber.replace(/\s/g, '');
    if (cleaned.length < 10) {
      Alert.alert('Invalid Number', 'Please enter a valid 10-digit phone number.');
      return;
    }
    setLoading(true);
    try {
      const result = await legendsApi.sendOtp(cleaned, countryCode);
      if (result.success) {
        setShowOtpStep(true);
        Alert.alert('OTP Sent', `Code sent to ${countryCode} ${phoneNumber}\n\nTest OTP: 1234`);
      } else {
        Alert.alert('Error', result.error || 'Failed to send OTP. Try again.');
      }
    } catch {
      Alert.alert('Connection Error', 'Server unreachable. Ensure backend is running on localhost:4000.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length < 4) {
      Alert.alert('Invalid OTP', 'Please enter the 4-digit verification code.');
      return;
    }
    setLoading(true);
    try {
      const cleaned = phoneNumber.replace(/\s/g, '');
      const result = await legendsApi.verifyOtp(cleaned, otp, countryCode);
      if (result.success) {
        navigation.replace('SportPicker');
      } else {
        Alert.alert('Incorrect OTP', result.error || 'The code you entered is invalid.');
      }
    } catch {
      Alert.alert('Connection Error', 'Server unreachable.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor={DS.bg} />

      {/* ── Header bar ─────────────────────────────────── */}
      <View style={s.header}>
        <View style={s.logoBox}>
          <Icon name="star-four-points" size={14} color={DS.bg} />
        </View>
        <Text style={s.logoLocal}>LOCAL</Text>
        <View style={s.logoBadge}>
          <Text style={s.logoBadgeText}>LEGENDS</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero copy ───────────────────────────────── */}
        <View style={s.hero}>
          <View style={s.liveRow}>
            <View style={s.liveLine} />
            <Text style={s.liveLabel}>LIVE UPDATES</Text>
          </View>

          {showOtpStep ? (
            <Text style={s.heroTitle}>
              <Text style={s.heroTitleWhite}>ENTER{'\n'}</Text>
              <Text style={s.heroTitleBlue}>THE CODE</Text>
            </Text>
          ) : (
            <Text style={s.heroTitle}>
              <Text style={s.heroTitleWhite}>GET INTO{'\n'}THE{'\n'}</Text>
              <Text style={s.heroTitleBlue}>ACTION</Text>
            </Text>
          )}

          <Text style={s.heroSub}>
            {showOtpStep
              ? `Enter the code sent to ${countryCode} ${phoneNumber}`
              : 'Enter your mobile number to receive a one-time password and join the arena.'}
          </Text>
        </View>

        {/* ── Form card ───────────────────────────────── */}
        <View style={s.card}>
          {showOtpStep ? (
            /* OTP step */
            <View>
              <TouchableOpacity style={s.backRow} onPress={() => { setShowOtpStep(false); setOtp(''); }}>
                <Icon name="arrow-left" size={18} color={DS.lime} />
                <Text style={s.backText}>Change Number</Text>
              </TouchableOpacity>

              <Text style={s.fieldLabel}>VERIFICATION CODE</Text>
              <TextInput
                style={s.otpInput}
                placeholder="• • • •"
                placeholderTextColor={DS.muted}
                value={otp}
                onChangeText={v => setOtp(v.replace(/\D/g, '').slice(0, 4))}
                keyboardType="numeric"
                maxLength={4}
                autoFocus
              />

              <TouchableOpacity
                style={[s.sendBtn, loading && s.btnDisabled]}
                onPress={handleVerifyOtp}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Text style={s.sendBtnText}>VERIFY & JOIN</Text>
                      <Icon name="lightning-bolt" size={18} color="#fff" />
                    </>
                }
              </TouchableOpacity>

              <TouchableOpacity style={s.resendBtn} onPress={handleSendOtp} disabled={loading}>
                <Text style={s.resendText}>Resend OTP</Text>
              </TouchableOpacity>

              <Text style={s.testHint}>Test OTP: 1234</Text>
            </View>
          ) : (
            /* Phone step */
            <View>
              <Text style={s.fieldLabel}>PHONE NUMBER</Text>

              <View style={s.phoneRow}>
                <TouchableOpacity
                  style={s.countryBtn}
                  onPress={() => setShowCountryPicker(!showCountryPicker)}
                  activeOpacity={0.8}
                >
                  <Text style={s.countryFlag}>{selectedCountry.flag}</Text>
                  <Text style={s.countryCode}>{countryCode}</Text>
                  <Icon name={showCountryPicker ? 'chevron-up' : 'chevron-down'} size={14} color={DS.muted} />
                </TouchableOpacity>

                <TextInput
                  style={s.phoneInput}
                  placeholder="000 000 0000"
                  placeholderTextColor={DS.muted}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  maxLength={10}
                  editable={!loading}
                />
              </View>

              {showCountryPicker && (
                <View style={s.dropdown}>
                  {COUNTRIES.map(c => (
                    <TouchableOpacity
                      key={c.code}
                      style={[s.dropdownRow, c.code === countryCode && s.dropdownRowActive]}
                      onPress={() => { setCountryCode(c.code); setShowCountryPicker(false); }}
                    >
                      <Text style={s.countryFlag}>{c.flag}</Text>
                      <Text style={s.dropdownName}>{c.name}</Text>
                      <Text style={s.dropdownCode}>{c.code}</Text>
                      {c.code === countryCode && <Icon name="check" size={14} color={DS.lime} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={[s.sendBtn, loading && s.btnDisabled]}
                onPress={handleSendOtp}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Text style={s.sendBtnText}>SEND OTP</Text>
                      <Icon name="lightning-bolt" size={18} color="#fff" />
                    </>
                }
              </TouchableOpacity>

              <View style={s.divider}>
                <View style={s.dividerLine} />
                <Text style={s.dividerLabel}>OR</Text>
                <View style={s.dividerLine} />
              </View>

              <TouchableOpacity
                style={s.createBtn}
                onPress={() => navigation.navigate('SignUp')}
                activeOpacity={0.85}
              >
                <Text style={s.createBtnText}>Create New Account</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Footer */}
        <Text style={s.footer}>
          BY CONTINUING, YOU AGREE TO LOCAL LEGENDS'{'\n'}
          <Text style={s.footerLink}>TERMS OF SERVICE</Text>
          {' & '}
          <Text style={s.footerLink}>PRIVACY POLICY</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DS.bg },

  /* Header */
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingTop: 52, paddingBottom: 8,
  },
  logoBox: {
    width: 28, height: 28, borderRadius: 7,
    backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center',
  },
  logoLocal: { fontSize: 16, fontWeight: '900', color: '#fff', letterSpacing: 2 },
  logoBadge: {
    backgroundColor: DS.lime, borderRadius: 5,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  logoBadgeText: { fontSize: 12, fontWeight: '900', color: DS.bg, letterSpacing: 1.5 },

  /* Scroll */
  scroll: { flexGrow: 1, paddingBottom: 32 },

  /* Hero */
  hero: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 32 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  liveLine: { width: 32, height: 2, backgroundColor: DS.lime },
  liveLabel: { fontSize: 11, fontWeight: '800', color: DS.lime, letterSpacing: 2.5 },
  heroTitle: { fontSize: 52, fontWeight: '900', lineHeight: 56, marginBottom: 16, fontStyle: 'italic' },
  heroTitleWhite: { color: '#fff' },
  heroTitleBlue: { color: '#60a5fa' },
  heroSub: { fontSize: 15, color: DS.muted, lineHeight: 22 },

  /* Card */
  card: {
    marginHorizontal: 16, backgroundColor: DS.card,
    borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: DS.border,
  },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
  backText: { fontSize: 13, color: DS.lime, fontWeight: '700' },

  /* Field */
  fieldLabel: {
    fontSize: 10, fontWeight: '800', color: DS.muted,
    letterSpacing: 2, marginBottom: 10,
  },

  /* Phone row */
  phoneRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  countryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: DS.surface, borderRadius: 12, borderWidth: 1, borderColor: DS.border,
    paddingHorizontal: 12, paddingVertical: 14,
  },
  countryFlag: { fontSize: 18 },
  countryCode: { fontSize: 14, fontWeight: '700', color: DS.onSurf },
  phoneInput: {
    flex: 1, backgroundColor: DS.surface,
    borderRadius: 12, borderWidth: 1, borderColor: DS.border,
    paddingHorizontal: 14, paddingVertical: 14,
    fontSize: 16, color: DS.onSurf, letterSpacing: 1,
  },

  /* Dropdown */
  dropdown: {
    backgroundColor: DS.surface, borderRadius: 12,
    borderWidth: 1, borderColor: DS.border, marginBottom: 16, overflow: 'hidden',
  },
  dropdownRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: DS.border,
  },
  dropdownRowActive: { backgroundColor: DS.dim + '50' },
  dropdownName: { flex: 1, fontSize: 14, color: DS.onSurf, fontWeight: '600' },
  dropdownCode: { fontSize: 13, color: DS.muted },

  /* OTP input */
  otpInput: {
    backgroundColor: DS.surface, borderRadius: 12,
    borderWidth: 1, borderColor: DS.border,
    paddingVertical: 16, fontSize: 28, fontWeight: '900',
    textAlign: 'center', letterSpacing: 14, color: DS.onSurf,
    marginBottom: 20,
  },

  /* Buttons */
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: DS.blue, borderRadius: 14,
    paddingVertical: 16, marginBottom: 8,
  },
  btnDisabled: { backgroundColor: DS.dim },
  sendBtnText: { fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: 1.5 },
  resendBtn: { paddingVertical: 12, alignItems: 'center' },
  resendText: { fontSize: 13, color: DS.muted, fontWeight: '600' },
  testHint: { fontSize: 11, color: DS.muted, textAlign: 'center', marginTop: 4 },

  /* Divider */
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: DS.border },
  dividerLabel: { fontSize: 11, color: DS.muted, fontWeight: '700', letterSpacing: 1 },

  /* Create account */
  createBtn: {
    borderWidth: 1.5, borderColor: DS.lime, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
  },
  createBtnText: { fontSize: 14, fontWeight: '800', color: DS.lime, letterSpacing: 0.5 },

  /* Footer */
  footer: {
    fontSize: 9, color: DS.muted, textAlign: 'center',
    letterSpacing: 1, marginTop: 24, paddingHorizontal: 20, lineHeight: 16,
  },
  footerLink: { color: DS.onSurf, fontWeight: '700' },
});

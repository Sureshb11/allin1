// LoginScreen — "Stadium Under Lights" redesign (Kinetic Athlete).
// Deep-night surfaces with an electric-blue glow; the blue gradient is the
// primary action identity, lime is reserved for the LIVE signal.
import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Pressable,
  KeyboardAvoidingView, Platform, StatusBar, ScrollView, Modal
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import legendsApi from '../services/LegendsApi';
import { showToast } from '../components/Toast';
import { haptic } from '../utils/haptics';
import BrandLogo from '../components/BrandLogo';
import GradientButton from '../components/GradientButton';
import ThemeToggleButton from '../components/ThemeToggleButton';

const COUNTRIES = [
  { code: '+91', name: 'India', flag: '🇮🇳' },
  { code: '+1', name: 'USA', flag: '🇺🇸' },
  { code: '+44', name: 'UK', flag: '🇬🇧' },
  { code: '+61', name: 'Australia', flag: '🇦🇺' },
  { code: '+965', name: 'Kuwait', flag: '🇰🇼' },
  { code: '+971', name: 'UAE', flag: '🇦🇪' },
];

function TopGlow({ color, dim }) {
  return (
    <Svg pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0 }} width="100%" height={420}>
      <Defs>
        <RadialGradient id="lg" cx="50%" cy="0%" r="85%">
          <Stop offset="0" stopColor={color} stopOpacity={dim ? 0.18 : 0.35} />
          <Stop offset="0.6" stopColor={color} stopOpacity={0.05} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="420" fill="url(#lg)" />
    </Svg>
  );
}

export default function LoginScreen({ navigation }) {
  const { colors: DS, isDark } = useTheme();
  const s = useThemedStyles(makeS);
  const [countryCode, setCountryCode] = useState('+91');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [showOtpStep, setShowOtpStep] = useState(false);
  const [showNameStep, setShowNameStep] = useState(false);
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isOtpFocused, setIsOtpFocused] = useState(false);
  const otpRef = useRef(null);

  const selectedCountry = COUNTRIES.find((c) => c.code === countryCode) || COUNTRIES[0];

  const focusOtpInput = () => {
    haptic.tick();
    if (otpRef.current) {
      otpRef.current.blur();
      setTimeout(() => {
        otpRef.current?.focus();
      }, 50);
    }
  };

  const handleSendOtp = async () => {
    const cleaned = phoneNumber.replace(/\s/g, '');
    if (cleaned.length < 10) {
      showToast('Enter a valid 10-digit phone number', 'error');
      return;
    }
    setLoading(true);
    try {
      const result = await legendsApi.sendOtp(cleaned, countryCode);
      if (result.success) {
        setShowOtpStep(true);
        showToast(`Code sent to ${countryCode} ${phoneNumber} · test 1234`, 'success', 3200);
        setTimeout(() => focusOtpInput(), 300);
      } else {
        showToast(result.error || 'Failed to send OTP. Try again.', 'error');
      }
    } catch {
      showToast('Server unreachable. Check your connection.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length < 4) {
      showToast('Enter the 4-digit verification code', 'error');
      return;
    }
    setLoading(true);
    try {
      const cleaned = phoneNumber.replace(/\s/g, '');
      const result = await legendsApi.verifyOtp(cleaned, otp, countryCode);
      if (result.success) {
        if (result.isNewUser) {
          setShowNameStep(true);
        } else {
          navigation.replace('SportPicker');
        }
      } else {
        showToast(result.error || 'The code you entered is invalid.', 'error');
      }
    } catch {
      showToast('Server unreachable. Check your connection.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveName = async () => {
    const name = fullName.trim().replace(/\s+/g, ' ');
    if (name.length < 2) {
      showToast('Enter your name to continue', 'error');
      return;
    }
    const parts = name.split(' ');
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ') || '';
    setLoading(true);
    try {
      const result = await legendsApi.updateUserProfile({ firstName, lastName });
      if (result.success) {
        showToast(`Welcome to the arena, ${firstName}!`, 'success');
        navigation.replace('SportPicker');
      } else {
        showToast(result.error || 'Could not save your name. Try again.', 'error');
      }
    } catch {
      showToast('Server unreachable. Check your connection.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={DS.bg} />
      <TopGlow color={DS.blueSoft || '#3b82f6'} dim={!isDark} />

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Brand Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 56, paddingBottom: 8 }}>
          <BrandLogo tagline scale={1.2} />
          <ThemeToggleButton />
        </View>

        {/* Hero Step Title */}
        <View style={s.hero}>
          {showNameStep || showOtpStep ? (
            <View style={[s.pill, s.pillBlue]}>
              <Icon name={showNameStep ? 'account-star' : 'shield-check'} size={14} color={DS.blueSoft} />
              <Text style={[s.pillTxt, { color: DS.blueSoft }]}>{showNameStep ? 'ALMOST THERE' : 'VERIFY CODE'}</Text>
            </View>
          ) : (
            <View style={s.pill}>
              <View style={s.pillDot} />
              <Text style={s.pillTxt}>LIVE ARENA ACCESS</Text>
            </View>
          )}

          <Text style={s.h1}>
            {showNameStep ? (
              <>What's your{'\n'}<Text style={s.h1Accent}>name?</Text></>
            ) : showOtpStep ? (
              <>Enter the{'\n'}<Text style={s.h1Accent}>code</Text></>
            ) : (
              <>Get into{'\n'}the <Text style={s.h1Accent}>action</Text></>
            )}
          </Text>

          <Text style={s.sub}>
            {showNameStep ? (
              "This is how you'll show up on leaderboards and in your circle."
            ) : showOtpStep ? (
              `We sent a 4-digit verification code to ${countryCode} ${phoneNumber}.`
            ) : (
              "Enter your mobile number to receive a one-time code and join the arena."
            )}
          </Text>
        </View>

        {/* Form Container */}
        <View style={s.form}>
          {showNameStep ? (
            <>
              {/* Live Player Card Preview */}
              <View style={s.namePreviewBox}>
                <View style={s.avatarCircle}>
                  <Text style={s.avatarInitials}>
                    {fullName.trim()
                      ? fullName
                          .trim()
                          .split(' ')
                          .filter(Boolean)
                          .map((n) => n[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()
                      : '⚡'}
                  </Text>
                </View>
                <View style={s.namePreviewTextWrap}>
                  <Text style={s.previewTitle}>ARENA PLAYER CARD</Text>
                  <Text style={s.previewName} numberOfLines={1}>
                    {fullName.trim() || 'Your Name'}
                  </Text>
                  <Text style={s.previewTag}>Local Legends • Verified Athlete</Text>
                </View>
              </View>

              <Text style={s.label}>ENTER YOUR FULL NAME</Text>
              <View style={s.nameInputContainer}>
                <TextInput
                  style={s.nameInput}
                  placeholder="e.g. Virat Kohli"
                  placeholderTextColor={DS.textMuted}
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  autoFocus
                  editable={!loading}
                  returnKeyType="done"
                  onSubmitEditing={handleSaveName}
                />
                {fullName.length > 0 && (
                  <TouchableOpacity onPress={() => setFullName('')} style={s.clearInputBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Icon name="close-circle" size={20} color={DS.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              <GradientButton
                label="Enter the Arena"
                icon="arrow-right"
                iconRight
                onPress={handleSaveName}
                loading={loading}
                disabled={fullName.trim().length < 2}
                height={56}
                style={s.primary}
                textStyle={{ fontSize: 16 }}
              />
            </>
          ) : showOtpStep ? (
            <>
              <View style={s.labelRow}>
                <Text style={s.label}>VERIFICATION CODE</Text>
                <TouchableOpacity onPress={focusOtpInput}>
                  <Text style={s.tapKeyboardTxt}>Tap to show keyboard</Text>
                </TouchableOpacity>
              </View>

              {/* OTP Interactive Box */}
              <View style={s.otpContainer}>
                <Pressable style={s.otpRow} onPress={focusOtpInput}>
                  {[0, 1, 2, 3].map((i) => (
                    <TouchableOpacity
                      key={i}
                      activeOpacity={0.8}
                      onPress={focusOtpInput}
                      style={[
                        s.otpCell,
                        (otp.length === i || (i === 3 && otp.length === 4)) && isOtpFocused && s.otpCellActive,
                        otp[i] !== undefined && otp[i] !== '' && s.otpCellFilled
                      ]}
                    >
                      <Text style={s.otpDigit}>{otp[i] || ''}</Text>
                    </TouchableOpacity>
                  ))}
                </Pressable>

                {/* Hidden TextInput overlay covering full row */}
                <TextInput
                  ref={otpRef}
                  style={s.hiddenInputOverlay}
                  value={otp}
                  onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 4))}
                  keyboardType="number-pad"
                  maxLength={4}
                  autoFocus
                  caretHidden
                  onFocus={() => setIsOtpFocused(true)}
                  onBlur={() => setIsOtpFocused(false)}
                />
              </View>

              {/* Quick Auto-fill Chip */}
              <TouchableOpacity
                style={s.testCodeChip}
                activeOpacity={0.7}
                onPress={() => {
                  setOtp('1234');
                  focusOtpInput();
                  showToast('Filled test code 1234', 'info');
                }}
              >
                <Icon name="lightning-bolt" size={14} color={DS.lime} />
                <Text style={s.testCodeTxt}>
                  Test Code: <Text style={s.testCodeBold}>1234</Text> (Tap to auto-fill)
                </Text>
              </TouchableOpacity>

              <GradientButton
                label="Verify & Join"
                icon="arrow-right"
                iconRight
                onPress={handleVerifyOtp}
                loading={loading}
                disabled={otp.length < 4}
                height={56}
                style={s.primary}
                textStyle={{ fontSize: 16 }}
              />

              <View style={s.altRow}>
                <TouchableOpacity onPress={() => { setShowOtpStep(false); setOtp(''); }}>
                  <Text style={s.linkMuted}>← Change number</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSendOtp} disabled={loading}>
                  <Text style={s.linkAccent}>Resend code</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={s.label}>PHONE NUMBER</Text>
              <View style={s.phoneRow}>
                <TouchableOpacity
                  style={s.country}
                  onPress={() => setShowCountryPicker((v) => !v)}
                  activeOpacity={0.8}
                >
                  <Text style={s.flag}>{selectedCountry.flag}</Text>
                  <Text style={s.code}>{countryCode}</Text>
                  <Icon name={showCountryPicker ? 'chevron-up' : 'chevron-down'} size={16} color={DS.textMuted} />
                </TouchableOpacity>

                <TextInput
                  style={s.phoneInput}
                  placeholder="00000 00000"
                  placeholderTextColor={DS.textMuted}
                  value={phoneNumber}
                  onChangeText={(t) => setPhoneNumber(t.replace(/\D/g, '').slice(0, 10))}
                  keyboardType="phone-pad"
                  maxLength={10}
                  editable={!loading}
                />
              </View>

              {showCountryPicker && (
                <View style={s.dropdown}>
                  {COUNTRIES.map((c) => (
                    <TouchableOpacity
                      key={c.code}
                      style={[s.dropRow, c.code === countryCode && s.dropRowActive]}
                      onPress={() => {
                        setCountryCode(c.code);
                        setShowCountryPicker(false);
                      }}
                    >
                      <Text style={s.flag}>{c.flag}</Text>
                      <Text style={s.dropName}>{c.name}</Text>
                      <Text style={s.dropCode}>{c.code}</Text>
                      {c.code === countryCode && <Icon name="check-circle" size={16} color={DS.lime} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <GradientButton
                label="Send OTP"
                icon="lightning-bolt"
                iconRight
                onPress={handleSendOtp}
                loading={loading}
                disabled={phoneNumber.length < 10}
                height={56}
                style={s.primary}
                textStyle={{ fontSize: 16 }}
              />
            </>
          )}
        </View>

        <Text style={s.footer}>
          By continuing you agree to Local Legends'{'\n'}
          <Text style={s.footerLink}>Terms of Service</Text> & <Text style={s.footerLink}>Privacy Policy</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeS = (DS) => StyleSheet.create({
  root: { flex: 1, backgroundColor: DS.bg },
  scroll: { flexGrow: 1, paddingBottom: 32 },

  hero: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 20 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
    backgroundColor: DS.lime + '1f', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 16
  },
  pillBlue: { backgroundColor: (DS.blueSoft || '#3b82f6') + '2b' },
  pillDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: DS.lime },
  pillTxt: { fontSize: 11, fontWeight: '800', color: DS.lime, letterSpacing: 1.5 },
  h1: { fontSize: 44, fontWeight: '900', color: DS.textPrimary, lineHeight: 48, letterSpacing: -0.5 },
  h1Accent: { color: DS.blueSoft || '#3b82f6' },
  sub: { fontSize: 15, fontWeight: '600', color: DS.textVariant, lineHeight: 22, marginTop: 12 },

  form: { marginHorizontal: 16, backgroundColor: DS.surfaceLow, borderRadius: 24, padding: 20 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '800', color: DS.textSecondary, letterSpacing: 1.8 },
  tapKeyboardTxt: { fontSize: 12, fontWeight: '700', color: DS.lime },

  phoneRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  country: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: DS.surfaceHigh, borderRadius: 16, paddingHorizontal: 14, height: 58,
    borderWidth: 1.5, borderColor: DS.surfaceHighest || '#2a2f42'
  },
  flag: { fontSize: 20 },
  code: { fontSize: 16, fontWeight: '800', color: DS.textPrimary },
  phoneInput: {
    flex: 1, backgroundColor: DS.surfaceHigh, borderRadius: 16, paddingHorizontal: 16, height: 58,
    fontSize: 19, fontWeight: '800', color: DS.textPrimary, letterSpacing: 1.2,
    borderWidth: 1.5, borderColor: DS.surfaceHighest || '#2a2f42'
  },
  namePreviewBox: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: DS.surfaceHigh, borderRadius: 20, padding: 14, marginBottom: 18,
    borderWidth: 1.5, borderColor: (DS.blueSoft || '#3b82f6') + '40'
  },
  avatarCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center',
    shadowColor: DS.lime, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4
  },
  avatarInitials: { fontSize: 20, fontWeight: '900', color: DS.bg },
  namePreviewTextWrap: { flex: 1 },
  previewTitle: { fontSize: 10, fontWeight: '800', color: DS.blueSoft || '#3b82f6', letterSpacing: 1.5 },
  previewName: { fontSize: 18, fontWeight: '900', color: DS.textPrimary, marginTop: 2 },
  previewTag: { fontSize: 11, fontWeight: '600', color: DS.textMuted, marginTop: 2 },

  nameInputContainer: { position: 'relative', justifyContent: 'center', marginTop: 10, marginBottom: 16 },
  nameInput: {
    backgroundColor: DS.surfaceHigh, borderRadius: 16, paddingLeft: 16, paddingRight: 44, height: 58,
    fontSize: 19, fontWeight: '800', color: DS.textPrimary,
    borderWidth: 1.5, borderColor: DS.surfaceHighest || '#2a2f42'
  },
  clearInputBtn: { position: 'absolute', right: 14 },

  dropdown: { backgroundColor: DS.surfaceHigh, borderRadius: 16, marginTop: 12, overflow: 'hidden' },
  dropRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  dropRowActive: { backgroundColor: (DS.blueDeep || '#1e3a8a') + '22' },
  dropName: { flex: 1, fontSize: 15, color: DS.textPrimary, fontWeight: '600' },
  dropCode: { fontSize: 14, color: DS.textMuted, fontWeight: '600' },

  otpContainer: { position: 'relative', marginVertical: 8, height: 68 },
  otpRow: { flexDirection: 'row', gap: 12, flex: 1 },
  otpCell: {
    flex: 1, height: 66, borderRadius: 16, backgroundColor: DS.surfaceHigh,
    borderWidth: 2, borderColor: DS.surfaceHighest || '#2a2f42',
    alignItems: 'center', justifyContent: 'center'
  },
  otpCellActive: { borderColor: DS.lime, backgroundColor: DS.lime + '0a' },
  otpCellFilled: { borderColor: DS.blueSoft || '#3b82f6', backgroundColor: (DS.blueSoft || '#3b82f6') + '0a' },
  otpDigit: { fontSize: 28, fontWeight: '900', color: DS.textPrimary },
  hiddenInputOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0.01, zIndex: 10
  },

  testCodeChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: DS.lime + '14', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14,
    marginTop: 12, alignSelf: 'center'
  },
  testCodeTxt: { fontSize: 12, fontWeight: '600', color: DS.textSecondary },
  testCodeBold: { color: DS.lime, fontWeight: '800' },

  primary: { borderRadius: 16, marginTop: 18 },

  altRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  linkMuted: { fontSize: 14, color: DS.textVariant, fontWeight: '700', paddingVertical: 6 },
  linkAccent: { fontSize: 14, color: DS.blueSoft || '#3b82f6', fontWeight: '800', paddingVertical: 6 },

  footer: { fontSize: 12, color: DS.textSecondary, textAlign: 'center', marginTop: 24, paddingHorizontal: 24, lineHeight: 18 },
  footerLink: { color: DS.textVariant, fontWeight: '800' }
});

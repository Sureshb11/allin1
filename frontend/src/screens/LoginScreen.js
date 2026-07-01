// LoginScreen — "Stadium Under Lights" redesign (Kinetic Athlete).
// Deep-night surfaces with an electric-blue glow; the blue gradient is the
// primary action identity, lime is reserved for the LIVE signal, and sections
// are separated by surface-tier stepping instead of hard borders.
import { useTheme, useThemedStyles } from "../theme/ThemeContext";import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Pressable,
  KeyboardAvoidingView, Platform,
  StatusBar, ScrollView } from
'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import legendsApi from '../services/LegendsApi';
import { showToast } from '../components/Toast';
import GradientButton from '../components/GradientButton';

const COUNTRIES = [
{ code: '+91', name: 'India', flag: '🇮🇳' },
{ code: '+1', name: 'USA', flag: '🇺🇸' },
{ code: '+44', name: 'UK', flag: '🇬🇧' },
{ code: '+61', name: 'AUS', flag: '🇦🇺' },
{ code: '+965', name: 'Kuwait', flag: '🇰🇼' }];

// Electric-blue wash anchored to the top — the "stadium floodlight" feel.
// Kept subtle (dimmer in light mode) so it never washes out text in sunlight.
function TopGlow({ color, dim }) {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height={380}>
      <Defs>
        <RadialGradient id="lg" cx="30%" cy="0%" r="80%">
          <Stop offset="0" stopColor={color} stopOpacity={dim ? 0.12 : 0.28} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="380" fill="url(#lg)" />
    </Svg>
  );
}

export default function LoginScreen({ navigation }) {const { colors: DS, isDark } = useTheme();const s = useThemedStyles(makeS);
  const [countryCode, setCountryCode] = useState('+91');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [showOtpStep, setShowOtpStep] = useState(false);
  const [showNameStep, setShowNameStep] = useState(false);
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const otpRef = useRef(null);

  const selectedCountry = COUNTRIES.find((c) => c.code === countryCode) || COUNTRIES[0];

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
        // Registered number → straight in. Brand-new number → ask their name first.
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
      <TopGlow color={DS.blueDeep} dim={!isDark} />

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Brand */}
        <View style={s.brand}>
          <View style={s.logoBox}><Icon name="star-four-points" size={16} color={DS.onBlue} /></View>
          <Text style={s.brandLocal}>LOCAL</Text>
          <View style={s.brandBadge}><Text style={s.brandBadgeTxt}>LEGENDS</Text></View>
        </View>

        {/* Hero */}
        <View style={s.hero}>
          {showNameStep || showOtpStep ?
          <View style={[s.pill, s.pillBlue]}>
              <Icon name={showNameStep ? 'account-star' : 'shield-check'} size={12} color={DS.blueSoft} />
              <Text style={[s.pillTxt, { color: DS.blueSoft }]}>{showNameStep ? 'ALMOST THERE' : 'VERIFY'}</Text>
            </View> :
          <View style={s.pill}>
              <View style={s.pillDot} />
              <Text style={s.pillTxt}>LIVE UPDATES</Text>
            </View>
          }
          <Text style={s.h1}>
            {showNameStep ?
            <>What's your{'\n'}<Text style={s.h1Accent}>name?</Text></> :
            showOtpStep ?
            <>Enter the{'\n'}<Text style={s.h1Accent}>code</Text></> :
            <>Get into{'\n'}the <Text style={s.h1Accent}>action</Text></>}
          </Text>
          <Text style={s.sub}>
            {showNameStep ?
            'This is how you\'ll show up on leaderboards and in your circle.' :
            showOtpStep ?
            `We sent a 4-digit code to ${countryCode} ${phoneNumber}.` :
            'Enter your mobile number to get a one-time code and join the arena.'}
          </Text>
        </View>

        {/* Form — surface-tier card, no hard border */}
        <View style={s.form}>
          {showNameStep ?
          <>
              <Text style={s.label}>YOUR NAME</Text>
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
              onSubmitEditing={handleSaveName} />

              <GradientButton
              label="Enter the Arena"
              icon="arrow-right"
              iconRight
              onPress={handleSaveName}
              loading={loading}
              disabled={fullName.trim().length < 2}
              height={56}
              style={s.primary}
              textStyle={{ fontSize: 16 }} />
            </> :

          showOtpStep ?
          <>
              <Text style={s.label}>VERIFICATION CODE</Text>
              <Pressable style={s.otpRow} onPress={() => otpRef.current?.focus()}>
                {[0, 1, 2, 3].map((i) =>
              <View key={i} style={[s.otpCell, otp.length === i && s.otpCellActive, otp[i] && s.otpCellFilled]}>
                    <Text style={s.otpDigit}>{otp[i] || ''}</Text>
                  </View>
              )}
              </Pressable>
              <TextInput
              ref={otpRef}
              style={s.hiddenInput}
              value={otp}
              onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
              autoFocus
              caretHidden />


              <GradientButton
              label="Verify & Join"
              icon="arrow-right"
              iconRight
              onPress={handleVerifyOtp}
              loading={loading}
              disabled={otp.length < 4}
              height={56}
              style={s.primary}
              textStyle={{ fontSize: 16 }} />

              <View style={s.altRow}>
                <TouchableOpacity onPress={() => {setShowOtpStep(false);setOtp('');}}>
                  <Text style={s.linkMuted}>Change number</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSendOtp} disabled={loading}>
                  <Text style={s.linkAccent}>Resend code</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.hint}>Test code: 1234</Text>
            </> :

          <>
              <Text style={s.label}>PHONE NUMBER</Text>
              <View style={s.phoneRow}>
                <TouchableOpacity style={s.country} onPress={() => setShowCountryPicker((v) => !v)} activeOpacity={0.8}>
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
                editable={!loading} />

              </View>

              {showCountryPicker &&
            <View style={s.dropdown}>
                  {COUNTRIES.map((c) =>
              <TouchableOpacity
                key={c.code}
                style={[s.dropRow, c.code === countryCode && s.dropRowActive]}
                onPress={() => {setCountryCode(c.code);setShowCountryPicker(false);}}>

                      <Text style={s.flag}>{c.flag}</Text>
                      <Text style={s.dropName}>{c.name}</Text>
                      <Text style={s.dropCode}>{c.code}</Text>
                      {c.code === countryCode && <Icon name="check-circle" size={16} color={DS.blueSoft} />}
                    </TouchableOpacity>
              )}
                </View>
            }

              <GradientButton
              label="Send OTP"
              icon="lightning-bolt"
              iconRight
              onPress={handleSendOtp}
              loading={loading}
              disabled={phoneNumber.length < 10}
              height={56}
              style={s.primary}
              textStyle={{ fontSize: 16 }} />

              <View style={s.divider}>
                <View style={s.divLine} /><Text style={s.divTxt}>OR</Text><View style={s.divLine} />
              </View>

              <TouchableOpacity style={s.secondary} onPress={() => navigation.navigate('SignUp')} activeOpacity={0.9}>
                <Icon name="account-plus-outline" size={18} color={DS.blueSoft} />
                <Text style={s.secondaryTxt}>Create New Account</Text>
              </TouchableOpacity>
            </>
          }
        </View>

        <Text style={s.footer}>
          By continuing you agree to Local Legends'{'\n'}
          <Text style={s.footerLink}>Terms of Service</Text> & <Text style={s.footerLink}>Privacy Policy</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>);

}

const makeS = (DS) => StyleSheet.create({
  root: { flex: 1, backgroundColor: DS.bg },
  scroll: { flexGrow: 1, paddingBottom: 32 },

  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingTop: 56, paddingBottom: 8 },
  logoBox: { width: 30, height: 30, borderRadius: 9, backgroundColor: DS.blueDeep, alignItems: 'center', justifyContent: 'center' },
  brandLocal: { fontSize: 16, fontWeight: '900', color: DS.textPrimary, letterSpacing: 2 },
  brandBadge: { backgroundColor: DS.lime, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  brandBadgeTxt: { fontSize: 12, fontWeight: '900', color: DS.bg, letterSpacing: 1.5 },

  hero: { paddingHorizontal: 24, paddingTop: 30, paddingBottom: 26 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', backgroundColor: DS.lime + '1f', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 18 },
  pillBlue: { backgroundColor: DS.blueDeep + '2b' },
  pillDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: DS.lime },
  pillTxt: { fontSize: 11, fontWeight: '800', color: DS.lime, letterSpacing: 1.5 },
  h1: { fontSize: 46, fontWeight: '900', color: DS.textPrimary, lineHeight: 50, letterSpacing: -0.5 },
  h1Accent: { color: DS.blueSoft },
  sub: { fontSize: 16, fontWeight: '600', color: DS.textVariant, lineHeight: 23, marginTop: 14 },

  // Section layer card — depth by tier stepping, no outline (the "No-Line" rule).
  form: { marginHorizontal: 16, backgroundColor: DS.surfaceLow, borderRadius: 24, padding: 22 },
  label: { fontSize: 12, fontWeight: '800', color: DS.textSecondary, letterSpacing: 1.8, marginBottom: 12 },

  phoneRow: { flexDirection: 'row', gap: 10 },
  country: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: DS.surfaceHigh, borderRadius: 16, paddingHorizontal: 14, height: 60, borderBottomWidth: 2.5, borderBottomColor: DS.textMuted },
  flag: { fontSize: 20 },
  code: { fontSize: 16, fontWeight: '800', color: DS.textPrimary },
  phoneInput: { flex: 1, backgroundColor: DS.surfaceHigh, borderRadius: 16, paddingHorizontal: 16, height: 60, fontSize: 20, fontWeight: '800', color: DS.textPrimary, letterSpacing: 1.2, borderBottomWidth: 2.5, borderBottomColor: DS.textMuted },
  nameInput: { backgroundColor: DS.surfaceHigh, borderRadius: 16, paddingHorizontal: 16, height: 60, fontSize: 20, fontWeight: '800', color: DS.textPrimary, marginBottom: 16, borderBottomWidth: 2.5, borderBottomColor: DS.textMuted },

  dropdown: { backgroundColor: DS.surfaceHigh, borderRadius: 16, marginTop: 12, overflow: 'hidden' },
  dropRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  dropRowActive: { backgroundColor: DS.blueDeep + '22' },
  dropName: { flex: 1, fontSize: 15, color: DS.textPrimary, fontWeight: '600' },
  dropCode: { fontSize: 14, color: DS.textMuted, fontWeight: '600' },

  otpRow: { flexDirection: 'row', gap: 12 },
  otpCell: { flex: 1, height: 66, borderRadius: 16, backgroundColor: DS.surfaceHigh, borderBottomWidth: 3, borderBottomColor: DS.textMuted, alignItems: 'center', justifyContent: 'center' },
  otpCellActive: { borderBottomColor: DS.lime },          // "Active System" — lime focus per the design doc
  otpCellFilled: { borderBottomColor: DS.blueSoft },
  otpDigit: { fontSize: 30, fontWeight: '900', color: DS.textPrimary },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },

  primary: { borderRadius: 16, marginTop: 22 },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 },
  divLine: { flex: 1, height: 1, backgroundColor: DS.line },
  divTxt: { fontSize: 11, color: DS.textMuted, fontWeight: '800', letterSpacing: 1 },

  // Secondary action — component-layer fill, on-surface blue text. No outline.
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: DS.surfaceHigh, borderRadius: 16, height: 54 },
  secondaryTxt: { fontSize: 15, fontWeight: '800', color: DS.blueSoft },

  altRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  linkMuted: { fontSize: 15, color: DS.textVariant, fontWeight: '700', paddingVertical: 8 },
  linkAccent: { fontSize: 15, color: DS.blueSoft, fontWeight: '800', paddingVertical: 8 },
  hint: { fontSize: 13, color: DS.textSecondary, textAlign: 'center', marginTop: 10 },

  footer: { fontSize: 12, color: DS.textSecondary, textAlign: 'center', marginTop: 26, paddingHorizontal: 24, lineHeight: 19 },
  footerLink: { color: DS.textVariant, fontWeight: '800' }
});

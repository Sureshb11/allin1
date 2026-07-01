import { useTheme, useThemedStyles } from "../theme/ThemeContext";import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Pressable,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  StatusBar, ScrollView } from
'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { showToast } from '../components/Toast';
import GradientButton from '../components/GradientButton';














const COUNTRIES = [
{ code: '+91', name: 'India', flag: '🇮🇳' },
{ code: '+1', name: 'USA', flag: '🇺🇸' },
{ code: '+44', name: 'UK', flag: '🇬🇧' },
{ code: '+61', name: 'AUS', flag: '🇦🇺' },
{ code: '+965', name: 'Kuwait', flag: '🇰🇼' }];


export default function LoginScreen({ navigation }) {const DS = useTheme().colors;const s = useThemedStyles(makeS);
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
      <StatusBar barStyle="light-content" backgroundColor={DS.bg} />

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Brand */}
        <View style={s.brand}>
          <View style={s.logoBox}><Icon name="star-four-points" size={16} color={DS.bg} /></View>
          <Text style={s.brandLocal}>LOCAL</Text>
          <View style={s.brandBadge}><Text style={s.brandBadgeTxt}>LEGENDS</Text></View>
        </View>

        {/* Hero */}
        <View style={s.hero}>
          <View style={s.pill}>
            <View style={s.pillDot} />
            <Text style={s.pillTxt}>{showNameStep ? 'ALMOST THERE' : showOtpStep ? 'VERIFY' : 'LIVE UPDATES'}</Text>
          </View>
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

        {/* Form */}
        <View style={s.form}>
          {showNameStep ?
          <>
              <Text style={s.label}>YOUR NAME</Text>
              <TextInput
              style={s.nameInput}
              placeholder="e.g. Virat Kohli"
              placeholderTextColor={DS.muted}
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
                  <Text style={s.linkLime}>Resend code</Text>
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
                  <Icon name={showCountryPicker ? 'chevron-up' : 'chevron-down'} size={16} color={DS.muted} />
                </TouchableOpacity>
                <TextInput
                style={s.phoneInput}
                placeholder="00000 00000"
                placeholderTextColor={DS.muted}
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
                      {c.code === countryCode && <Icon name="check-circle" size={16} color={DS.lime} />}
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
                <Icon name="account-plus-outline" size={18} color={DS.lime} />
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
  logoBox: { width: 30, height: 30, borderRadius: 9, backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center' },
  brandLocal: { fontSize: 16, fontWeight: '900', color: DS.ink, letterSpacing: 2 },
  brandBadge: { backgroundColor: DS.lime, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  brandBadgeTxt: { fontSize: 12, fontWeight: '900', color: DS.bg, letterSpacing: 1.5 },

  hero: { paddingHorizontal: 24, paddingTop: 30, paddingBottom: 26 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', backgroundColor: 'rgba(171,214,0,0.12)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 18 },
  pillDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: DS.lime },
  pillTxt: { fontSize: 11, fontWeight: '800', color: DS.lime, letterSpacing: 1.5 },
  h1: { fontSize: 44, fontWeight: '900', color: DS.ink, lineHeight: 48, letterSpacing: -0.5 },
  h1Accent: { color: DS.lime },
  sub: { fontSize: 15, color: DS.sub, lineHeight: 22, marginTop: 14 },

  form: { marginHorizontal: 16, backgroundColor: DS.surface, borderRadius: 24, padding: 22, borderWidth: 1, borderColor: DS.border },
  label: { fontSize: 11, fontWeight: '800', color: DS.muted, letterSpacing: 1.8, marginBottom: 12 },

  phoneRow: { flexDirection: 'row', gap: 10 },
  country: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: DS.field, borderRadius: 16, borderWidth: 1, borderColor: DS.border, paddingHorizontal: 14, height: 58 },
  flag: { fontSize: 20 },
  code: { fontSize: 15, fontWeight: '800', color: DS.ink },
  phoneInput: { flex: 1, backgroundColor: DS.field, borderRadius: 16, borderWidth: 1, borderColor: DS.border, paddingHorizontal: 16, height: 58, fontSize: 18, fontWeight: '700', color: DS.ink, letterSpacing: 1 },
  nameInput: { backgroundColor: DS.field, borderRadius: 16, borderWidth: 1, borderColor: DS.border, paddingHorizontal: 16, height: 58, fontSize: 18, fontWeight: '700', color: DS.ink, marginBottom: 16 },

  dropdown: { backgroundColor: DS.field, borderRadius: 16, borderWidth: 1, borderColor: DS.border, marginTop: 12, overflow: 'hidden' },
  dropRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: DS.border },
  dropRowActive: { backgroundColor: 'rgba(171,214,0,0.08)' },
  dropName: { flex: 1, fontSize: 15, color: DS.ink, fontWeight: '600' },
  dropCode: { fontSize: 14, color: DS.muted, fontWeight: '600' },

  otpRow: { flexDirection: 'row', gap: 12 },
  otpCell: { flex: 1, height: 64, borderRadius: 16, backgroundColor: DS.field, borderWidth: 1.5, borderColor: DS.border, alignItems: 'center', justifyContent: 'center' },
  otpCellActive: { borderColor: DS.lime },
  otpCellFilled: { borderColor: DS.borderF },
  otpDigit: { fontSize: 28, fontWeight: '900', color: DS.ink },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },

  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: DS.lime, borderRadius: 16, height: 56, marginTop: 22 },
  primaryOff: { opacity: 0.4 },
  primaryTxt: { fontSize: 16, fontWeight: '900', color: DS.bg, letterSpacing: 0.3 },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 },
  divLine: { flex: 1, height: 1, backgroundColor: DS.border },
  divTxt: { fontSize: 11, color: DS.muted, fontWeight: '800', letterSpacing: 1 },

  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: DS.lime, borderRadius: 16, height: 54 },
  secondaryTxt: { fontSize: 15, fontWeight: '800', color: DS.lime },

  altRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  linkMuted: { fontSize: 14, color: DS.sub, fontWeight: '700' },
  linkLime: { fontSize: 14, color: DS.lime, fontWeight: '800' },
  hint: { fontSize: 12, color: DS.muted, textAlign: 'center', marginTop: 14 },

  footer: { fontSize: 11, color: DS.muted, textAlign: 'center', marginTop: 26, paddingHorizontal: 24, lineHeight: 18 },
  footerLink: { color: DS.sub, fontWeight: '700' }
});
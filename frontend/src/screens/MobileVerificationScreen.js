import { useTheme, useThemedStyles } from "../theme/ThemeContext";import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  ActivityIndicator } from
'react-native';
import legendsApi from '../services/LegendsApi';
import { registerForPush } from '../services/push';
import BrandLogo from "../components/BrandLogo";














const MobileVerificationScreen = ({ route, navigation }) => {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const [otp, setOtp] = useState(['', '', '', '']);
  const [timer, setTimer] = useState(120); // 2 minutes
  const [canResend, setCanResend] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRefs = useRef([]);

  const { phoneNumber, countryCode, newUser = false } = route.params || {};

  useEffect(() => {
    const countdown = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          setCanResend(true);
          clearInterval(countdown);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdown);
  }, []);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.
    toString().
    padStart(2, '0')}`;
  };

  const handleOtpChange = (value, index) => {
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-advance to next input
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
      setActiveIndex(index + 1);
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      setActiveIndex(index - 1);
    }
  };

  const getOtpString = () => otp.join('');

  const handleVerifyOtp = async () => {
    const otpString = getOtpString();
    if (otpString.length < 4) {
      Alert.alert('Error', 'Please enter the complete verification code');
      return;
    }

    if (!phoneNumber) {
      Alert.alert('Error', 'Missing phone number. Please start over.');
      return;
    }
    setLoading(true);
    try {
      const cleaned = String(phoneNumber).replace(/\s/g, '');
      const res = await legendsApi.verifyOtp(cleaned, otpString, countryCode);
      if (res.success) {
        // Fresh sign-in: ask for notification permission and register this
        // device for match/award pushes. Fire-and-forget — never blocks entry.
        registerForPush();
        navigation.replace('SportPicker');
      } else {
        Alert.alert('Invalid OTP', res.error || 'Please check and enter the correct verification code');
      }
    } catch {
      Alert.alert('Error', 'Server unreachable. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!canResend) return;

    setLoading(true);
    setCanResend(false);
    setTimer(120);

    // Restart timer
    const countdown = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          setCanResend(true);
          clearInterval(countdown);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const cleaned = String(phoneNumber || '').replace(/\s/g, '');
    const res = await legendsApi.sendOtp(cleaned, countryCode);
    setLoading(false);
    Alert.alert(res.success ? 'OTP Resent' : 'Error',
      res.success ? 'A new verification code has been sent to your phone' : (res.error || 'Could not resend the code'));
  };

  const handleCallVerification = () => {
    Alert.alert(
      'Call Verification',
      'You will receive a call with your verification code within 2 minutes.',
      [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Request Call',
        onPress: () => {
          Alert.alert(
            'Call Requested',
            'You will receive a verification call shortly'
          );
        }
      }]

    );
  };

  const displayPhone = phoneNumber ?
  `${countryCode || ''} ${phoneNumber}` :
  '+1 234 567 890';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled">
      {/* Header with back arrow and brand */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>{'\u2190'}</Text>
        </TouchableOpacity>
        <View style={styles.brandRow}>
          <View style={styles.starBadge}>
            <Text style={styles.starIcon}>{'\u2605'}</Text>
          </View>
          <BrandLogo scale={0.75} />
        </View>
      </View>

      {/* Main content */}
      <View style={styles.mainContent}>
        <Text style={styles.title}>Verify Your Number</Text>
        <Text style={styles.subtitle}>
          Enter the 4-digit code sent to{'\n'}
          <Text style={styles.phoneHighlight}>{displayPhone}</Text>
        </Text>

        {/* OTP boxes */}
        <View style={styles.otpRow}>
          {otp.map((digit, index) =>
          <TextInput
            key={index}
            ref={(ref) => inputRefs.current[index] = ref}
            style={[
            styles.otpBox,
            activeIndex === index && styles.otpBoxActive,
            digit !== '' && styles.otpBoxFilled]
            }
            value={digit}
            onChangeText={(value) => handleOtpChange(value, index)}
            onKeyPress={(e) => handleKeyPress(e, index)}
            onFocus={() => setActiveIndex(index)}
            keyboardType="numeric"
            maxLength={1}
            textAlign="center"
            selectionColor={DS.lime} />

          )}
        </View>

        {/* Timer */}
        {timer > 0 &&
        <Text style={styles.timerText}>
            Resend code in{' '}
            <Text style={styles.timerHighlight}>{formatTime(timer)}</Text>
          </Text>
        }

        {/* Verify button */}
        <TouchableOpacity
          style={[styles.verifyButton, loading && styles.verifyButtonDisabled]}
          onPress={handleVerifyOtp}
          disabled={loading}
          activeOpacity={0.8}>
          {loading ?
          <ActivityIndicator color={DS.white} size="small" /> :

          <Text style={styles.verifyButtonText}>VERIFY</Text>
          }
        </TouchableOpacity>

        {/* Resend section */}
        <View style={styles.resendSection}>
          <Text style={styles.didntReceiveText}>
            Didn't receive the code?
          </Text>
          <TouchableOpacity
            onPress={handleResendOtp}
            disabled={!canResend || loading}>
            <Text
              style={[
              styles.resendCodeText,
              (!canResend || loading) && styles.resendCodeDisabled]
              }>
              RESEND CODE
            </Text>
          </TouchableOpacity>
        </View>

        {/* Alternative options */}
        <View style={styles.alternativeOptions}>
          <TouchableOpacity onPress={handleCallVerification}>
            <Text style={styles.callText}>Get verification call instead</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.changeNumberText}>
              Wrong number? Change it
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>);

};

const makeStyles = (DS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DS.bg
  },
  contentContainer: {
    flexGrow: 1,
    paddingBottom: 40
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 12
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: DS.surfaceLow,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14
  },
  backArrow: {
    color: DS.textPrimary,
    fontSize: 20,
    fontWeight: '600'
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  starBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: DS.lime,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8
  },
  starIcon: {
    color: DS.bg,
    fontSize: 14,
    fontWeight: '700'
  },
  brandText: {
    color: DS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2
  },
  mainContent: {
    paddingHorizontal: 28,
    paddingTop: 40,
    alignItems: 'center'
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: DS.textPrimary,
    marginBottom: 12,
    textAlign: 'center'
  },
  subtitle: {
    fontSize: 15,
    color: DS.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40
  },
  phoneHighlight: {
    color: DS.textVariant,
    fontWeight: '600'
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    marginBottom: 28
  },
  otpBox: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: DS.surfaceLow,
    borderWidth: 1.5,
    borderColor: DS.surfaceHighest,
    borderStyle: 'dashed',
    fontSize: 24,
    fontWeight: '700',
    color: DS.textPrimary,
    textAlign: 'center'
  },
  otpBoxActive: {
    borderColor: DS.lime,
    borderStyle: 'solid',
    borderWidth: 2
  },
  otpBoxFilled: {
    borderStyle: 'solid',
    borderColor: DS.surfaceHighest
  },
  timerText: {
    fontSize: 14,
    color: DS.textMuted,
    marginBottom: 32
  },
  timerHighlight: {
    color: DS.textVariant,
    fontWeight: '600'
  },
  verifyButton: {
    width: '100%',
    height: 54,
    borderRadius: 14,
    backgroundColor: DS.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32
  },
  verifyButtonDisabled: {
    opacity: 0.5
  },
  verifyButtonText: {
    color: DS.white,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2
  },
  resendSection: {
    alignItems: 'center',
    marginBottom: 32
  },
  didntReceiveText: {
    fontSize: 14,
    color: DS.textMuted,
    marginBottom: 8
  },
  resendCodeText: {
    fontSize: 14,
    fontWeight: '700',
    color: DS.lime,
    letterSpacing: 2
  },
  resendCodeDisabled: {
    opacity: 0.4
  },
  alternativeOptions: {
    alignItems: 'center',
    gap: 16
  },
  callText: {
    fontSize: 14,
    color: DS.textMuted
  },
  changeNumberText: {
    fontSize: 14,
    color: DS.blue,
    fontWeight: '600'
  }
});

export default MobileVerificationScreen;
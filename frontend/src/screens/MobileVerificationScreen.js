import { useTheme, useThemedStyles } from "../theme/ThemeContext";
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  ActivityIndicator,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Animated
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';
import { registerForPush } from '../services/push';
import { haptic } from '../utils/haptics';
import BrandLogo from '../components/BrandLogo';
import ThemeToggleButton from '../components/ThemeToggleButton';

const MobileVerificationScreen = ({ route, navigation }) => {
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const [otp, setOtp] = useState(['', '', '', '']);
  const [timer, setTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successAnim, setSuccessAnim] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const checkScale = useRef(new Animated.Value(0)).current;

  const inputRefs = useRef([]);
  const { phoneNumber, countryCode } = route.params || {};

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

  const focusInput = (index) => {
    const idx = index !== undefined ? index : activeIndex;
    const target = inputRefs.current[idx] || inputRefs.current[0];
    if (target) {
      target.blur();
      setTimeout(() => target.focus(), 50);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleOtpChange = (value, index) => {
    const cleanValue = value.replace(/\D/g, '');
    const newOtp = [...otp];
    newOtp[index] = cleanValue;
    setOtp(newOtp);

    // Auto-advance to next input box
    if (cleanValue && index < 3) {
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
    haptic.tick();
    const otpString = getOtpString();
    if (otpString.length < 4) {
      Alert.alert('Error', 'Please enter the complete 4-digit verification code');
      return;
    }

    if (!phoneNumber) {
      Alert.alert('Error', 'Missing phone number. Please go back and try again.');
      return;
    }
    setLoading(true);
    try {
      const cleaned = String(phoneNumber).replace(/\s/g, '');
      const res = await legendsApi.verifyOtp(cleaned, otpString, countryCode);
      if (res.success) {
        haptic.success();
        setSuccessAnim(true);
        Animated.spring(checkScale, { toValue: 1, friction: 5, tension: 100, useNativeDriver: true }).start();
        setTimeout(() => {
          registerForPush();
          navigation.replace('SportPicker');
        }, 1200);
      } else {
        Alert.alert('Invalid OTP', res.error || 'Please check and enter the correct verification code');
      }
    } catch {
      Alert.alert('Error', 'Server unreachable. Check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!canResend) return;

    setLoading(true);
    setCanResend(false);
    setTimer(120);

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
    Alert.alert(
      res.success ? 'OTP Resent' : 'Error',
      res.success ? 'A new verification code has been sent to your phone' : (res.error || 'Could not resend the code')
    );
  };

  const displayPhone = phoneNumber ? `${countryCode || ''} ${phoneNumber}` : '+91 98765 43210';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Top Bar - Glassmorphism style */}
      <View style={[styles.topBar, { justifyContent: 'space-between', backgroundColor: DS.bg + 'E6' }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Icon name="arrow-left" size={20} color={DS.textPrimary} />
        </TouchableOpacity>
        <BrandLogo scale={0.8} />
        <ThemeToggleButton />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

      {/* Main Content Card */}
      <View style={styles.mainContent}>
        <View style={styles.pillBadge}>
          <Icon name="shield-check" size={14} color={DS.lime} />
          <Text style={styles.pillBadgeTxt}>SECURITY VERIFICATION</Text>
        </View>

        <Text style={styles.title}>Verify Your Number</Text>
        <Text style={styles.subtitle}>
          Enter the 4-digit code sent to{'\n'}
          <Text style={styles.phoneHighlight}>{displayPhone}</Text>
        </Text>

        {/* OTP Boxes Container */}
        <Pressable
          style={styles.otpRowContainer}
          onPress={() => focusInput(activeIndex)}
        >
          <View style={styles.otpRow}>
            {otp.map((digit, index) => (
              <TouchableOpacity
                key={index}
                activeOpacity={0.9}
                onPress={() => focusInput(index)}
                style={{ flex: 1 }}
              >
                <TextInput
                  ref={(ref) => inputRefs.current[index] = ref}
                  style={[
                    styles.otpBox,
                    activeIndex === index && styles.otpBoxActive,
                    digit !== '' && styles.otpBoxFilled
                  ]}
                  value={digit}
                  onChangeText={(value) => handleOtpChange(value, index)}
                  onKeyPress={(e) => handleKeyPress(e, index)}
                  onFocus={() => setActiveIndex(index)}
                  keyboardType="numeric"
                  maxLength={1}
                  textAlign="center"
                  selectionColor={DS.lime}
                />
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>

        {/* Auto-fill Test Code Chip */}
        <TouchableOpacity
          style={styles.testCodeChip}
          activeOpacity={0.7}
          onPress={() => {
            setOtp(['1', '2', '3', '4']);
            focusInput(3);
          }}
        >
          <Icon name="lightning-bolt" size={14} color={DS.lime} />
          <Text style={styles.testCodeTxt}>
            Test Code: <Text style={styles.testCodeBold}>1234</Text> (Tap to fill)
          </Text>
        </TouchableOpacity>

        {/* Timer */}
        {timer > 0 ? (
          <Text style={styles.timerText}>
            Resend code in <Text style={styles.timerHighlight}>{formatTime(timer)}</Text>
          </Text>
        ) : null}

        {/* Verify Button */}
        {/* Resend Section */}
        <View style={styles.resendSection}>
          <Text style={styles.didntReceiveText}>Didn't receive the code?</Text>
          <TouchableOpacity onPress={handleResendOtp} disabled={!canResend || loading}>
            <Text style={[styles.resendCodeText, (!canResend || loading) && styles.resendCodeDisabled]}>
              RESEND CODE
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 12 }}>
          <Text style={styles.changeNumberText}>Wrong number? Change it</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>

    <View style={{ paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 30 : 20, paddingTop: 10, backgroundColor: DS.bg }}>
      <TouchableOpacity
        style={[styles.verifyButton, loading && styles.verifyButtonDisabled]}
        onPress={handleVerifyOtp}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color={DS.bg} size="small" />
        ) : successAnim ? (
          <Animated.View style={{ transform: [{ scale: checkScale }] }}>
            <Icon name="check-circle" size={32} color={DS.bg} />
          </Animated.View>
        ) : (
          <View style={styles.btnRow}>
            <Text style={styles.verifyButtonText}>VERIFY & JOIN</Text>
            <Icon name="arrow-right" size={18} color={DS.onLime || '#ffffff'} />
          </View>
        )}
      </TouchableOpacity>
    </View>

    </KeyboardAvoidingView>
  );
};

const makeStyles = (DS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DS.bg,
  },
  contentContainer: {
    flexGrow: 1,
    paddingTop: 100, // accommodate absolute header
    paddingBottom: 40,
  },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 54 : 34,
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: DS.surfaceLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainContent: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 20,
    paddingVertical: 28,
    backgroundColor: DS.surfaceLow,
    borderRadius: 24,
    alignItems: 'center',
  },
  pillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: DS.lime + '18',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 16,
  },
  pillBadgeTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: DS.lime,
    letterSpacing: 1.5,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: DS.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: DS.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 28,
  },
  phoneHighlight: {
    color: DS.textVariant,
    fontWeight: '700',
  },
  otpRowContainer: {
    width: '100%',
    marginVertical: 6,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
  },
  otpBox: {
    height: 64,
    borderRadius: 16,
    backgroundColor: DS.surfaceHigh,
    borderWidth: 2,
    borderColor: DS.surfaceHighest || '#2a2f42',
    fontSize: 26,
    fontWeight: '900',
    color: DS.textPrimary,
    textAlign: 'center',
  },
  otpBoxActive: {
    borderColor: DS.lime,
    backgroundColor: DS.lime + '0a',
  },
  otpBoxFilled: {
    borderColor: DS.blueSoft || '#3b82f6',
    backgroundColor: (DS.blueSoft || '#3b82f6') + '0a',
  },
  testCodeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: DS.lime + '14',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginTop: 16,
    marginBottom: 16,
  },
  testCodeTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: DS.textSecondary,
  },
  testCodeBold: {
    color: DS.lime,
    fontWeight: '800',
  },
  timerText: {
    fontSize: 13,
    color: DS.textMuted,
    marginBottom: 24,
  },
  timerHighlight: {
    color: DS.lime,
    fontWeight: '700',
  },
  verifyButton: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    backgroundColor: DS.lime,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: DS.lime,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  verifyButtonDisabled: {
    opacity: 0.5,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 2,
    elevation: 2,
  },
  verifyButtonText: {
    color: DS.onLime || '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  resendSection: {
    alignItems: 'center',
    marginBottom: 12,
  },
  didntReceiveText: {
    fontSize: 13,
    color: DS.textMuted,
    marginBottom: 6,
  },
  resendCodeText: {
    fontSize: 13,
    fontWeight: '800',
    color: DS.blueSoft || '#3b82f6',
    letterSpacing: 1.5,
  },
  resendCodeDisabled: {
    opacity: 0.4,
  },
  changeNumberText: {
    fontSize: 14,
    color: DS.textSecondary,
    fontWeight: '600',
  },
});

export default MobileVerificationScreen;
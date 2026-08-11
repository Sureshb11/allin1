import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, StatusBar, Image, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { launchImageLibrary } from 'react-native-image-picker';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { haptic } from '../utils/haptics';
import GradientButton from '../components/GradientButton';
import { showToast } from '../components/Toast';
import legendsApi from '../services/LegendsApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator } from 'react-native';

export default function HistoricalStatsUploadScreen({ navigation, route }) {
  const { colors: DS, isDark } = useTheme();
  const s = useThemedStyles(makeStyles);
  const sport = route.params?.sport;
  
  const [imageUris, setImageUris] = useState([]);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const pickImage = async () => {
    haptic.tick();
    const result = await launchImageLibrary({ 
      mediaType: 'photo', 
      quality: 0.8,
      includeBase64: true,
      selectionLimit: 3 - imageUris.length, // Allow up to 3 total
    });
    
    if (result.assets && result.assets.length > 0) {
      const newImages = result.assets.map(a => ({
        uri: a.uri,
        base64: a.base64,
        type: a.type || 'image/jpeg'
      }));
      setImageUris(prev => [...prev, ...newImages].slice(0, 3));
    }
  };

  const removeImage = (indexToRemove) => {
    haptic.tick();
    setImageUris(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleExtract = async () => {
    if (imageUris.length === 0 || !confirmed) return;
    haptic.impact();
    
    setSubmitting(true);
    try {
      const profileRes = await legendsApi.getUserProfile(sport?.id);
      if (!profileRes.success || !profileRes.player?.id) {
        showToast('Could not find your player profile.', 'error');
        setSubmitting(false);
        return;
      }

      const res = await legendsApi.submitHistoricalStats(profileRes.player.id, {
        data: {}, // No data sent from user anymore
        imageUrls: imageUris // Now contains objects with base64 and type
      });
      
      if (res.success) {
        navigation.navigate('HistoricalStatsSuccess');
      } else {
        showToast(res.error || 'Failed to submit stats.', 'error');
      }
    } catch (e) {
      showToast('An error occurred while uploading.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={s.screen}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={DS.bg} />
      
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="chevron-left" size={26} color={DS.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={s.body}>
        <Text style={s.h1}>Upload Scorecards</Text>
        <Text style={s.sub}>Upload up to 3 screenshots for batting, bowling, or fielding stats.</Text>

        {imageUris.length === 0 ? (
          <TouchableOpacity 
            style={s.dropzone} 
            activeOpacity={0.8} 
            onPress={pickImage}
          >
            <View style={s.dropzoneInner}>
              <Icon name="image-multiple-outline" size={40} color={DS.lime} />
              <Text style={s.dropzoneText}>Tap to select screenshots</Text>
              <Text style={s.dropzoneSub}>Select up to 3 images (JPG, PNG)</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={s.previewContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.previewScroll}>
              {imageUris.map((img, index) => (
                <View key={index} style={s.previewWrapper}>
                  <Image source={{ uri: img.uri }} style={s.previewImage} resizeMode="cover" />
                  <TouchableOpacity style={s.removeBtn} onPress={() => removeImage(index)}>
                    <Icon name="close" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              
              {imageUris.length < 3 && (
                <TouchableOpacity style={s.addMoreBtn} onPress={pickImage} activeOpacity={0.8}>
                  <Icon name="plus" size={32} color={DS.lime} />
                  <Text style={s.addMoreText}>Add</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        )}

        {imageUris.length > 0 && (
          <TouchableOpacity 
            style={s.confirmBox} 
            activeOpacity={0.9} 
            onPress={() => {
              haptic.tick();
              setConfirmed(!confirmed);
            }}
          >
            <View style={[s.checkbox, confirmed && s.checkboxActive]}>
              {confirmed && <Icon name="check" size={16} color="#fff" />}
            </View>
            <Text style={s.confirmText}>
              I confirm these are my stats and I have the right to upload them.
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={s.footer}>
        {submitting ? (
          <View style={s.uploadingState}>
            <ActivityIndicator size="large" color={DS.lime} />
            <Text style={s.uploadingText}>Uploading proof to Admin...</Text>
          </View>
        ) : (
          <GradientButton
            label="Submit Proof"
            icon="cloud-upload"
            iconRight
            onPress={handleExtract}
            disabled={imageUris.length === 0 || !confirmed}
            height={56}
            style={s.primaryBtn}
            textStyle={{ fontSize: 16 }}
            colors={[DS.lime, DS.lime]}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: DS.bg },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingTop: 12, paddingBottom: 12,
  },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 10 },
  h1: { fontSize: 32, fontWeight: '900', color: DS.textPrimary, letterSpacing: -0.6 },
  sub: { fontSize: 15, fontWeight: '600', color: DS.textMuted, marginTop: 12, lineHeight: 22, marginBottom: 32 },
  
  dropzone: {
    height: 220, borderRadius: 24, borderWidth: 2, borderColor: DS.surfaceHighest || '#2a2f42',
    borderStyle: 'dashed', backgroundColor: DS.surfaceHigh,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  dropzoneInner: { alignItems: 'center', padding: 20 },
  dropzoneText: { fontSize: 16, fontWeight: '800', color: DS.textPrimary, marginTop: 16 },
  dropzoneSub: { fontSize: 13, fontWeight: '600', color: DS.textMuted, marginTop: 6 },
  
  previewContainer: { height: 260 },
  previewScroll: { gap: 16, paddingRight: 24 },
  previewWrapper: {
    width: 180, height: 240, borderRadius: 20, overflow: 'hidden',
    borderWidth: 2, borderColor: DS.lime,
  },
  previewImage: { width: '100%', height: '100%' },
  removeBtn: {
    position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  addMoreBtn: {
    width: 120, height: 240, borderRadius: 20, borderWidth: 2, borderColor: DS.surfaceHighest || '#2a2f42',
    borderStyle: 'dashed', backgroundColor: DS.surfaceHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  addMoreText: { fontSize: 14, fontWeight: '800', color: DS.lime, marginTop: 8 },
  
  checkbox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: DS.surfaceHighest,
    alignItems: 'center', justifyContent: 'center', backgroundColor: DS.surface,
  },
  checkboxActive: { backgroundColor: DS.lime, borderColor: DS.lime },
  confirmBox: {
    flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 24,
    backgroundColor: DS.surfaceHigh, padding: 16, borderRadius: 16,
    borderWidth: 1, borderColor: DS.surfaceHighest || '#2a2f42'
  },
  confirmText: { flex: 1, fontSize: 14, fontWeight: '600', color: DS.textSecondary, lineHeight: 20 },
  
  footer: { paddingHorizontal: 24, paddingBottom: 40, paddingTop: 16 },
  primaryBtn: { borderRadius: 16 },
  uploadingState: {
    alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12
  },
  uploadingText: {
    fontSize: 16, fontWeight: '800', color: DS.lime
  }
});

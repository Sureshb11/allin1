import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, TextInput, Modal, ActivityIndicator, StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';

const DS = {
  bg: '#0f131f',
  surfaceLow: '#171b28',
  surfaceHigh: '#262a37',
  surfaceHighest: '#313442',
  lime: '#abd600',
  coral: '#ffb59e',
  blue: '#b7c4ff',
  textPrimary: '#dfe2f3',
  textVariant: '#c3c5d9',
  textMuted: '#8d90a2',
  live: '#ef4444',
};

const STATUS_CONFIG = {
  analyzed:  { label: 'Analysed',    color: DS.lime,       bg: 'rgba(171,214,0,0.15)' },
  analyzing: { label: 'Processing...', color: DS.coral,    bg: 'rgba(255,181,158,0.15)' },
  uploaded:  { label: 'Uploaded',    color: DS.textMuted,  bg: DS.surfaceHighest },
};

function VideoCard({ item, onAnalyze }) {
  const st = STATUS_CONFIG[item.status] || STATUS_CONFIG.uploaded;
  return (
    <View style={styles.videoCard}>
      <View style={styles.videoThumb}>
        <Icon name="play-circle-outline" size={36} color={DS.lime} />
      </View>
      <Text style={styles.videoTitle} numberOfLines={2}>{item.title}</Text>
      {!!item.duration && (
        <View style={styles.videoDurRow}>
          <Icon name="clock-outline" size={12} color={DS.textMuted} />
          <Text style={styles.videoDur}>{item.duration}</Text>
        </View>
      )}
      <View style={[styles.statusPill, { backgroundColor: st.bg }]}>
        <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
      </View>
      {item.status !== 'analyzed' && item.status !== 'analyzing' && (
        <TouchableOpacity style={styles.analyzeBtn} onPress={() => onAnalyze(item.id)}>
          <Icon name="chart-bar" size={13} color={DS.bg} />
          <Text style={styles.analyzeBtnText}>Analyse</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function AnalysisCard({ item }) {
  return (
    <View style={styles.analysisCard}>
      <Text style={styles.analysisTitle} numberOfLines={1}>{item.video?.title || 'Video Analysis'}</Text>
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{item.highlights ?? '\u2014'}</Text>
          <Text style={styles.statLbl}>Highlights</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{item.shots ?? '\u2014'}</Text>
          <Text style={styles.statLbl}>Shots</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{item.insights ?? '\u2014'}</Text>
          <Text style={styles.statLbl}>Insights</Text>
        </View>
      </View>
    </View>
  );
}

const VideoAnalysisScreen = ({ navigation }) => {
  const [videos, setVideos] = useState([]);
  const [analysisResults, setAnalysisResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ title: '', duration: '' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [vRes, aRes] = await Promise.all([
        legendsApi.getMatchVideos(),
        legendsApi.getVideoAnalyses(),
      ]);
      if (vRes.success) setVideos(vRes.data);
      if (aRes.success) setAnalysisResults(aRes.data);
    } catch {} finally { setLoading(false); }
  };

  const handleUpload = async () => {
    if (!form.title.trim()) return Alert.alert('Error', 'Title is required');
    setUploading(true);
    try {
      const res = await legendsApi.uploadVideo({ title: form.title.trim(), duration: form.duration.trim() || '0:00' });
      if (res.success) {
        Alert.alert('Uploaded!', 'Video uploaded successfully.');
        setShowUpload(false);
        setForm({ title: '', duration: '' });
        loadData();
      } else Alert.alert('Error', res.error || 'Upload failed');
    } catch { Alert.alert('Error', 'Something went wrong'); }
    finally { setUploading(false); }
  };

  const handleAnalyze = async (videoId) => {
    const res = await legendsApi.analyzeVideo(videoId);
    if (res.success) { Alert.alert('Done!', 'Analysis complete!'); loadData(); }
    else Alert.alert('Error', res.error || 'Analysis failed');
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <StatusBar barStyle="light-content" backgroundColor={DS.bg} />
        <ActivityIndicator size="large" color={DS.lime} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={DS.bg} />
      {/* Hero */}
      <View style={styles.hero}>
        <Icon name="video-outline" size={20} color={DS.textMuted} />
        <Text style={styles.heroTitle}>Video Analysis</Text>
        <TouchableOpacity style={styles.uploadPill} onPress={() => setShowUpload(true)}>
          <Icon name="plus" size={14} color={DS.bg} />
          <Text style={styles.uploadPillText}>Upload</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={analysisResults}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* Recent Videos */}
            <View style={styles.sectionHeader}>
              <Icon name="play-circle-outline" size={16} color={DS.lime} />
              <Text style={styles.sectionTitle}>RECENT VIDEOS</Text>
            </View>
            {videos.length > 0 ? (
              <FlatList
                data={videos}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={item => item.id}
                contentContainerStyle={{ gap: 12, paddingBottom: 4 }}
                renderItem={({ item }) => <VideoCard item={item} onAnalyze={handleAnalyze} />}
              />
            ) : (
              <View style={styles.emptyInline}>
                <Icon name="video-off-outline" size={32} color={DS.textMuted} />
                <Text style={styles.emptyInlineText}>No videos yet</Text>
              </View>
            )}

            {analysisResults.length > 0 && (
              <View style={[styles.sectionHeader, { marginTop: 16 }]}>
                <Icon name="chart-bar" size={16} color={DS.lime} />
                <Text style={styles.sectionTitle}>ANALYSIS RESULTS</Text>
              </View>
            )}
          </>
        }
        renderItem={({ item }) => <AnalysisCard item={item} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="chart-bar" size={48} color={DS.textMuted} />
            <Text style={styles.emptyTitle}>No analyses yet</Text>
            <Text style={styles.emptySub}>Upload a video and tap Analyse</Text>
          </View>
        }
      />

      {/* Upload Modal */}
      <Modal visible={showUpload} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Upload Match Video</Text>
            <Text style={styles.fieldLabel}>VIDEO TITLE *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. T20 Final Highlights"
              placeholderTextColor={DS.textMuted}
              value={form.title}
              onChangeText={v => setForm(f => ({ ...f, title: v }))}
            />
            <Text style={styles.fieldLabel}>DURATION</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 2:30:00"
              placeholderTextColor={DS.textMuted}
              value={form.duration}
              onChangeText={v => setForm(f => ({ ...f, duration: v }))}
            />
            <TouchableOpacity style={[styles.uploadBtn, uploading && { opacity: 0.6 }]} onPress={handleUpload} disabled={uploading}>
              {uploading ? <ActivityIndicator color={DS.bg} /> : (
                <>
                  <Icon name="upload" size={18} color={DS.bg} />
                  <Text style={styles.uploadBtnText}>Upload</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowUpload(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: DS.bg },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16,
  },
  heroTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: DS.textPrimary },
  uploadPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: DS.lime, borderRadius: 24, paddingHorizontal: 12, paddingVertical: 5,
  },
  uploadPillText: { fontSize: 12, fontWeight: '700', color: DS.bg },

  list: { padding: 16, paddingBottom: 32 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: DS.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' },

  videoCard: {
    width: 200, backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 12,
  },
  videoThumb: {
    height: 100, backgroundColor: DS.surfaceLow, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  videoTitle: { fontSize: 14, fontWeight: '700', color: DS.textPrimary, marginBottom: 4 },
  videoDurRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 8 },
  videoDur: { fontSize: 11, color: DS.textMuted },
  statusPill: { alignSelf: 'flex-start', borderRadius: 24, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 },
  statusText: { fontSize: 10, fontWeight: '800' },
  analyzeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: DS.lime, borderRadius: 12, paddingVertical: 8,
  },
  analyzeBtnText: { fontSize: 12, fontWeight: '700', color: DS.bg },

  analysisCard: { backgroundColor: DS.surfaceHigh, borderRadius: 16, padding: 16, marginBottom: 12 },
  analysisTitle: { fontSize: 15, fontWeight: '800', color: DS.textPrimary, marginBottom: 12 },
  statsRow: { flexDirection: 'row' },
  statBox: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 22, fontWeight: '900', color: DS.lime },
  statLbl: { fontSize: 11, color: DS.textMuted, marginTop: 2 },

  emptyInline: { alignItems: 'center', paddingVertical: 20, gap: 6 },
  emptyInlineText: { fontSize: 13, color: DS.textMuted },
  empty: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: DS.textVariant },
  emptySub: { fontSize: 13, color: DS.textMuted },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: DS.surfaceLow, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 16, paddingBottom: 32,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: DS.surfaceHighest, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: DS.textPrimary, marginBottom: 16, textAlign: 'center' },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: DS.textMuted, marginBottom: 6, marginTop: 10, letterSpacing: 1, textTransform: 'uppercase' },
  input: {
    borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: DS.textPrimary,
    backgroundColor: DS.surfaceHigh,
  },
  uploadBtn: {
    backgroundColor: DS.lime, borderRadius: 12, paddingVertical: 14, marginTop: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  uploadBtnText: { fontSize: 16, fontWeight: '800', color: DS.bg },
  cancelBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  cancelBtnText: { fontSize: 15, color: DS.textMuted, fontWeight: '600' },
});

export default VideoAnalysisScreen;

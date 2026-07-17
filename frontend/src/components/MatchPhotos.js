// ─────────────────────────────────────────────────────────────────────────────
// MatchPhotos — post-match photo capture.
//
// Drop <MatchPhotos matchId={id} /> onto a finished-match screen. It shows an
// "Add Match Photos" button; tapping it lets the user TAKE a photo or UPLOAD one
// from their library. Each photo is uploaded to Vercel Blob and posted to the
// match, which fans it out to BOTH teams' galleries — so it immediately shows up
// on each team's profile Gallery tab. Any thumbnails already added are shown in
// a strip underneath.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Modal, ActivityIndicator, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import { pickAndUploadImage, captureAndUploadImage } from '../utils/imageUpload';
import legendsApi from '../services/LegendsApi';
import { showToast } from './Toast';

export default function MatchPhotos({ matchId, style }) {
  const { colors: DS } = useTheme();
  const s = makeStyles(DS);
  const [photos, setPhotos] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!matchId) return;
    const res = await legendsApi.getMatchPhotos(matchId);
    if (res.success) setPhotos(res.data);
  }, [matchId]);

  useEffect(() => { load(); }, [load]);

  const add = async (source) => {
    if (busy) return;
    setBusy(true);
    const r = source === 'camera'
      ? await captureAndUploadImage('gallery')
      : await pickAndUploadImage('gallery');
    if (r.url) {
      const res = await legendsApi.addMatchPhoto(matchId, { url: r.url });
      if (res.success) { await load(); showToast('Photo added to both teams’ galleries.', 'success'); }
      else showToast(res.error || 'Could not add photo', 'error');
    } else if (r.error) showToast(r.error, 'error');
    setBusy(false);
  };

  if (!matchId) return null;

  return (
    <View style={style}>
      <TouchableOpacity style={s.btn} onPress={() => setOpen(true)} activeOpacity={0.85}>
        <Icon name="camera-plus" size={18} color={DS.onLime} />
        <Text style={s.btnText}>ADD MATCH PHOTOS</Text>
        {photos.length > 0 && <View style={s.count}><Text style={s.countTxt}>{photos.length}</Text></View>}
      </TouchableOpacity>

      {photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.strip} contentContainerStyle={{ gap: 8 }}>
          {photos.map((p) => <Image key={p.id} source={{ uri: p.url }} style={s.thumb} />)}
        </ScrollView>
      )}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.title}>Add Match Photos</Text>
            <Text style={s.sub}>Saved to both teams’ galleries.</Text>

            <TouchableOpacity style={s.opt} onPress={() => add('camera')} disabled={busy}>
              <Icon name="camera" size={22} color={DS.lime} />
              <Text style={s.optTxt}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.opt} onPress={() => add('library')} disabled={busy}>
              <Icon name="image-multiple" size={22} color={DS.lime} />
              <Text style={s.optTxt}>Upload from Library</Text>
            </TouchableOpacity>

            {busy && <ActivityIndicator color={DS.lime} style={{ marginTop: 12 }} />}

            <TouchableOpacity style={s.close} onPress={() => setOpen(false)} disabled={busy}>
              <Text style={s.closeTxt}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: DS.lime, paddingVertical: 13, borderRadius: 12,
  },
  btnText: { color: DS.onLime, fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  count: {
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5,
    backgroundColor: 'rgba(0,0,0,0.22)', alignItems: 'center', justifyContent: 'center',
  },
  countTxt: { color: DS.onLime, fontSize: 11, fontWeight: '900' },
  strip: { marginTop: 10 },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: DS.surfaceHigh },

  overlay: { flex: 1, backgroundColor: DS.overlay, justifyContent: 'center', alignItems: 'center', padding: 28 },
  sheet: { backgroundColor: DS.surfaceHigh, borderRadius: 20, padding: 22, width: '100%' },
  title: { fontSize: 19, fontWeight: '800', color: DS.textPrimary },
  sub: { fontSize: 13, color: DS.textMuted, marginTop: 4, marginBottom: 16 },
  opt: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 12,
    backgroundColor: DS.surfaceLow, borderRadius: 12, marginBottom: 10,
  },
  optTxt: { fontSize: 15, fontWeight: '700', color: DS.textPrimary },
  close: { alignSelf: 'center', marginTop: 8, paddingVertical: 10, paddingHorizontal: 24 },
  closeTxt: { color: DS.textMuted, fontSize: 15, fontWeight: '700' },
});

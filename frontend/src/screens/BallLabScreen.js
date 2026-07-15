// ─────────────────────────────────────────────────────────────────────────────
// BallLab — dev-only workbench for the signature cricket ball.
//
// Phase 1: judge the still art on different grounds (stadium dark / app light /
// harsh sunlight) and at every size the app will use. Later phases add motion
// and event-reaction controls here before anything touches real screens.
//
// Reach it in dev builds by long-pressing the LOCAL LEGENDS logo on the feed.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AnimatedCricketBall from '../components/CricketBall/AnimatedBall';
import WicketVideo from '../components/CricketBall/WicketVideo';

const GROUNDS = [
  { id: 'stadium',  label: 'Stadium',  bg: '#0a0e18', ink: '#e8ecf8', mut: '#8b93a8', card: '#12182a' },
  { id: 'light',    label: 'App light', bg: '#f2f4f9', ink: '#101523', mut: '#5c6375', card: '#ffffff' },
  { id: 'sunlight', label: '☀ Sunlight', bg: '#ffffff', ink: '#1a1d26', mut: '#7a7f8c', card: '#f4f5f8' },
];

export default function BallLabScreen({ navigation }) {
  const [g, setG] = useState(GROUNDS[0]);
  const [wicket, setWicket] = useState(false);
  const s = makeStyles(g);

  return (
    <View style={s.root}>
      <StatusBar barStyle={g.id === 'stadium' ? 'light-content' : 'dark-content'} backgroundColor={g.bg} />
      <View style={s.top}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Icon name="arrow-left" size={22} color={g.ink} />
        </TouchableOpacity>
        <Text style={s.title}>BALL LAB</Text>
        <Text style={s.phase}>PHASE 2 · MOTION</Text>
      </View>

      {/* ground switcher */}
      <View style={s.seg}>
        {GROUNDS.map((x) => (
          <TouchableOpacity key={x.id} onPress={() => setG(x)}
            style={[s.segBtn, g.id === x.id && s.segBtnOn]}>
            <Text style={[s.segTxt, g.id === x.id && s.segTxtOn]}>{x.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        {/* hero — live motion: floats, ring pulses; tap it for the spin+ripple */}
        <View style={s.hero}>
          <AnimatedCricketBall size={180} />
          <Text style={s.heroHint}>ball floats · ring is static — tap for spin</Text>
          <TouchableOpacity style={s.wicketBtn} onPress={() => setWicket(true)}>
            <Icon name="movie-play-outline" size={15} color="#ff6b6b" />
            <Text style={s.wicketBtnTxt}>PREVIEW WICKET VIDEO</Text>
          </TouchableOpacity>
        </View>

        {/* the sizes the app will actually use */}
        <Text style={s.capt}>DOCK · 64  —  SPECTATOR · 56  —  INLINE · 36</Text>
        <View style={s.row}>
          <View style={s.cell}><AnimatedCricketBall size={64} /><Text style={s.cellTxt}>dock</Text></View>
          <View style={s.cell}><AnimatedCricketBall size={56} /><Text style={s.cellTxt}>live</Text></View>
          <View style={s.cell}><AnimatedCricketBall size={36} /><Text style={s.cellTxt}>inline</Text></View>
        </View>

        {/* on a card surface, like the dock will be */}
        <Text style={s.capt}>ON SURFACE</Text>
        <View style={s.dockMock}>
          <Icon name="home-variant-outline" size={24} color={g.mut} />
          <Icon name="cricket" size={24} color={g.mut} />
          <View style={{ marginTop: -26 }}><AnimatedCricketBall size={62} /></View>
          <Icon name="account-group-outline" size={24} color={g.mut} />
          <Icon name="account-circle-outline" size={24} color={g.mut} />
        </View>

        <Text style={s.note}>Phase 2 adds: rotation illusion · red⇄white morph · float + live shadow.
          Judge only the leather, seam and shading here.</Text>
      </ScrollView>
      <WicketVideo visible={wicket} onDone={() => setWicket(false)} />
    </View>
  );
}

const makeStyles = (g) => StyleSheet.create({
  root: { flex: 1, backgroundColor: g.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingTop: 54, paddingBottom: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: '900', letterSpacing: 3, color: g.ink },
  phase: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: g.mut },
  seg: { flexDirection: 'row', gap: 6, paddingHorizontal: 18, paddingVertical: 10 },
  segBtn: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 16, backgroundColor: g.card },
  segBtnOn: { backgroundColor: '#00AEEF' },
  segTxt: { fontSize: 12, fontWeight: '700', color: g.mut },
  segTxtOn: { color: '#04222e' },
  body: { padding: 18, paddingBottom: 60 },
  hero: { alignItems: 'center', paddingVertical: 34 },
  heroHint: { fontSize: 11, fontWeight: '600', color: g.mut, marginTop: 14, letterSpacing: 0.4 },
  wicketBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18,
    borderWidth: 1, borderColor: '#ff6b6b55', backgroundColor: '#ff6b6b14' },
  wicketBtnTxt: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: '#ff6b6b' },
  capt: { fontSize: 10, fontWeight: '800', letterSpacing: 1.6, color: g.mut, marginTop: 18, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 28 },
  cell: { alignItems: 'center', gap: 6 },
  cellTxt: { fontSize: 10, fontWeight: '700', color: g.mut },
  dockMock: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: g.card, borderRadius: 32, paddingHorizontal: 26, paddingVertical: 16,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  note: { fontSize: 12, color: g.mut, marginTop: 22, lineHeight: 18 },
});

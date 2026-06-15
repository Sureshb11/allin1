// RummyScorecardScreen — Pool-Rummy (201) score card, ported from the
// "Choose Your Arena" design handoff (design_handoff_arena/app/scoring.jsx).
// Opened when the Rummy disc is picked. Totals/eliminations/winner are derived
// from the deal list (source of truth) each render.

import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import SportIcon from '../components/SportIcon';

const A = {
  navy0: '#0a0e18', navy1: '#0d1320', navy2: '#111a2b',
  cell: '#161f30', cellHi: '#1d2942',
  line: 'rgba(150,180,230,0.10)', ink: '#eaf0fb', inkDim: '#8a97b0',
  lime: '#c4f82a', warn: '#ffb24a', danger: '#ff5a5a', dangerTxt: '#ff7a7a',
};

const POOL = 201;
const PLAYERS = ['Aarav', 'Diya', 'Kabir', 'Meera'];
const INITIAL = [
  [0, 24, 41, 18],
  [33, 0, 27, 12],
  [19, 46, 0, 40],
  [0, 38, 22, 51],
];
const SCRIPT = [
  [29, 0, 15, 44],
  [0, 53, 31, 20],
  [42, 18, 0, 37],
  [25, 0, 48, 19],
];

export default function RummyScorecardScreen({ navigation }) {
  const [deals, setDeals] = useState(INITIAL);
  const scriptRef = useRef(SCRIPT);

  const totals = PLAYERS.map((_, p) => deals.reduce((s, d) => s + d[p], 0));
  const live = totals.map((t) => t <= POOL);
  const liveCount = live.filter(Boolean).length;
  const leaderIdx = totals.indexOf(Math.min(...totals));

  const addDeal = () => {
    setDeals((d) => {
      const tot = PLAYERS.map((_, p) => d.reduce((s, row) => s + row[p], 0));
      const liveNow = tot.map((t) => t <= POOL);
      if (liveNow.filter(Boolean).length <= 1) return d;           // game decided
      const base = scriptRef.current[d.length % scriptRef.current.length];
      return [...d, base.map((v, p) => (liveNow[p] ? v : 0))];      // eliminated → 0
    });
  };
  const reset = () => setDeals(INITIAL);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={A.navy1} />

      {/* header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="chevron-left" size={24} color={A.ink} />
        </TouchableOpacity>
        <SportIcon id="rummy" size={22} color={A.lime} />
        <Text style={s.title}>RUMMY</Text>
        <View style={s.poolPill}><Text style={s.poolTxt}>POOL · {POOL}</Text></View>
      </View>

      {/* standings */}
      <View style={s.standings}>
        {PLAYERS.map((name, p) => {
          const out = !live[p];
          const lead = p === leaderIdx && live[p];
          const pct = Math.min(100, (totals[p] / POOL) * 100);
          const barColor = out ? A.danger : pct > 75 ? A.warn : A.lime;
          return (
            <View key={p} style={[
              s.pCard,
              out ? s.pCardOut : lead ? s.pCardLead : null,
            ]}>
              {lead && <View style={s.leadPill}><Text style={s.leadTxt}>LEAD</Text></View>}
              <View style={[s.pAvatar, { backgroundColor: lead ? A.lime : A.cellHi }]}>
                <Text style={[s.pAvatarTxt, { color: lead ? A.navy0 : A.ink }]}>{name[0]}</Text>
              </View>
              <Text style={s.pName} numberOfLines={1}>{name}</Text>
              <Text style={[s.pTotal, { color: out ? A.dangerTxt : lead ? A.lime : A.ink }]}>{totals[p]}</Text>
              <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${pct}%`, backgroundColor: barColor }]} />
              </View>
              <Text style={[s.pLeft, { color: out ? A.dangerTxt : A.inkDim }]}>
                {out ? 'OUT' : `${POOL - totals[p]} LEFT`}
              </Text>
            </View>
          );
        })}
      </View>

      {/* deals table */}
      <View style={s.table}>
        <View style={s.tableHead}>
          <Text style={s.dealCol}>DEAL</Text>
          {PLAYERS.map((n, p) => <Text key={p} style={s.headCell}>{n[0]}</Text>)}
        </View>
        <View style={{ flex: 1 }}>
          {/* card-suit watermark */}
          <View style={s.watermark} pointerEvents="none">
            <Text style={[s.suit, { color: A.ink }]}>♠</Text>
            <Text style={[s.suit, { color: '#ff6b6b' }]}>♥</Text>
            <Text style={[s.suit, { color: '#ff6b6b' }]}>♦</Text>
            <Text style={[s.suit, { color: A.ink }]}>♣</Text>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {deals.map((d, i) => (
              <View key={i} style={s.dealRow}>
                <Text style={s.dealNum}>{String(i + 1).padStart(2, '0')}</Text>
                {d.map((v, p) => (
                  <Text key={p} style={[s.dealCell, { color: v === 0 ? A.lime : A.ink }]}>
                    {v === 0 ? '—' : v}
                  </Text>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
        <View style={s.totalRow}>
          <Text style={s.dealCol}>TOTAL</Text>
          {totals.map((t, p) => (
            <Text key={p} style={[s.totalCell, { color: live[p] ? A.lime : A.dangerTxt }]}>{t}</Text>
          ))}
        </View>
      </View>

      {/* footer */}
      <View style={s.footer}>
        <TouchableOpacity style={s.resetBtn} onPress={reset}>
          <Icon name="refresh" size={20} color={A.inkDim} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.dealBtn, liveCount <= 1 && s.dealBtnDone]}
          onPress={addDeal}
          disabled={liveCount <= 1}
          activeOpacity={0.85}
        >
          {liveCount <= 1
            ? <Text style={s.winTxt}>{PLAYERS[leaderIdx]} WINS 🏆</Text>
            : <Text style={s.dealBtnTxt}>+ NEW DEAL</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: A.navy1, paddingTop: 44 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: A.cell, alignItems: 'center', justifyContent: 'center', marginRight: 2 },
  title: { fontSize: 20, fontWeight: '900', color: A.ink, letterSpacing: 0.6 },
  poolPill: { marginLeft: 'auto', backgroundColor: A.cellHi, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20 },
  poolTxt: { color: A.lime, fontSize: 11, fontWeight: '800', letterSpacing: 1 },

  standings: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  pCard: { flex: 1, backgroundColor: A.cell, borderWidth: 1, borderColor: A.line, borderRadius: 14, paddingVertical: 9, paddingHorizontal: 6, alignItems: 'center' },
  pCardLead: { backgroundColor: 'rgba(196,248,42,0.10)', borderColor: 'rgba(196,248,42,0.4)' },
  pCardOut: { backgroundColor: 'rgba(255,90,90,0.08)', borderColor: 'rgba(255,90,90,0.25)', opacity: 0.78 },
  pAvatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  pAvatarTxt: { fontWeight: '800', fontSize: 12 },
  pName: { fontSize: 10.5, color: A.inkDim, marginTop: 5 },
  pTotal: { fontSize: 22, fontWeight: '900', lineHeight: 24, marginTop: 2 },
  barTrack: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 7, width: '100%', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },
  pLeft: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.5, marginTop: 4 },
  leadPill: { position: 'absolute', top: -7, backgroundColor: A.lime, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 7, zIndex: 2 },
  leadTxt: { color: A.navy0, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },

  table: { flex: 1, marginHorizontal: 16, backgroundColor: A.cell, borderRadius: 16, overflow: 'hidden' },
  tableHead: { flexDirection: 'row', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  dealCol: { width: 44, fontSize: 10, color: A.inkDim, letterSpacing: 1, fontWeight: '800' },
  headCell: { flex: 1, textAlign: 'center', fontSize: 10, color: A.inkDim, letterSpacing: 0.5, fontWeight: '800' },
  watermark: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: 0.13 },
  suit: { fontSize: 30 },
  dealRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' },
  dealNum: { width: 44, fontSize: 15, fontWeight: '800', color: A.inkDim },
  dealCell: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800' },
  totalRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', backgroundColor: A.navy2 },
  totalCell: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '900' },

  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 28 },
  resetBtn: { width: 52, height: 52, borderRadius: 16, borderWidth: 1, borderColor: A.line, backgroundColor: A.cell, alignItems: 'center', justifyContent: 'center' },
  dealBtn: { flex: 1, height: 52, borderRadius: 16, backgroundColor: A.lime, alignItems: 'center', justifyContent: 'center' },
  dealBtnDone: { backgroundColor: A.cellHi },
  dealBtnTxt: { color: A.navy0, fontSize: 18, fontWeight: '900', letterSpacing: 0.6 },
  winTxt: { color: A.lime, fontSize: 17, fontWeight: '900', letterSpacing: 0.4 },
});

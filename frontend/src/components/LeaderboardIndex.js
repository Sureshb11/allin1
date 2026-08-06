// The leaderboard index — thirty-five boards grouped by category, each naming
// whoever currently tops it, each opening a full table.
//
// Shared, because a team and a tournament ask the same question of the same
// boards and only differ in which matches feed them. It was written inside the
// team's Stats tab first; a tournament copy would have been the fourth place in
// this app where two screens drifted apart because one of them got the fix.
//
// It takes the leaderboards object as data and an `onOpen(board, category)`
// callback, so it knows nothing about navigation or where the numbers came
// from.

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import CricketCap, { CAP_COLORS, CAP_LABELS } from './CricketCap';
import { BOARDS } from './leaderboardBoards';

export default function LeaderboardIndex({ leaderboards, onOpen, emptyHint, contentContainerStyle, scrollProps }) {
  const DS = useTheme().colors;
  const s = useThemedStyles(makeStyles);

  const grouped = BOARDS.reduce((acc, board) => {
    (acc[board.category] = acc[board.category] || []).push(board);
    return acc;
  }, {});

  const lds = leaderboards || {};
  const empty = !Object.values(grouped).some((bs) => bs.some((b) => lds[b.key]?.length));
  if (empty) {
    return (
      <View style={s.empty}>
        <Icon name="poll" size={36} color={DS.textMuted} />
        <Text style={s.emptyTitle}>No leaders yet</Text>
        <Text style={s.emptyHint}>{emptyHint || 'Boards fill in once players have batted or bowled.'}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[{ paddingBottom: 24 }, contentContainerStyle]} {...scrollProps}>
      {Object.entries(grouped).map(([category, boards]) => {
        const valid = boards.filter((b) => lds[b.key]?.length > 0);
        if (!valid.length) return null;
        return (
          <View key={category}>
            <View style={s.catHead}>
              <Text style={s.catHeadText}>{category}</Text>
            </View>
            {valid.map((board, i) => {
              const leader = lds[board.key][0];
              return (
                <TouchableOpacity
                  key={board.key}
                  style={[s.boardRow, i === valid.length - 1 && s.boardRowLast]}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`${board.title}. Leader ${leader?.name || 'none'}`}
                  onPress={() => onOpen(board, category)}>
                  {/* The three cap boards wear the cap instead of a grey glyph —
                      it is the fastest way to find them in a list of thirty-five,
                      and the colour is the whole point. */}
                  {board.cap
                    ? <View style={s.capSlot}><CricketCap cap={board.cap} size={20} /></View>
                    : <Icon name={board.icon} size={18} color={DS.textMuted} style={s.capSlot} />}
                  <View style={{ flex: 1 }}>
                    <View style={s.boardRowTitleRow}>
                      <Text style={s.boardRowTitle} numberOfLines={1}>{board.title}</Text>
                      {!!board.cap && (
                        <Text style={[s.capTag, { color: CAP_COLORS[board.cap] }]}>
                          {CAP_LABELS[board.cap].toUpperCase()}
                        </Text>
                      )}
                    </View>
                    {/* Who currently tops it. A list of thirty-five names with
                        nothing beside them is an index you open at random; the
                        leader is the reason to open one. */}
                    {!!leader && (
                      <Text style={s.boardRowLead} numberOfLines={1}>
                        {leader.name} · {board.value(leader)}{board.unit ? ` ${board.unit}` : ''}
                      </Text>
                    )}
                  </View>
                  <Icon name="chevron-right" size={20} color={DS.textMuted} />
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  // A grey band per category and a plain row per board, because what makes a
  // long list readable is the band that separates it, not the card around it.
  catHead: {
    paddingHorizontal: 16, paddingVertical: 9,
    backgroundColor: DS.surfaceHigh,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: DS.faint,
  },
  catHeadText: { fontSize: 11, fontWeight: '900', color: DS.textMuted, letterSpacing: 1 },
  boardRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    minHeight: 56, paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: DS.faint,
    backgroundColor: DS.surface,
  },
  boardRowLast: { borderBottomWidth: 0 },
  capSlot: { width: 24, alignItems: 'center' },
  boardRowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  boardRowTitle: { fontSize: 14.5, fontWeight: '700', color: DS.textPrimary, flexShrink: 1 },
  capTag: { fontSize: 8.5, fontWeight: '900', letterSpacing: 0.6 },
  boardRowLead: { fontSize: 11.5, fontWeight: '600', color: DS.textMuted, marginTop: 2 },

  empty: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: DS.textPrimary, marginTop: 6 },
  emptyHint: { fontSize: 12, fontWeight: '600', color: DS.textMuted, textAlign: 'center' },
});

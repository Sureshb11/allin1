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

import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, { FadeInUp, FadeOutUp, Layout, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import CricketCap, { CAP_COLORS, CAP_LABELS } from './CricketCap';
import { BOARDS } from './leaderboardBoards';

function LeaderboardGroup({ category, valid, lds, onOpen, s, DS, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  
  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(open ? '90deg' : '0deg', { duration: 250 }) }]
  }));

  const toggleOpen = () => {
    ReactNativeHapticFeedback.trigger('impactLight');
    setOpen(o => !o);
  };

  return (
    <Animated.View layout={Layout.springify().damping(18).stiffness(150)}>
      <TouchableOpacity style={s.catHead} onPress={toggleOpen} activeOpacity={0.7} accessibilityRole="button">
        <Text style={s.catHeadText}>{category}</Text>
        <Animated.View style={arrowStyle}>
          <Icon name="chevron-right" size={20} color={DS.textMuted} />
        </Animated.View>
      </TouchableOpacity>
      
      {open && (
        <Animated.View entering={FadeInUp.springify()} exiting={FadeOutUp.duration(150)}>
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
        </Animated.View>
      )}
    </Animated.View>
  );
}

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

  // Pre-calculate valid groups so we can easily determine indexes
  const validGroups = Object.entries(grouped)
    .map(([category, boards]) => ({ category, valid: boards.filter((b) => lds[b.key]?.length > 0) }))
    .filter(g => g.valid.length > 0);

  return (
    <ScrollView contentContainerStyle={[{ paddingBottom: 24 }, contentContainerStyle]} {...scrollProps}>
      {validGroups.map(({ category, valid }, index) => (
        <LeaderboardGroup
          key={category}
          category={category}
          valid={valid}
          lds={lds}
          onOpen={onOpen}
          s={s}
          DS={DS}
          defaultOpen={index < 2} // First 2 open by default
        />
      ))}
    </ScrollView>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  // A grey band per category and a plain row per board, because what makes a
  // long list readable is the band that separates it, not the card around it.
  catHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
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

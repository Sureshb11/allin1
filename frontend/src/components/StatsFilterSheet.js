// The stats filter — one sheet, every screen that filters cricket stats.
//
// There were two of these. The leaderboard's worked; the team Stats tab's was a
// stub whose whole body read "Logic for options would go here", behind four
// pills that had no onPress. Both are this now.
//
// Staged: changing four dropdowns should cost one refetch, not four, and it
// lets you back out of a half-made change. Nothing is applied until APPLY.
//
// Which fields appear is the caller's choice — a team filters by opposition and
// by tournament, a leaderboard by neither of the ones its parent already fixed.

import React, { useState, useEffect } from 'react';
import { View, Text, Modal, Pressable, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

// Each field: where its choices come from, and how a choice reads.
// `id` fields hold an object ({ id, name }) and store the id.
export const FIELDS = {
  matchType:    { label: 'Match Type', empty: 'Any',          list: (o) => o.matchTypes,  emptyOption: 'Any Format' },
  year:         { label: 'Year',       empty: 'All Time',     list: (o) => o.years,       emptyOption: 'All Time' },
  venue:        { label: 'Ground',     empty: 'All grounds',  list: (o) => o.venues,      emptyOption: 'All grounds' },
  oppositionId: { label: 'Opposition', empty: 'All',          list: (o) => o.oppositions, emptyOption: 'All Teams', id: true },
  tournamentId: { label: 'Tournament', empty: 'All',          list: (o) => o.tournaments, emptyOption: 'All Tournaments', id: true },
};

export default function StatsFilterSheet({
  visible, onClose, onApply, options = {}, filters = {},
  fields = ['matchType', 'year', 'venue', 'oppositionId'],
}) {
  const DS = useTheme().colors;
  const s = useThemedStyles(makeStyles);

  const [draft, setDraft] = useState(filters);
  const [page, setPage] = useState('main');   // 'main' | a field key

  // Reopening shows what is actually applied, not what was abandoned last time.
  useEffect(() => {
    if (visible) { setDraft(filters); setPage('main'); }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const labelFor = (key) => {
    const f = FIELDS[key];
    const v = draft[key];
    if (v == null || v === '') return f.empty;
    if (f.id) return (f.list(options) || []).find((o) => o.id === v)?.name || f.empty;
    return String(v);
  };

  const choose = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setPage('main');
  };

  const applied = Object.values(draft).filter(Boolean).length;

  return (
    <Modal transparent animationType="slide" visible={!!visible} onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.grab} />

        {page === 'main' ? (
          <View style={s.head}>
            <Text style={s.title}>FILTERS</Text>
            <View style={s.headRight}>
              {applied > 0 && (
                <TouchableOpacity onPress={() => setDraft({})} style={s.resetBtn} accessibilityRole="button">
                  <Text style={s.resetText}>RESET</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.applyBtn} onPress={() => onApply(draft)} accessibilityRole="button">
                <Text style={s.applyText}>APPLY</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={s.head}>
            <TouchableOpacity onPress={() => setPage('main')} style={s.backBtn}
              accessibilityRole="button" accessibilityLabel="Back to filters">
              <Icon name="chevron-left" size={24} color={DS.textPrimary} />
            </TouchableOpacity>
            <Text style={[s.title, { flex: 1 }]}>{FIELDS[page].label}</Text>
          </View>
        )}

        <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 24 }}>
          {page === 'main' && fields.map((key) => {
            const choices = FIELDS[key].list(options) || [];
            // A control with nothing behind it is worse than no control: it
            // opens an empty tray and reads as broken. This team never played a
            // tournament, so it is not offered one.
            if (!choices.length) return null;
            return (
              <TouchableOpacity key={key} style={s.row} onPress={() => setPage(key)}
                accessibilityRole="button" accessibilityLabel={`${FIELDS[key].label}, ${labelFor(key)}`}>
                <Text style={s.rowLabel}>{FIELDS[key].label}</Text>
                <Text style={s.rowValue} numberOfLines={1}>{labelFor(key)}</Text>
                <Icon name="chevron-right" size={18} color={DS.textMuted} />
              </TouchableOpacity>
            );
          })}

          {page !== 'main' && (() => {
            const f = FIELDS[page];
            const choices = [null, ...(f.list(options) || [])];
            return choices.map((c) => {
              const value = c == null ? null : (f.id ? c.id : c);
              const text = c == null ? f.emptyOption : (f.id ? c.name : String(c));
              const on = (draft[page] ?? null) === value;
              return (
                <TouchableOpacity key={String(value ?? 'all')} style={s.option} onPress={() => choose(page, value)}>
                  <Text style={[s.optionText, on && s.optionTextOn]}>{text}</Text>
                  {on && <Icon name="check" size={20} color={DS.lime} />}
                </TouchableOpacity>
              );
            });
          })()}
        </ScrollView>
      </View>
    </Modal>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: DS.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: 32, maxHeight: '80%',
  },
  grab: { width: 40, height: 4, backgroundColor: DS.border, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 8, gap: 8 },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 'auto' },
  title: { fontSize: 17, fontWeight: '800', color: DS.textPrimary, letterSpacing: 0.4 },
  backBtn: { marginLeft: -8, padding: 4 },
  resetBtn: { paddingHorizontal: 10, paddingVertical: 9 },
  resetText: { fontSize: 12, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.6 },
  applyBtn: { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 10, backgroundColor: DS.lime },
  applyText: { fontSize: 13, fontWeight: '900', color: DS.onLime, letterSpacing: 0.8 },

  body: { paddingHorizontal: 20 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    minHeight: 56, borderBottomWidth: 1, borderBottomColor: DS.faint,
  },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: DS.textPrimary },
  rowValue: { fontSize: 14, fontWeight: '700', color: DS.textVariant, maxWidth: 150 },
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: DS.faint,
  },
  optionText: { fontSize: 15.5, color: DS.textPrimary },
  optionTextOn: { color: DS.lime, fontWeight: '800' },
});

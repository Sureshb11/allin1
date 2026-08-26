import { useState, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Animated,
  Modal, FlatList, Switch, Image, Pressable,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { SPACE, RADIUS, TYPE, TAP, shadow } from './create/tokens';
import { useSheetAwareInput } from './create';

// Form primitives.
//
// Built for Create Tournament, which is ~60 inputs across ten sections — at that
// size the difference between "each screen styles its own TextInput" and one set
// of controls is the difference between a form that looks designed and a form
// that looks assembled. Everything here is themed from DS, so it flips with the
// app rather than carrying a light-only palette.
//
// Two rules the whole kit follows:
//   · A label never disappears when the field has content. Placeholder-as-label
//     is what makes long forms unreviewable — you scroll back up and the fields
//     no longer say what they are. Labels float, they don't vanish.
//   · Errors live under the field they belong to and appear on blur or on a
//     failed Next, never on the first keystroke of an empty field.

/* ── Section card ─────────────────────────────────────────────────────────── */
export function SectionCard({ title, subtitle, icon, right, children, style }) {
  const s = useThemedStyles(makeStyles);
  const DS = useTheme().colors;
  return (
    <View style={[s.card, style]}>
      {!!title && (
        <View style={s.cardHead}>
          {!!icon && (
            <View style={s.cardIcon}>
              <Icon name={icon} size={16} color={DS.lime} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{title}</Text>
            {!!subtitle && <Text style={s.cardSub}>{subtitle}</Text>}
          </View>
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

/* ── Text field with a floating label ─────────────────────────────────────── */
export function Field({
  label, value, onChangeText, required, error, hint, keyboardType, maxLength,
  multiline, autoCapitalize, prefix, suffix, onBlur, editable = true, style,
}) {
  const SheetAwareInput = useSheetAwareInput();
  const s = useThemedStyles(makeStyles);
  const DS = useTheme().colors;
  const [focused, setFocused] = useState(false);
  const up = focused || !!String(value ?? '').length;
  const anim = useRef(new Animated.Value(up ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: up ? 1 : 0, duration: 140, useNativeDriver: false }).start();
  }, [up, anim]);

  const borderColor = error ? DS.coral : focused ? DS.lime : DS.border;

  return (
    <View style={[{ marginBottom: 14 }, style]}>
      <View style={[s.fieldWrap, { borderColor }, multiline && { minHeight: 96, alignItems: 'flex-start' }]}>
        {!!prefix && <Text style={s.affix}>{prefix}</Text>}
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Animated.Text
            pointerEvents="none"
            style={[
              s.floatLabel,
              {
                color: error ? DS.coral : focused ? DS.lime : DS.textMuted,
                fontSize: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 10.5] }),
                transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -11] }) }],
              },
            ]}>
            {label}{required ? ' *' : ''}
          </Animated.Text>
          <SheetAwareInput
            style={[s.input, up && { paddingTop: 12 }, multiline && { height: 74, textAlignVertical: 'top' }]}
            value={value == null ? '' : String(value)}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); onBlur && onBlur(); }}
            keyboardType={keyboardType}
            maxLength={maxLength}
            multiline={multiline}
            autoCapitalize={autoCapitalize}
            editable={editable}
            selectionColor={DS.lime}
            placeholderTextColor="transparent"
          />
        </View>
        {!!suffix && <Text style={s.affix}>{suffix}</Text>}
        {!!maxLength && !multiline && focused && (
          <Text style={s.counter}>{String(value ?? '').length}/{maxLength}</Text>
        )}
      </View>
      <FieldNote error={error} hint={hint} />
    </View>
  );
}

export function FieldNote({ error, hint }) {
  const s = useThemedStyles(makeStyles);
  const DS = useTheme().colors;
  if (!error && !hint) return null;
  return (
    <View style={s.noteRow}>
      {!!error && <Icon name="alert-circle-outline" size={12} color={DS.coral} />}
      <Text style={[s.note, error && { color: DS.coral }]}>{error || hint}</Text>
    </View>
  );
}

/* ── Choice chips ─────────────────────────────────────────────────────────── */
export function ChoiceField({ label, required, options, value, onChange, error, hint, columns }) {
  const s = useThemedStyles(makeStyles);
  const DS = useTheme().colors;
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.groupLabel}>{label}{required ? ' *' : ''}</Text>
      <View style={s.chipWrap}>
        {options.map((o) => {
          const val = typeof o === 'string' ? o : o.value;
          const text = typeof o === 'string' ? o : o.label;
          const on = value === val;
          return (
            <TouchableOpacity
              key={val}
              activeOpacity={0.85}
              onPress={() => onChange(val)}
              style={[
                s.chip,
                columns ? { width: `${100 / columns}%`, flexGrow: 0 } : null,
                on && { backgroundColor: DS.lime, borderColor: DS.lime },
              ]}>
              {!!o.icon && <Icon name={o.icon} size={14} color={on ? DS.onLime : DS.textVariant} />}
              <Text style={[s.chipText, on && { color: DS.onLime }]} numberOfLines={1}>{text}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <FieldNote error={error} hint={hint} />
    </View>
  );
}

/* ── Numeric stepper ──────────────────────────────────────────────────────── */
// A squad size is picked, not typed. Steppers keep the keyboard shut for the
// dozen count fields this form has.
export function Stepper({ label, required, value, onChange, min = 0, max = 999, step = 1, error, hint, suffix }) {
  const SheetAwareInput = useSheetAwareInput();
  const s = useThemedStyles(makeStyles);
  const DS = useTheme().colors;
  const n = value === '' || value == null ? null : Number(value);
  const set = (v) => onChange(Math.max(min, Math.min(max, v)));
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.groupLabel}>{label}{required ? ' *' : ''}</Text>
      <View style={[s.stepWrap, { borderColor: error ? DS.coral : DS.border }]}>
        <TouchableOpacity style={s.stepBtn} onPress={() => set((n ?? min) - step)} hitSlop={8}>
          <Icon name="minus" size={18} color={n == null || n <= min ? DS.textMuted : DS.textPrimary} />
        </TouchableOpacity>
        <SheetAwareInput
          style={s.stepValue}
          value={n == null ? '' : String(n)}
          onChangeText={(t) => {
            const clean = t.replace(/\D/g, '');
            onChange(clean === '' ? '' : Math.min(max, Number(clean)));
          }}
          keyboardType="number-pad"
          selectionColor={DS.lime}
        />
        {!!suffix && <Text style={s.stepSuffix}>{suffix}</Text>}
        <TouchableOpacity style={s.stepBtn} onPress={() => set((n ?? min - step) + step)} hitSlop={8}>
          <Icon name="plus" size={18} color={n != null && n >= max ? DS.textMuted : DS.textPrimary} />
        </TouchableOpacity>
      </View>
      <FieldNote error={error} hint={hint} />
    </View>
  );
}

/* ── Toggle row ───────────────────────────────────────────────────────────── */
export function ToggleRow({ label, description, value, onChange, icon, last }) {
  const s = useThemedStyles(makeStyles);
  const DS = useTheme().colors;
  return (
    <Pressable onPress={() => onChange(!value)} style={[s.toggleRow, !last && s.toggleDivider]}>
      {!!icon && <Icon name={icon} size={17} color={value ? DS.lime : DS.textMuted} />}
      <View style={{ flex: 1 }}>
        <Text style={s.toggleLabel}>{label}</Text>
        {!!description && <Text style={s.toggleDesc}>{description}</Text>}
      </View>
      <Switch
        value={!!value}
        onValueChange={onChange}
        trackColor={{ false: DS.surfaceHighest, true: DS.lime }}
        thumbColor={DS.white || '#fff'}
        ios_backgroundColor={DS.surfaceHighest}
      />
    </Pressable>
  );
}

/* ── Searchable select ────────────────────────────────────────────────────── */
export function SelectField({ label, required, value, options, onChange, error, hint, searchable = true, placeholder }) {
  const s = useThemedStyles(makeStyles);
  const DS = useTheme().colors;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const all = options.map((o) => (typeof o === 'string' ? { label: o, value: o } : o));
    if (!q.trim()) return all;
    const needle = q.trim().toLowerCase();
    return all.filter((o) => o.label.toLowerCase().includes(needle));
  }, [options, q]);
  const selected = list.find((o) => o.value === value)
    || options.map((o) => (typeof o === 'string' ? { label: o, value: o } : o)).find((o) => o.value === value);

  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.groupLabel}>{label}{required ? ' *' : ''}</Text>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => { setQ(''); setOpen(true); }}
        style={[s.selectWrap, { borderColor: error ? DS.coral : DS.border }]}>
        <Text style={[s.selectText, !selected && { color: DS.textMuted }]} numberOfLines={1}>
          {selected ? selected.label : (placeholder || `Select ${label.toLowerCase()}`)}
        </Text>
        <Icon name="chevron-down" size={18} color={DS.textMuted} />
      </TouchableOpacity>
      <FieldNote error={error} hint={hint} />

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={s.sheetBackdrop} onPress={() => setOpen(false)} />
        <View style={s.sheet}>
          <View style={s.sheetGrab} />
          <Text style={s.sheetTitle}>{label}</Text>
          {searchable && (
            <View style={s.searchWrap}>
              <Icon name="magnify" size={17} color={DS.textMuted} />
              {/* A plain TextInput on purpose: this search box lives in this
                  component's OWN <Modal>, a separate window above any sheet.
                  A BottomSheetTextInput here would set shouldHandleKeyboardEvents
                  on the sheet BEHIND the modal, shifting it while you type in an
                  overlay that has nothing to do with it. */}
              <TextInput
                style={s.searchInput}
                value={q}
                onChangeText={setQ}
                placeholder="Search"
                placeholderTextColor={DS.textMuted}
                selectionColor={DS.lime}
                autoFocus
              />
              {!!q && (
                <TouchableOpacity onPress={() => setQ('')} hitSlop={8}>
                  <Icon name="close-circle" size={16} color={DS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          )}
          <FlatList
            data={list}
            keyExtractor={(o) => String(o.value)}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 320 }}
            ListEmptyComponent={<Text style={s.sheetEmpty}>Nothing matches “{q}”</Text>}
            renderItem={({ item }) => {
              const on = item.value === value;
              return (
                <TouchableOpacity
                  style={s.optionRow}
                  onPress={() => { onChange(item.value); setOpen(false); }}>
                  <Text style={[s.optionText, on && { color: DS.lime, fontWeight: '800' }]}>{item.label}</Text>
                  {on && <Icon name="check" size={17} color={DS.lime} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

/* ── Date / time ──────────────────────────────────────────────────────────── */
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const fmtTime = (d) =>
  d ? new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';

export function DateField({ label, required, value, onChange, mode = 'date', error, hint, minimumDate, clearable }) {
  const s = useThemedStyles(makeStyles);
  const DS = useTheme().colors;
  const [show, setShow] = useState(false);
  const shown = value ? (mode === 'time' ? fmtTime(value) : fmtDate(value)) : '';
  return (
    <View style={{ marginBottom: 14, flex: 1 }}>
      <Text style={s.groupLabel}>{label}{required ? ' *' : ''}</Text>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setShow(true)}
        style={[s.selectWrap, { borderColor: error ? DS.coral : DS.border }]}>
        <Icon name={mode === 'time' ? 'clock-outline' : 'calendar-blank-outline'} size={16} color={DS.textMuted} />
        <Text style={[s.selectText, { marginLeft: 8 }, !shown && { color: DS.textMuted }]} numberOfLines={1}>
          {shown || (mode === 'time' ? 'Pick a time' : 'Pick a date')}
        </Text>
        {clearable && !!value ? (
          <TouchableOpacity onPress={() => onChange(null)} hitSlop={10}>
            <Icon name="close-circle" size={16} color={DS.textMuted} />
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
      <FieldNote error={error} hint={hint} />
      {show && (
        <DateTimePicker
          value={value ? new Date(value) : new Date()}
          mode={mode}
          display="default"
          minimumDate={minimumDate ? new Date(minimumDate) : undefined}
          onChange={(event, picked) => {
            setShow(false);
            if (event.type === 'set' && picked) onChange(picked.toISOString());
          }}
        />
      )}
    </View>
  );
}

/* ── Image picker tile ────────────────────────────────────────────────────── */
export function ImageField({ label, hint, uri, onPick, onClear, aspect = 1, busy }) {
  const s = useThemedStyles(makeStyles);
  const DS = useTheme().colors;
  return (
    <View style={{ flex: aspect === 1 ? 1 : 2 }}>
      <Text style={s.groupLabel}>{label}</Text>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPick}
        style={[s.imageTile, uri && { borderStyle: 'solid', borderColor: DS.lime, padding: 0 }]}>
        {uri ? (
          <>
            <Image source={{ uri }} style={s.imageFill} resizeMode="cover" />
            <TouchableOpacity style={s.imageClear} onPress={onClear} hitSlop={8}>
              <Icon name="close" size={13} color={DS.onLime} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Icon name={busy ? 'progress-upload' : 'tray-arrow-up'} size={20} color={DS.textMuted} />
            <Text style={s.imageHint}>{busy ? 'Uploading…' : hint || 'Tap to upload'}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

/* ── Reorderable list (tie-break priority) ────────────────────────────────── */
// Move-up / move-down rather than drag: a long-press drag inside a vertical
// ScrollView needs a gesture-handler list to disambiguate the two, and that is a
// lot of machinery for a five-item ordering. The arrows also say what the list
// IS — a priority order — which a drag handle leaves you to infer.
export function ReorderList({ label, items, onChange, hint, renderMeta }) {
  const s = useThemedStyles(makeStyles);
  const DS = useTheme().colors;
  const move = (i, dir) => {
    const next = [...items];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={s.groupLabel}>{label}</Text>
      {items.map((it, i) => (
        <View key={typeof it === 'string' ? it : it.value} style={s.reorderRow}>
          <View style={s.reorderRank}><Text style={s.reorderRankText}>{i + 1}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.reorderLabel}>{typeof it === 'string' ? it : it.label}</Text>
            {!!renderMeta && <Text style={s.reorderMeta}>{renderMeta(it)}</Text>}
          </View>
          <TouchableOpacity onPress={() => move(i, -1)} disabled={i === 0} hitSlop={6} style={s.reorderBtn}>
            <Icon name="chevron-up" size={18} color={i === 0 ? DS.faint : DS.textVariant} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => move(i, 1)} disabled={i === items.length - 1} hitSlop={6} style={s.reorderBtn}>
            <Icon name="chevron-down" size={18} color={i === items.length - 1 ? DS.faint : DS.textVariant} />
          </TouchableOpacity>
        </View>
      ))}
      <FieldNote hint={hint} />
    </View>
  );
}

// The numbers come from the creation design system now, not from this file.
//
// FormKit predates it and had picked its own: an 18 card beside the system's
// 16, a 14 field beside its 12, 54 and 50 tall controls beside one 48 minimum,
// and 13 / 14 / 14.5 / 15 / 16 doing what eight named type roles do. The
// BEHAVIOUR here is untouched — floating labels, the search sheet, the stepper,
// the date picker all work exactly as they did — but a tournament field and a
// Create Post field are now the same object to look at, which is the whole
// point of the exercise.
const makeStyles = (DS) => StyleSheet.create({
  card: {
    backgroundColor: DS.surface, borderRadius: RADIUS.card, borderWidth: 1, borderColor: DS.border,
    padding: SPACE.lg, marginBottom: SPACE.md,
    ...shadow(DS).card,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.md },
  cardIcon: {
    width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: DS.lime + '1f',
  },
  cardTitle: { ...TYPE.section, color: DS.textMuted },
  cardSub: { ...TYPE.helper, color: DS.textMuted, marginTop: 2 },

  fieldWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    minHeight: TAP, paddingHorizontal: SPACE.lg, paddingVertical: 6,
    borderRadius: RADIUS.field, borderWidth: 1.5, backgroundColor: DS.surfaceHigh,
  },
  floatLabel: { position: 'absolute', fontWeight: '700', letterSpacing: 0.3 },
  input: { padding: 0, paddingTop: 2, ...TYPE.input, color: DS.textPrimary },
  affix: { fontSize: 14, fontWeight: '800', color: DS.textMuted },
  counter: { fontSize: 10, fontWeight: '700', color: DS.textMuted },

  groupLabel: { ...TYPE.label, color: DS.textVariant, marginBottom: SPACE.sm },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, paddingHorizontal: 2 },
  note: { flex: 1, ...TYPE.helper, color: DS.textMuted },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    minHeight: 38, paddingHorizontal: SPACE.lg, borderRadius: RADIUS.pill,
    justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent', backgroundColor: DS.surfaceHigh,
  },
  chipText: { ...TYPE.chip, color: DS.textVariant },

  stepWrap: {
    flexDirection: 'row', alignItems: 'center', height: TAP,
    borderRadius: RADIUS.field, borderWidth: 1.5, backgroundColor: DS.surfaceHigh, paddingHorizontal: 6,
  },
  stepBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  stepValue: {
    flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: DS.textPrimary,
    padding: 0, fontVariant: ['tabular-nums'],
  },
  stepSuffix: { fontSize: 11, fontWeight: '700', color: DS.textMuted, marginRight: 4 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  toggleDivider: { borderBottomWidth: 1, borderBottomColor: DS.faint },
  toggleLabel: { ...TYPE.input, fontSize: 14, color: DS.textPrimary },
  toggleDesc: { ...TYPE.helper, color: DS.textMuted, marginTop: 2 },

  selectWrap: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, height: TAP, paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.field, borderWidth: 1.5, backgroundColor: DS.surfaceHigh,
  },
  selectText: { flex: 1, ...TYPE.input, color: DS.textPrimary },

  sheetBackdrop: { flex: 1, backgroundColor: '#0009' },
  sheet: {
    backgroundColor: DS.surfaceLow, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet,
    paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm, paddingBottom: SPACE.xxl,
  },
  sheetGrab: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: DS.faint, marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: DS.textPrimary, marginBottom: 12 },
  sheetEmpty: { fontSize: 13, fontWeight: '600', color: DS.textMuted, paddingVertical: 22, textAlign: 'center' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 14,
    borderRadius: 999, backgroundColor: DS.surfaceHigh, borderWidth: 1, borderColor: DS.border, marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '600', color: DS.textPrimary, padding: 0 },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: DS.faint,
  },
  optionText: { ...TYPE.input, color: DS.textPrimary },

  imageTile: {
    height: 92, borderRadius: RADIUS.field, borderWidth: 1.5, borderColor: DS.border, borderStyle: 'dashed',
    backgroundColor: DS.surfaceHigh, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  imageFill: { width: '100%', height: '100%' },
  imageClear: {
    position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: DS.lime, alignItems: 'center', justifyContent: 'center',
  },
  imageHint: { ...TYPE.helper, color: DS.textMuted, marginTop: 5 },

  reorderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 10,
    backgroundColor: DS.surfaceHigh, borderRadius: 12, marginBottom: 7,
    borderWidth: 1, borderColor: DS.border,
  },
  reorderRank: {
    width: 22, height: 22, borderRadius: 8, backgroundColor: DS.lime,
    alignItems: 'center', justifyContent: 'center',
  },
  reorderRankText: { fontSize: 11, fontWeight: '900', color: DS.onLime },
  reorderLabel: { fontSize: 13.5, fontWeight: '700', color: DS.textPrimary },
  reorderMeta: { fontSize: 10.5, fontWeight: '600', color: DS.textMuted, marginTop: 1 },
  reorderBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
});

// The creation component set. Four drawers, one vocabulary.
//
// Every one of these is presentational: it takes a value and an onChange and
// draws it in the system's spacing, type and colour. None of them know what a
// match or a tournament is, which is what lets Create Post, Create Match,
// Create Tournament and Create Ground differ only in which of these they use
// and in what order.
//
// Rules the set enforces so a screen cannot break them by accident:
//   · every interactive element is at least 48dp tall (TAP)
//   · focus is a lime border, error is a coral one, and a field cannot show
//     both — error wins, because it is the one that needs reading
//   · a press scales to 0.97 and back on the house spring
//   · labels, helpers and errors have one size each, from TYPE

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator, Image, Animated, Easing,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';
import { makeCreateStyles, SPACE, DURATION, PRESS_SCALE, TAP } from './tokens';

export * from './tokens';

/** The system's stylesheet, for a screen that needs a one-off layout view. */
export const useCreateStyles = () => useThemedStyles(makeCreateStyles);

// ── Press feedback ───────────────────────────────────────────────────────────
// One hand across the whole flow. Native driver, so it stays smooth while the
// keyboard is animating.
function usePress() {
  const scale = useRef(new Animated.Value(1)).current;
  const to = useCallback((v) => Animated.spring(scale, {
    toValue: v, useNativeDriver: true, speed: 40, bounciness: 0,
  }).start(), [scale]);
  return {
    scale,
    onPressIn: () => to(PRESS_SCALE),
    onPressOut: () => to(1),
  };
}

export function Pressable({ onPress, disabled, style, children, ...rest }) {
  const p = usePress();
  return (
    <Animated.View style={{ transform: [{ scale: p.scale }] }}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        disabled={disabled}
        onPressIn={p.onPressIn}
        onPressOut={p.onPressOut}
        style={style}
        {...rest}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Drawer header ────────────────────────────────────────────────────────────
export function DrawerHeader({ icon, title, subtitle, onClose, accent, right }) {
  const DS = useTheme().colors;
  const s = useCreateStyles();
  return (
    <View style={s.header}>
      {!!icon && (
        <View style={[s.headerIcon, { backgroundColor: (accent || DS.lime) + '1f' }]}>
          <Icon name={icon} size={22} color={accent || DS.lime} />
        </View>
      )}
      <View style={s.headerText}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={s.subtitle} numberOfLines={2}>{subtitle}</Text>}
      </View>
      {/* A screen-specific action — Create Tournament's Draft, for instance —
          sits inside the header rather than beside it, so all four drawers keep
          one header with one set of paddings. */}
      {right}
      {!!onClose && (
        <TouchableOpacity onPress={onClose} style={s.close}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button" accessibilityLabel="Close">
          <Icon name="close" size={20} color={DS.textVariant} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Grouping ─────────────────────────────────────────────────────────────────
export function SectionCard({ title, icon, children, style }) {
  const DS = useTheme().colors;
  const s = useCreateStyles();
  return (
    <View style={[s.card, style]}>
      {!!title && (
        <View style={s.sectionRow}>
          {!!icon && <Icon name={icon} size={14} color={DS.textMuted} />}
          <Text style={s.section}>{title}</Text>
        </View>
      )}
      {children}
    </View>
  );
}

// ── Field shell ──────────────────────────────────────────────────────────────
// Label, control, then helper OR error. Every field in every drawer is one of
// these, which is what keeps the four screens aligned to the pixel.
export function Field({ label, required, error, helper, last, children }) {
  const s = useCreateStyles();
  const DS = useTheme().colors;
  return (
    <View style={last ? s.fieldLast : s.field}>
      {!!label && (
        <Text style={s.label}>
          {label}{required ? <Text style={s.required}> *</Text> : null}
        </Text>
      )}
      {children}
      {error ? (
        <View style={s.errorRow}>
          <Icon name="alert-circle-outline" size={13} color={DS.coral} />
          <Text style={s.error}>{error}</Text>
        </View>
      ) : helper ? (
        <Text style={s.helper}>{helper}</Text>
      ) : null}
    </View>
  );
}

// ── Text ─────────────────────────────────────────────────────────────────────
export function TextField({
  label, required, error, helper, last, value, onChangeText, placeholder,
  multiline, Input = TextInput, ...rest
}) {
  const DS = useTheme().colors;
  const s = useCreateStyles();
  const [focused, setFocused] = useState(false);
  return (
    <Field label={label} required={required} error={error} helper={helper} last={last}>
      <Input
        style={[
          s.input,
          multiline && s.textarea,
          // Error wins over focus: a red field that turns green on focus hides
          // the thing the person needs to fix.
          focused && !error && s.inputFocused,
          !!error && s.inputError,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={DS.textMuted}
        multiline={multiline}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={label}
        {...rest}
      />
    </Field>
  );
}

export const TextArea = (props) => <TextField multiline {...props} />;

// ── A row that opens something ───────────────────────────────────────────────
export function SelectField({
  label, required, error, helper, last, value, placeholder, icon, onPress, chevron = true,
}) {
  const DS = useTheme().colors;
  const s = useCreateStyles();
  return (
    <Field label={label} required={required} error={error} helper={helper} last={last}>
      <Pressable
        onPress={onPress}
        style={[s.select, !!error && s.inputError]}
        accessibilityRole="button"
        accessibilityLabel={`${label || ''} ${value || placeholder || ''}`.trim()}>
        {!!icon && <Icon name={icon} size={18} color={DS.textMuted} />}
        <Text style={[s.selectText, !value && s.selectPlaceholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        {chevron && <Icon name="chevron-down" size={20} color={DS.textMuted} />}
      </Pressable>
    </Field>
  );
}

export const DateField = (props) => <SelectField icon="calendar-blank-outline" chevron={false} {...props} />;
export const TimeField = (props) => <SelectField icon="clock-outline" chevron={false} {...props} />;
export const LocationField = (props) => <SelectField icon="map-marker-outline" chevron={false} {...props} />;

// ── Chips ────────────────────────────────────────────────────────────────────
export function Chip({ label, icon, selected, onPress }) {
  const DS = useTheme().colors;
  const s = useCreateStyles();
  return (
    <Pressable
      onPress={onPress}
      style={[s.chip, selected && s.chipOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}>
      {!!icon && <Icon name={icon} size={15} color={selected ? DS.onLime : DS.textVariant} />}
      <Text style={[s.chipText, selected && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

/**
 * A row of choices. `options` is [{ value, label, icon }] or plain strings.
 * Single-select by default; `multi` keeps an array.
 */
export function ChipGroup({ label, required, error, helper, last, options, value, onChange, multi }) {
  const s = useCreateStyles();
  const norm = (o) => (typeof o === 'string' ? { value: o, label: o } : o);
  const isOn = (v) => (multi ? (value || []).includes(v) : value === v);
  const pick = (v) => {
    if (!multi) return onChange(value === v ? null : v);
    const arr = value || [];
    onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  };
  return (
    <Field label={label} required={required} error={error} helper={helper} last={last}>
      <View style={s.chipRow}>
        {(options || []).map(norm).map((o) => (
          <Chip key={String(o.value)} label={o.label} icon={o.icon}
            selected={isOn(o.value)} onPress={() => pick(o.value)} />
        ))}
      </View>
    </Field>
  );
}

// ── Toggle ───────────────────────────────────────────────────────────────────
export function Toggle({ title, hint, value, onChange }) {
  const DS = useTheme().colors;
  const s = useCreateStyles();
  return (
    <Pressable onPress={() => onChange(!value)} style={s.toggle}
      accessibilityRole="switch" accessibilityState={{ checked: !!value }}
      accessibilityLabel={title}>
      <Icon name={value ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24}
        color={value ? DS.lime : DS.textMuted} />
      <View style={s.toggleText}>
        <Text style={s.toggleTitle}>{title}</Text>
        {!!hint && <Text style={s.toggleHint}>{hint}</Text>}
      </View>
    </Pressable>
  );
}

// ── Images ───────────────────────────────────────────────────────────────────
/**
 * `mode="grid"` for several photos, `mode="banner"` for one cover.
 * `busy` draws the upload in progress on the tile itself rather than blocking
 * the form — you can keep typing while a photo uploads.
 */
export function ImagePickerField({
  label, required, error, helper, last, mode = 'grid', images = [], onAdd, onRemove, busy, max = 6,
}) {
  const DS = useTheme().colors;
  const s = useCreateStyles();
  const list = Array.isArray(images) ? images : [images].filter(Boolean);

  if (mode === 'banner') {
    const uri = list[0];
    return (
      <Field label={label} required={required} error={error} helper={helper} last={last}>
        <Pressable onPress={onAdd} style={s.banner} accessibilityRole="button"
          accessibilityLabel={uri ? 'Change image' : 'Add image'}>
          {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : (
            <>
              <Icon name={busy ? 'timer-sand' : 'image-plus'} size={26} color={DS.textMuted} />
              <Text style={s.imageAddText}>{busy ? 'Uploading…' : 'Add a cover image'}</Text>
            </>
          )}
          {busy && !!uri && (
            <View style={[s.imageRemove, { top: 8, right: 8, width: 26, height: 26, borderRadius: 13 }]}>
              <ActivityIndicator size="small" color="#fff" />
            </View>
          )}
        </Pressable>
      </Field>
    );
  }

  return (
    <Field label={label} required={required} error={error} helper={helper} last={last}>
      <View style={s.imageGrid}>
        {list.map((uri, i) => (
          <View key={`${uri}-${i}`} style={s.imageTile}>
            <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            {!!onRemove && (
              <TouchableOpacity style={s.imageRemove} onPress={() => onRemove(i)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`}>
                <Icon name="close" size={13} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        ))}
        {list.length < max && (
          <Pressable onPress={onAdd} style={s.imageAdd} accessibilityRole="button" accessibilityLabel="Add a photo">
            {busy ? <ActivityIndicator size="small" color={DS.lime} /> : (
              <>
                <Icon name="camera-plus-outline" size={22} color={DS.textMuted} />
                <Text style={s.imageAddText}>Add</Text>
              </>
            )}
          </Pressable>
        )}
      </View>
    </Field>
  );
}

// ── Buttons ──────────────────────────────────────────────────────────────────
/**
 * THE primary button. Every drawer submits with this one; only `label` differs.
 * On success it holds a tick for a beat before the caller dismisses, so the
 * drawer confirms rather than just vanishing.
 */
export function PrimaryButton({ label, icon = 'check', onPress, loading, disabled, done }) {
  const DS = useTheme().colors;
  const s = useCreateStyles();
  const off = disabled || loading;
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!done) return;
    pop.setValue(0);
    Animated.timing(pop, {
      toValue: 1, duration: DURATION.base, easing: Easing.out(Easing.back(2)), useNativeDriver: true,
    }).start();
  }, [done, pop]);

  return (
    <Pressable onPress={onPress} disabled={off}
      style={[s.primary, off && s.primaryOff]}
      accessibilityRole="button" accessibilityState={{ disabled: !!off, busy: !!loading }}
      accessibilityLabel={label}>
      {loading ? <ActivityIndicator color={DS.onLime} /> : done ? (
        <Animated.View style={{ transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }}>
          <Icon name="check-circle" size={22} color={DS.onLime} />
        </Animated.View>
      ) : (
        <>
          {!!icon && <Icon name={icon} size={19} color={DS.onLime} />}
          <Text style={s.primaryText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function SecondaryButton({ label, icon, onPress, disabled }) {
  const DS = useTheme().colors;
  const s = useCreateStyles();
  return (
    <Pressable onPress={onPress} disabled={disabled} style={s.secondary}
      accessibilityRole="button" accessibilityLabel={label}>
      {!!icon && <Icon name={icon} size={18} color={DS.textVariant} />}
      <Text style={s.secondaryText}>{label}</Text>
    </Pressable>
  );
}

/**
 * The action bar every drawer ends with. Sits outside the scroll view so it
 * cannot be scrolled away from, and pads itself for the home indicator.
 */
export function StickyFooter({ children, inset = 0 }) {
  const s = useCreateStyles();
  return <View style={[s.footer, { paddingBottom: SPACE.lg + inset }]}>{children}</View>;
}

// ── States ───────────────────────────────────────────────────────────────────
export function FormLoading({ label = 'Loading…' }) {
  const DS = useTheme().colors;
  const s = useCreateStyles();
  return (
    <View style={{ paddingVertical: SPACE.xxl, alignItems: 'center', gap: SPACE.md }}>
      <ActivityIndicator color={DS.lime} />
      <Text style={s.helper}>{label}</Text>
    </View>
  );
}

export function FormEmpty({ icon = 'inbox-outline', title, hint }) {
  const DS = useTheme().colors;
  const s = useCreateStyles();
  return (
    <View style={{ paddingVertical: SPACE.xl, alignItems: 'center', gap: SPACE.sm }}>
      <Icon name={icon} size={30} color={DS.textMuted} />
      <Text style={[s.toggleTitle, { textAlign: 'center' }]}>{title}</Text>
      {!!hint && <Text style={[s.helper, { textAlign: 'center' }]}>{hint}</Text>}
    </View>
  );
}

/** A form-level problem, above the button — not a field's own error. */
export function ValidationMessage({ message }) {
  const DS = useTheme().colors;
  const s = useCreateStyles();
  if (!message) return null;
  return (
    <View style={[s.errorRow, { justifyContent: 'center', marginTop: 0, marginBottom: SPACE.sm }]}>
      <Icon name="alert-circle-outline" size={14} color={DS.coral} />
      <Text style={s.error}>{message}</Text>
    </View>
  );
}

export { TAP };

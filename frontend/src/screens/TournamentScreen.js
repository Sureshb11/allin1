import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert,
  ActivityIndicator, useWindowDimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import { BottomSheetModal, BottomSheetScrollView, BottomSheetTextInput, BottomSheetBackdrop, BottomSheetFooter } from '@gorhom/bottom-sheet';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import legendsApi from '../services/LegendsApi';
import { getSelectedSport } from '../utils/selectedSport';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { useTabBarClearance, useDockLock } from '../components/AutoHideTabBar';
import { showToast } from '../components/Toast';
import { pickAndUploadImage } from '../utils/imageUpload';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import Reanimated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import {
  SectionCard, Field, ChoiceField, Stepper, ToggleRow, SelectField,
  DateField, ImageField, ReorderList,
} from '../components/FormKit';
import {
  DrawerHeader, PrimaryButton, SecondaryButton, StickyFooter, FormLoading, SPACE,
  useDrawerSheet, DRAWER_BACKDROP, FOOTER_CLEARANCE,
} from '../components/create';
import CoverFocusPicker from '../components/CoverFocusPicker';

// Create Tournament.
//
// Sixty-odd inputs across ten sections. Presented as one long form it is a wall
// that nobody finishes; presented as ten steps it is ten taps of ceremony. So:
// five steps, each holding the two sections that belong to the same decision —
// what it's called and who runs it, what's played and where, when and who can
// enter, how it's judged, what's at stake — and a review step that is the
// preview.
//
// Only twelve fields are actually required. Everything else has a defensible
// default already in the box (T20 → 20 overs → 4 overs a bowler → 2 points a
// win), so the fast path is: name it, name yourself, pick a venue, pick two
// dates, publish. The other fifty inputs are there for the organiser who wants
// them, not in the way of the one who doesn't.

const DRAFT_KEY = 'draft:createTournament';

const CATEGORIES = [
  { value: 'League', label: 'League', icon: 'format-list-numbered' },
  { value: 'Knockout', label: 'Knockout', icon: 'tournament' },
  { value: 'League + Knockout', label: 'League + KO', icon: 'sitemap-outline' },
  { value: 'Round Robin', label: 'Round Robin', icon: 'rotate-360' },
  { value: 'Double Elimination', label: 'Double Elim.', icon: 'call-split' },
  { value: 'Custom', label: 'Custom', icon: 'tune-variant' },
];

const BALL_TYPES = [
  { value: 'Leather', label: 'Leather Ball', icon: 'cricket' },
  { value: 'Tennis', label: 'Tennis Ball', icon: 'tennis-ball' },
  { value: 'Box', label: 'Box Cricket', icon: 'home-variant-outline' },
  { value: 'Soft', label: 'Soft Ball', icon: 'circle-outline' },
];

// Overs follow the format, so picking T10 doesn't leave 20 sitting in the box.
// Custom is the only one that hands the field back to you.
const FORMAT_OVERS = { T5: 5, T6: 6, T8: 8, T10: 10, T15: 15, T20: 20, ODI: 50, Test: 90 };
const FORMATS = ['T5', 'T6', 'T8', 'T10', 'T15', 'T20', 'ODI', 'Test', 'Custom'];

const REG_TYPES = [
  { value: 'open', label: 'Open', icon: 'door-open' },
  { value: 'invite', label: 'Invite Only', icon: 'email-lock' },
  { value: 'approval', label: 'Approval', icon: 'shield-check-outline' },
];

const MATCH_RULES = [
  { key: 'wide', label: 'Wide ball', desc: 'A wide costs a run and is re-bowled' },
  { key: 'noBall', label: 'No ball', desc: 'A no ball costs a run and is re-bowled' },
  { key: 'freeHit', label: 'Free hit', desc: 'Next delivery after a no ball — bowled/caught can’t get you out' },
  { key: 'legBye', label: 'Leg byes', desc: 'Runs off the body count to the team' },
  { key: 'bye', label: 'Byes', desc: 'Runs past the keeper count to the team' },
  { key: 'dls', label: 'DLS', desc: 'Rain-revised targets' },
  { key: 'superOver', label: 'Super over', desc: 'A tie is decided, not shared' },
  { key: 'powerplay', label: 'Powerplay', desc: 'Fielding restrictions for the opening overs' },
  { key: 'penaltyRuns', label: 'Penalty runs', desc: 'Umpires can award 5 for an infraction' },
];

const TIE_BREAKS = [
  { value: 'points', label: 'Points' },
  { value: 'nrr', label: 'Net Run Rate' },
  { value: 'h2h', label: 'Head-to-Head' },
  { value: 'wins', label: 'Wins' },
  { value: 'boundaries', label: 'Boundary Count' },
];

const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh', 'Delhi', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu & Kashmir', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal',
];
const COUNTRIES = [
  'India', 'Australia', 'Bangladesh', 'England', 'Ireland', 'New Zealand', 'Pakistan', 'Scotland',
  'South Africa', 'Sri Lanka', 'United Arab Emirates', 'United States', 'West Indies', 'Zimbabwe',
];
const CURRENCIES = [
  { value: 'INR', label: '₹  Indian Rupee (INR)' },
  { value: 'USD', label: '$  US Dollar (USD)' },
  { value: 'GBP', label: '£  Pound Sterling (GBP)' },
  { value: 'AUD', label: '$  Australian Dollar (AUD)' },
  { value: 'AED', label: 'د.إ UAE Dirham (AED)' },
  { value: 'LKR', label: 'Rs Sri Lankan Rupee (LKR)' },
  { value: 'PKR', label: 'Rs Pakistani Rupee (PKR)' },
  { value: 'BDT', label: '৳  Bangladeshi Taka (BDT)' },
  { value: 'NZD', label: '$  NZ Dollar (NZD)' },
  { value: 'ZAR', label: 'R  South African Rand (ZAR)' },
];
const CURRENCY_SIGN = { INR: '₹', USD: '$', GBP: '£', AUD: '$', AED: 'د.إ', LKR: 'Rs', PKR: 'Rs', BDT: '৳', NZD: '$', ZAR: 'R' };
const TIME_ZONES = [
  'Asia/Kolkata', 'Asia/Colombo', 'Asia/Karachi', 'Asia/Dhaka', 'Asia/Dubai', 'Asia/Singapore',
  'Australia/Sydney', 'Pacific/Auckland', 'Europe/London', 'America/New_York', 'Africa/Johannesburg',
];

const deviceZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'; } catch { return 'Asia/Kolkata'; }
};

// ICC: nobody bowls more than a fifth of the innings. The server enforces this
// too — this is the version that stops you typing 8 in a T20 in the first place.
const bowlerQuota = (overs) => (overs > 0 ? Math.ceil(Number(overs) / 5) : null);

const blank = () => ({
  name: '', shortName: '', description: '', logoUrl: '', banner: '',
  organizer: '', contact: { phone: '', email: '', website: '', whatsapp: '' },
  category: 'League', ballType: 'Leather', format: 'T20', overs: 20,
  venue: '', city: '', location: { ground: '', address: '', state: '', country: 'India' },
  startDate: null, endDate: null,
  regWindow: { opensAt: null, closesAt: null, startTime: null, timeZone: deviceZone() },
  maxTeams: 8,
  registration: {
    minTeams: 4, minPlayers: 11, maxPlayers: 16, playingXi: 11, substitutes: 4,
    entryFee: '', currency: 'INR', type: 'approval',
  },
  rules: {
    wide: true, noBall: true, freeHit: true, legBye: true, bye: true,
    dls: false, superOver: true, powerplay: true, penaltyRuns: true,
    powerplayOvers: 6, maxOversPerBowler: 4,
  },
  pointsRules: { win: 2, tie: 1, noResult: 1, loss: 0, bonus: false, tieBreak: TIE_BREAKS.map((t) => t.value) },
  prizes: { winner: '', runnerUp: '', semiFinal: '' },
  flags: { visibility: 'public', liveScore: true, teamRegistration: true, spectators: true },
  // Centre is what plain `cover` already does, so an untouched cover looks
  // exactly as it did before this existed.
  media: { bannerFocus: { x: 0.5, y: 0.5 } },
});

// Server row → form. The form keeps numbers as numbers and money as strings
// (the fields are text inputs), and a time as an ISO instant the picker can
// take, so this is where the shapes are reconciled rather than in ten places.
const timeToIso = (hhmm) => {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h)) return null;
  const d = new Date(); d.setHours(h, m || 0, 0, 0);
  return d.toISOString();
};
const fromTournament = (t) => {
  const b = blank();
  return {
    ...b,
    name: t.name || '', shortName: t.shortName || '', description: t.description || '',
    logoUrl: t.logoUrl || '', banner: t.banner || '',
    organizer: t.organizer || '',
    contact: { ...b.contact, ...(t.contact || {}) },
    category: t.category || b.category,
    ballType: t.ballType || b.ballType,
    format: t.format || b.format,
    overs: t.overs ?? b.overs,
    venue: t.venue || '', city: t.city || '',
    location: { ...b.location, ...(t.location || {}) },
    startDate: t.startDate || null, endDate: t.endDate || null,
    regWindow: {
      ...b.regWindow, ...(t.regWindow || {}),
      startTime: timeToIso(t.regWindow?.startTime),
    },
    maxTeams: t.maxTeams ?? b.maxTeams,
    registration: {
      ...b.registration, ...(t.registration || {}),
      entryFee: t.registration?.entryFee == null ? '' : String(t.registration.entryFee),
    },
    rules: { ...b.rules, ...(t.rules || {}) },
    pointsRules: { ...b.pointsRules, ...(t.pointsRules || {}) },
    prizes: { ...b.prizes, ...(t.prizes || {}) },
    flags: { ...b.flags, ...(t.flags || {}) },
    media: { ...b.media, ...(t.media || {}) },
  };
};

const STEPS = [
  { key: 'about', label: 'About', icon: 'trophy-outline' },
  { key: 'play', label: 'Format', icon: 'cricket' },
  { key: 'when', label: 'Schedule', icon: 'calendar-month-outline' },
  { key: 'rules', label: 'Rules', icon: 'gavel' },
  { key: 'review', label: 'Review', icon: 'check-decagram-outline' },
];

const digits = (s) => String(s || '').replace(/\D/g, '');
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
const dayOnly = (iso) => (iso ? new Date(iso).toDateString() : '');
const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function TournamentScreen({ navigation, route }) {
  // Same wizard, two jobs. With a tournamentId it loads that tournament into
  // the form and saves back to it — because a create screen that collects sixty
  // fields and no way to change any of them means a typo in the name is
  // permanent. Nothing below is duplicated for editing; only the load, the
  // button and the call differ.
  const editingId = route?.params?.tournamentId || null;
  const DS = useTheme().colors;
  const styles = useThemedStyles(makeStyles);
  const tabClear = useTabBarClearance();
  const drawerSheet = useDrawerSheet();

  // The dock stands down for the whole of this flow: a pushed, full-screen form
  // with its own header and its own submit, and the app's bottom navigation
  // floating over it is chrome between you and the keyboard. Locked rather than
  // scroll-hidden, so a scroll cannot bring it back mid-form; released on blur,
  // so backing out restores it.
  const lockDock = useDockLock();
  useFocusEffect(useCallback(() => {
    lockDock(true);
    return () => lockDock(false);
  }, [lockDock]));

  const { width } = useWindowDimensions();
  const wide = width >= 640;               // tablet / landscape: two columns

  const [step, setStep] = useState(0);
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [busy, setBusy] = useState(null);
  const [published, setPublished] = useState(false);  // 'publish' | 'draft' | 'logoUrl' | 'banner'
  const [loading, setLoading] = useState(!!editingId);
  const scrollRef = useRef(null);
  const dirty = useRef(false);
  
  const sheetRef = useRef(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      sheetRef.current?.present();
    }, 100);
    return () => clearTimeout(timer);
  }, []);
  const handleDismiss = useCallback(() => {
    navigation.goBack();
  }, [navigation]);
  const renderBackdrop = useCallback(
    (props) => <BottomSheetBackdrop {...props} {...DRAWER_BACKDROP} />,
    []
  );

  useLayoutEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);

  // The organiser is whoever is signed in — pre-filled rather than asked for,
  // and still editable for the secretary filling it in on someone's behalf.
  useEffect(() => {
    (async () => {
      if (editingId) {
        // An edit has no draft to restore and no organiser to guess — the
        // tournament already answers both.
        const res = await legendsApi.getTournament(editingId);
        setLoading(false);
        if (!res.success) return showToast(res.error || 'Could not load that tournament', 'error');
        setForm(fromTournament(res.data));
        return;
      }
      const [me, saved] = await Promise.all([
        legendsApi.getMe().catch(() => null),
        AsyncStorage.getItem(DRAFT_KEY).catch(() => null),
      ]);
      if (saved) {
        try {
          const draft = JSON.parse(saved);
          Alert.alert(
            'Unfinished tournament',
            `“${draft.form?.name || 'Untitled'}” was saved as a draft. Pick up where you left off?`,
            [
              { text: 'Start fresh', style: 'destructive', onPress: () => AsyncStorage.removeItem(DRAFT_KEY) },
              { text: 'Continue', onPress: () => { setForm({ ...blank(), ...draft.form }); setStep(draft.step || 0); } },
            ],
          );
        } catch { /* a corrupt draft is not worth a dialog */ }
      }
      if (me?.success) {
        const u = me.data?.user, p = me.data?.player;
        const name = `${u?.firstName || ''} ${u?.lastName || ''}`.trim() || p?.name || '';
        setForm((f) => (f.organizer || f.contact.phone ? f : {
          ...f,
          organizer: name,
          contact: { ...f.contact, phone: u?.phone || '', email: u?.email || '' },
        }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  /* ── setters ────────────────────────────────────────────────────────────── */
  const set = (patch) => { dirty.current = true; setForm((f) => ({ ...f, ...patch })); };
  const setIn = (block, patch) => { dirty.current = true; setForm((f) => ({ ...f, [block]: { ...f[block], ...patch } })); };
  const clearErr = (k) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  const err = (k) => (touched[k] || touched.__all ? errors[k] : undefined);
  const mark = (k) => setTouched((t) => ({ ...t, [k]: true }));

  const pickFormat = (f) => {
    const overs = FORMAT_OVERS[f];
    dirty.current = true;
    setForm((prev) => ({
      ...prev,
      format: f,
      overs: overs ?? prev.overs,
      // The bowler quota only follows the format while it still matches ICC —
      // an organiser who has deliberately set 3 in a T20 keeps their 3.
      rules: { ...prev.rules, maxOversPerBowler: overs ? bowlerQuota(overs) : prev.rules.maxOversPerBowler },
    }));
  };

  const pickImage = async (field) => {
    setBusy(field);
    const r = await pickAndUploadImage('tournaments');
    setBusy(null);
    if (r.url) set({ [field]: r.url });
    else if (r.error) showToast(r.error, 'error');
  };

  /* ── validation ─────────────────────────────────────────────────────────── */
  // Per step, so Next can refuse and point at the field rather than letting you
  // reach the end and be told the second screen was wrong.
  const validate = useMemo(() => (which) => {
    const e = {};
    const r = form.registration;
    const q = bowlerQuota(form.overs);

    if (which === 0 || which == null) {
      if (!form.name.trim()) e.name = 'A tournament needs a name';
      else if (form.name.trim().length < 3) e.name = 'Too short to tell tournaments apart';
      if (form.shortName && form.shortName.length > 10) e.shortName = 'Ten characters at most';
      if (!form.organizer.trim()) e.organizer = 'Who is running this?';
      const ph = digits(form.contact.phone);
      if (!ph) e.phone = 'Teams need a number to reach you on';
      else if (ph.length < 7 || ph.length > 15) e.phone = 'That doesn’t look like a phone number';
      if (form.contact.email && !isEmail(form.contact.email)) e.email = 'Check this email address';
    }
    if (which === 1 || which == null) {
      if (!form.category) e.category = 'Pick a structure';
      if (!form.ballType) e.ballType = 'Pick a ball';
      if (!form.format) e.format = 'Pick a format';
      if (!form.overs || Number(form.overs) < 1) e.overs = 'Overs per innings is required';
      else if (Number(form.overs) > 200) e.overs = 'That is not a cricket match';
      if (!form.venue.trim()) e.venue = 'Where is it being played?';
      if (!form.location.ground.trim()) e.ground = 'Which ground?';
      if (!form.city.trim()) e.city = 'City is required';
      if (!form.location.state) e.state = 'State is required';
      if (!form.location.country) e.country = 'Country is required';
    }
    if (which === 2 || which == null) {
      if (!form.startDate) e.startDate = 'When does it start?';
      if (!form.endDate) e.endDate = 'When does it finish?';
      if (form.startDate && form.endDate && new Date(form.endDate) < new Date(form.startDate))
        e.endDate = 'It cannot end before it starts';
      if (form.regWindow.opensAt && form.regWindow.closesAt
          && new Date(form.regWindow.closesAt) < new Date(form.regWindow.opensAt))
        e.regCloses = 'Registration cannot close before it opens';
      if (form.regWindow.closesAt && form.startDate
          && new Date(form.regWindow.closesAt) > new Date(form.startDate))
        e.regCloses = 'Registration has to close before the first match';
      if (!form.maxTeams) e.maxTeams = 'Maximum teams is required';
      if (r.minTeams && form.maxTeams && Number(r.minTeams) > Number(form.maxTeams))
        e.minTeams = 'More than the maximum';
      if (!r.minPlayers) e.minPlayers = 'Minimum squad size is required';
      if (!r.maxPlayers) e.maxPlayers = 'Maximum squad size is required';
      if (r.minPlayers && r.maxPlayers && Number(r.minPlayers) > Number(r.maxPlayers))
        e.minPlayers = 'More than the maximum';
      if (!r.playingXi) e.playingXi = 'Playing XI is required';
      else if (r.maxPlayers && Number(r.playingXi) > Number(r.maxPlayers))
        e.playingXi = 'Bigger than the squad it is picked from';
      if (r.entryFee !== '' && Number(r.entryFee) < 0) e.entryFee = 'An entry fee cannot be negative';
    }
    if (which === 3 || which == null) {
      if (q && form.rules.maxOversPerBowler > q)
        e.maxOversPerBowler = `ICC allows a fifth of the innings — ${q} over${q === 1 ? '' : 's'} at ${form.overs}`;
      if (form.rules.powerplay && form.rules.powerplayOvers > Number(form.overs))
        e.powerplayOvers = 'Longer than the innings';
    }
    return e;
  }, [form]);

  const stepErrors = (which) => validate(which);

  const goTo = (next) => {
    setStep(next);
    setTouched((t) => ({ ...t, __all: false }));
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const onNext = () => {
    const e = stepErrors(step);
    setErrors(e);
    if (Object.keys(e).length) {
      setTouched((t) => ({ ...t, __all: true }));
      showToast(e[Object.keys(e)[0]], 'error');
      return;
    }
    ReactNativeHapticFeedback.trigger('impactLight');
    goTo(Math.min(STEPS.length - 1, step + 1));
  };

  const onBack = () => (step === 0 ? confirmLeave() : goTo(step - 1));

  const confirmLeave = () => {
    if (!dirty.current) return navigation.goBack();
    if (editingId) {
      return Alert.alert('Discard changes?', 'The tournament stays as it was.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
      ]);
    }
    Alert.alert('Leave without publishing?', 'Save it as a draft and it will be waiting next time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: async () => { await AsyncStorage.removeItem(DRAFT_KEY); navigation.goBack(); } },
      { text: 'Save draft', onPress: () => saveDraft(true) },
    ]);
  };

  const saveDraft = async (leave) => {
    setBusy('draft');
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ form, step, savedAt: Date.now() }));
    setBusy(null);
    showToast('Draft saved on this device', 'success');
    if (leave) navigation.goBack();
  };

  /* ── publish ────────────────────────────────────────────────────────────── */
  const publish = async () => {
    const e = validate(null);
    setErrors(e);
    if (Object.keys(e).length) {
      setTouched((t) => ({ ...t, __all: true }));
      // Send them to the step that actually has the problem.
      const firstBad = [0, 1, 2, 3].find((i) => Object.keys(stepErrors(i)).length);
      goTo(firstBad ?? 0);
      showToast(e[Object.keys(e)[0]], 'error');
      return;
    }
    setBusy('publish');
    const r = form.registration;
    const startTime = form.regWindow.startTime
      ? new Date(form.regWindow.startTime).toTimeString().slice(0, 5)
      : undefined;

    const payload = {
      name: form.name.trim(),
      shortName: form.shortName.trim() || undefined,
      description: form.description.trim() || undefined,
      logoUrl: form.logoUrl || undefined,
      banner: form.banner || undefined,
      organizer: form.organizer.trim() || undefined,
      category: form.category,
      format: form.format,
      ballType: form.ballType,
      overs: Number(form.overs),
      venue: form.venue.trim(),
      city: form.city.trim(),
      maxTeams: Number(form.maxTeams),
      // The list card reads prizePool; the winner's prize is what it means.
      prizePool: form.prizes.winner.trim() || undefined,
      startDate: new Date(form.startDate).toISOString(),
      endDate: new Date(form.endDate).toISOString(),
      status: 'upcoming',
      // Without this the tournament is created as cricket and then never
      // appears in the (sport-filtered) list you created it from.
      sport: getSelectedSport().sport?.id,
      contact: {
        phone: digits(form.contact.phone) || undefined,
        email: form.contact.email.trim() || undefined,
        website: form.contact.website.trim() || undefined,
        whatsapp: digits(form.contact.whatsapp) || undefined,
      },
      location: {
        ground: form.location.ground.trim() || undefined,
        address: form.location.address.trim() || undefined,
        state: form.location.state || undefined,
        country: form.location.country || undefined,
      },
      regWindow: {
        opensAt: form.regWindow.opensAt ? new Date(form.regWindow.opensAt).toISOString() : undefined,
        closesAt: form.regWindow.closesAt ? new Date(form.regWindow.closesAt).toISOString() : undefined,
        startTime,
        timeZone: form.regWindow.timeZone,
      },
      registration: {
        minTeams: Number(r.minTeams) || undefined,
        minPlayers: Number(r.minPlayers),
        maxPlayers: Number(r.maxPlayers),
        playingXi: Number(r.playingXi),
        substitutes: Number(r.substitutes) || 0,
        entryFee: r.entryFee === '' ? undefined : Number(r.entryFee),
        currency: r.currency,
        type: r.type,
      },
      rules: form.rules,
      pointsRules: form.pointsRules,
      prizes: form.prizes,
      flags: form.flags,
      media: form.banner ? form.media : undefined,
    };
    // An edit keeps the tournament's own status and sport — those are decided
    // by where it is in its life, not by this form.
    if (editingId) { delete payload.status; delete payload.sport; }
    const res = editingId
      ? await legendsApi.updateTournament(editingId, payload)
      : await legendsApi.createTournament(payload);
    setBusy(null);
    if (!res.success) return showToast(res.error || (editingId ? 'Could not save' : 'Could not publish'), 'error');
    if (!editingId) await AsyncStorage.removeItem(DRAFT_KEY);
    dirty.current = false;
    showToast(editingId ? 'Changes saved' : 'Tournament published', 'success');
    // Hold the tick for a beat, like the other four, so publishing confirms
    // rather than the screen simply disappearing.
    setPublished(true);
    await new Promise((r) => setTimeout(r, 450));
    // Back to the Tournaments list, which reloads on focus. goBack rather than
    // navigate, so the stack doesn't end up holding two copies of that list.
    navigation.goBack();
  };

  /* ── steps ──────────────────────────────────────────────────────────────── */
  const quota = bowlerQuota(form.overs);
  const sign = CURRENCY_SIGN[form.registration.currency] || '';

  const stepAbout = (
    <>
      <SectionCard title="Basic information" subtitle="What it's called, and how it looks" icon="trophy-outline">
        <Field label="Tournament name" required value={form.name}
               onChangeText={(t) => { set({ name: t }); clearErr('name'); }}
               onBlur={() => mark('name')} error={err('name')} maxLength={80} />
        <Field label="Short name" value={form.shortName} maxLength={10}
               onChangeText={(t) => { set({ shortName: t }); clearErr('shortName'); }}
               onBlur={() => mark('shortName')} error={err('shortName')}
               hint="Used where there's no room for the full name — scoreboards, fixture lists" />
        <Field label="Description" value={form.description} multiline
               onChangeText={(t) => set({ description: t })} maxLength={500} />
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 2, marginBottom: 14 }}>
          <ImageField label="Logo" uri={form.logoUrl} busy={busy === 'logoUrl'}
                      onPick={() => pickImage('logoUrl')} onClear={() => set({ logoUrl: '' })} />
          <ImageField label="Banner" aspect={2} hint="Wide cover image" uri={form.banner} busy={busy === 'banner'}
                      onPick={() => pickImage('banner')} onClear={() => set({ banner: '' })} />
        </View>
        {/* Only once there's a cover to frame. */}
        <CoverFocusPicker
          uri={form.banner}
          focus={form.media?.bannerFocus}
          onChange={(f) => setIn('media', { bannerFocus: f })} />
      </SectionCard>

      <SectionCard title="Organizer" subtitle="Shown to teams asking about entry" icon="account-tie-outline">
        <Field label="Organizer name" required value={form.organizer}
               onChangeText={(t) => { set({ organizer: t }); clearErr('organizer'); }}
               onBlur={() => mark('organizer')} error={err('organizer')} />
        <Row wide={wide}>
          <Field label="Mobile number" required keyboardType="phone-pad" value={form.contact.phone}
                 onChangeText={(t) => { setIn('contact', { phone: t }); clearErr('phone'); }}
                 onBlur={() => mark('phone')} error={err('phone')} />
          <Field label="WhatsApp number" keyboardType="phone-pad" value={form.contact.whatsapp}
                 onChangeText={(t) => setIn('contact', { whatsapp: t })} />
        </Row>
        <Field label="Email address" keyboardType="email-address" autoCapitalize="none" value={form.contact.email}
               onChangeText={(t) => { setIn('contact', { email: t }); clearErr('email'); }}
               onBlur={() => mark('email')} error={err('email')} />
        <Field label="Website" autoCapitalize="none" value={form.contact.website}
               onChangeText={(t) => setIn('contact', { website: t })} />
        <View style={styles.privacyNote}>
          <Icon name="lock-outline" size={13} color={DS.textMuted} />
          <Text style={styles.privacyText}>Contact details are shown to signed-in players only.</Text>
        </View>
      </SectionCard>
    </>
  );

  const stepPlay = (
    <>
      <SectionCard title="Tournament details" subtitle="How it's structured and what's played" icon="cricket">
        
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: DS.textMuted, marginBottom: 8, marginLeft: 4 }}>CATEGORY <Text style={{ color: DS.lime }}>*</Text></Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {CATEGORIES.map(c => {
              const active = c.value === form.category;
              return (
                <TouchableOpacity
                  key={c.value}
                  onPress={() => { set({ category: c.value }); clearErr('category'); }}
                  activeOpacity={0.8}
                  style={[{
                    width: '48%',
                    backgroundColor: active ? DS.lime + '20' : DS.surfaceHigh,
                    borderRadius: 14,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: active ? DS.lime : DS.border,
                    alignItems: 'flex-start',
                    gap: 12
                  }]}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: active ? DS.lime : DS.surfaceHighest, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={c.icon} size={18} color={active ? DS.bg : DS.textMuted} />
                  </View>
                  <Text style={{ color: active ? DS.textPrimary : DS.textVariant, fontSize: 14, fontWeight: active ? '800' : '600' }}>{c.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          {err('category') && <Text style={{ color: '#ff4444', fontSize: 12, marginTop: 6, marginLeft: 4 }}>{err('category')}</Text>}
        </View>

        <ChoiceField label="Cricket type" required options={BALL_TYPES} value={form.ballType}
                     onChange={(v) => { set({ ballType: v }); clearErr('ballType'); }} error={err('ballType')} />
        <ChoiceField label="Match format" required options={FORMATS} value={form.format}
                     onChange={pickFormat} error={err('format')} />
        <Stepper label="Overs per innings" required value={form.overs} min={1} max={200}
                 onChange={(v) => {
                   dirty.current = true;
                   setForm((f) => ({ ...f, overs: v, format: FORMAT_OVERS[f.format] === v ? f.format : 'Custom' }));
                   clearErr('overs');
                 }}
                 error={err('overs')}
                 hint={quota ? `A bowler may bowl up to ${quota} of them` : undefined} />
      </SectionCard>

      <SectionCard title="Venue" subtitle="Where it's played" icon="map-marker-outline">
        <Row wide={wide}>
          <Field label="Venue name" required value={form.venue}
                 onChangeText={(t) => { set({ venue: t }); clearErr('venue'); }}
                 onBlur={() => mark('venue')} error={err('venue')} />
          <Field label="Ground name" required value={form.location.ground}
                 onChangeText={(t) => { setIn('location', { ground: t }); clearErr('ground'); }}
                 onBlur={() => mark('ground')} error={err('ground')} />
        </Row>
        <Field label="Address" value={form.location.address} multiline
               onChangeText={(t) => setIn('location', { address: t })} />
        <Row wide={wide}>
          <Field label="City" required value={form.city}
                 onChangeText={(t) => { set({ city: t }); clearErr('city'); }}
                 onBlur={() => mark('city')} error={err('city')} />
          <SelectField label="State" required value={form.location.state} options={STATES}
                       onChange={(v) => { setIn('location', { state: v }); mark('state'); clearErr('state'); }}
                       error={err('state')} />
        </Row>
        <SelectField label="Country" required value={form.location.country} options={COUNTRIES}
                     onChange={(v) => { setIn('location', { country: v }); clearErr('country'); }}
                     error={err('country')} />
      </SectionCard>
    </>
  );

  const stepWhen = (
    <>
      <SectionCard title="Schedule" subtitle="Registration window and playing dates" icon="calendar-month-outline">
        <Row wide={wide}>
          <DateField label="Registration opens" value={form.regWindow.opensAt} clearable
                     onChange={(v) => setIn('regWindow', { opensAt: v })} />
          <DateField label="Registration closes" value={form.regWindow.closesAt} clearable
                     error={err('regCloses')} minimumDate={form.regWindow.opensAt}
                     onChange={(v) => { setIn('regWindow', { closesAt: v }); clearErr('regCloses'); }} />
        </Row>
        <Row wide={wide}>
          <DateField label="Starts" required value={form.startDate} error={err('startDate')}
                     onChange={(v) => { set({ startDate: v }); mark('startDate'); clearErr('startDate'); }} />
          <DateField label="Ends" required value={form.endDate} error={err('endDate')} minimumDate={form.startDate}
                     onChange={(v) => { set({ endDate: v }); mark('endDate'); clearErr('endDate'); }} />
        </Row>
        <Row wide={wide}>
          <DateField label="Match start time" mode="time" clearable value={form.regWindow.startTime}
                     onChange={(v) => setIn('regWindow', { startTime: v })} />
          <SelectField label="Time zone" value={form.regWindow.timeZone} options={TIME_ZONES}
                       onChange={(v) => setIn('regWindow', { timeZone: v })} />
        </Row>
      </SectionCard>

      <SectionCard title="Team registration" subtitle="Who can enter, and with how many" icon="account-group-outline">
        <Row wide={wide}>
          <Stepper label="Minimum teams" value={form.registration.minTeams} min={2} max={128}
                   onChange={(v) => { setIn('registration', { minTeams: v }); clearErr('minTeams'); }}
                   error={err('minTeams')} />
          <Stepper label="Maximum teams" required value={form.maxTeams} min={2} max={128}
                   onChange={(v) => { set({ maxTeams: v }); clearErr('maxTeams'); clearErr('minTeams'); }}
                   error={err('maxTeams')} />
        </Row>
        <Row wide={wide}>
          <Stepper label="Minimum players" required value={form.registration.minPlayers} min={2} max={30}
                   onChange={(v) => { setIn('registration', { minPlayers: v }); clearErr('minPlayers'); }}
                   error={err('minPlayers')} />
          <Stepper label="Maximum players" required value={form.registration.maxPlayers} min={2} max={30}
                   onChange={(v) => { setIn('registration', { maxPlayers: v }); clearErr('maxPlayers'); clearErr('playingXi'); }}
                   error={err('maxPlayers')} />
        </Row>
        <Row wide={wide}>
          <Stepper label="Playing XI" required value={form.registration.playingXi} min={2} max={30}
                   onChange={(v) => { setIn('registration', { playingXi: v }); clearErr('playingXi'); }}
                   error={err('playingXi')} hint="On the field at any one time" />
          <Stepper label="Substitutes" value={form.registration.substitutes} min={0} max={20}
                   onChange={(v) => setIn('registration', { substitutes: v })} />
        </Row>
        <Row wide={wide}>
          <Field label="Entry fee" keyboardType="number-pad" prefix={sign} value={form.registration.entryFee}
                 onChangeText={(t) => { setIn('registration', { entryFee: t.replace(/[^\d]/g, '') }); clearErr('entryFee'); }}
                 error={err('entryFee')} hint="Leave empty for a free tournament" />
          <SelectField label="Currency" value={form.registration.currency} options={CURRENCIES}
                       onChange={(v) => setIn('registration', { currency: v })} />
        </Row>
        <ChoiceField label="Registration type" options={REG_TYPES} value={form.registration.type}
                     onChange={(v) => setIn('registration', { type: v })}
                     hint={form.registration.type === 'open' ? 'Any team can join without asking'
                       : form.registration.type === 'invite' ? 'Only teams you invite can enter'
                         : 'Teams request to join and you approve each one'} />
      </SectionCard>
    </>
  );

  const stepRules = (
    <>
      <SectionCard title="Match rules" subtitle="What the scorer can record" icon="gavel">
        {MATCH_RULES.map((r, i) => (
          <ToggleRow key={r.key} label={r.label} description={r.desc} value={form.rules[r.key]}
                     last={i === MATCH_RULES.length - 1}
                     onChange={(v) => setIn('rules', { [r.key]: v })} />
        ))}
        <View style={{ height: 14 }} />
        <Row wide={wide}>
          <Stepper label="Powerplay overs" value={form.rules.powerplayOvers} min={0} max={Number(form.overs) || 50}
                   onChange={(v) => { setIn('rules', { powerplayOvers: v }); clearErr('powerplayOvers'); }}
                   error={err('powerplayOvers')} />
          <Stepper label="Max overs per bowler" value={form.rules.maxOversPerBowler} min={1} max={Number(form.overs) || 50}
                   onChange={(v) => { setIn('rules', { maxOversPerBowler: v }); clearErr('maxOversPerBowler'); }}
                   error={err('maxOversPerBowler')}
                   hint={quota ? `ICC limit at ${form.overs} overs: ${quota}` : undefined} />
        </Row>
      </SectionCard>

      <SectionCard title="Points system" subtitle="How the table is built" icon="format-list-numbered">
        <Row wide={wide}>
          <Stepper label="Win" value={form.pointsRules.win} min={0} max={20} onChange={(v) => setIn('pointsRules', { win: v })} />
          <Stepper label="Tie" value={form.pointsRules.tie} min={0} max={20} onChange={(v) => setIn('pointsRules', { tie: v })} />
        </Row>
        <Row wide={wide}>
          <Stepper label="No result" value={form.pointsRules.noResult} min={0} max={20} onChange={(v) => setIn('pointsRules', { noResult: v })} />
          <Stepper label="Loss" value={form.pointsRules.loss} min={0} max={20} onChange={(v) => setIn('pointsRules', { loss: v })} />
        </Row>
        <ToggleRow label="Bonus point" icon="star-outline" value={form.pointsRules.bonus} last
                   description="An extra point for a big win"
                   onChange={(v) => setIn('pointsRules', { bonus: v })} />
        <View style={{ height: 14 }} />
        <ReorderList
          label="Tie-break priority"
          items={TIE_BREAKS.filter((t) => form.pointsRules.tieBreak.includes(t.value))
            .sort((a, b) => form.pointsRules.tieBreak.indexOf(a.value) - form.pointsRules.tieBreak.indexOf(b.value))}
          onChange={(items) => setIn('pointsRules', { tieBreak: items.map((i) => i.value) })}
          hint="Applied in order until the tie is broken" />
      </SectionCard>
    </>
  );

  const summary = [
    { step: 0, title: 'Basics', rows: [
      ['Name', form.name || '—'],
      ['Short name', form.shortName || '—'],
      ['Organizer', form.organizer || '—'],
      ['Contact', digits(form.contact.phone) || '—'],
    ] },
    { step: 1, title: 'Format & venue', rows: [
      ['Category', form.category],
      ['Ball', (BALL_TYPES.find((b) => b.value === form.ballType) || {}).label || form.ballType],
      ['Format', `${form.format} · ${form.overs} overs`],
      ['Venue', [form.location.ground, form.venue].filter(Boolean).join(', ') || '—'],
      ['City', [form.city, form.location.state].filter(Boolean).join(', ') || '—'],
    ] },
    { step: 2, title: 'Schedule & entry', rows: [
      ['Dates', `${fmtDay(form.startDate)} → ${fmtDay(form.endDate)}`],
      ['Registration', form.regWindow.closesAt ? `closes ${fmtDay(form.regWindow.closesAt)}` : 'no deadline'],
      ['Teams', `${form.registration.minTeams || '?'}–${form.maxTeams}`],
      ['Squad', `${form.registration.minPlayers}–${form.registration.maxPlayers}, XI of ${form.registration.playingXi}`],
      ['Entry fee', form.registration.entryFee === '' ? 'Free' : `${sign}${form.registration.entryFee}`],
      ['Joining', (REG_TYPES.find((t) => t.value === form.registration.type) || {}).label],
    ] },
    { step: 3, title: 'Rules & points', rows: [
      ['Enabled', MATCH_RULES.filter((r) => form.rules[r.key]).length + ' of ' + MATCH_RULES.length + ' rules'],
      ['Powerplay', form.rules.powerplay ? `${form.rules.powerplayOvers} overs` : 'off'],
      ['Bowler quota', `${form.rules.maxOversPerBowler} overs`],
      ['Points', `${form.pointsRules.win} / ${form.pointsRules.tie} / ${form.pointsRules.noResult} / ${form.pointsRules.loss}`],
      ['First tie-break', (TIE_BREAKS.find((t) => t.value === form.pointsRules.tieBreak[1]) || {}).label || '—'],
    ] },
  ];

  const stepReview = (
    <>
      <SectionCard title="Prize details" subtitle="Optional — shown on the tournament card" icon="medal-outline">
        <Field label="Winner" prefix={sign} keyboardType="number-pad" value={form.prizes.winner}
               onChangeText={(t) => setIn('prizes', { winner: t })} />
        <Row wide={wide}>
          <Field label="Runner-up" prefix={sign} keyboardType="number-pad" value={form.prizes.runnerUp}
                 onChangeText={(t) => setIn('prizes', { runnerUp: t })} />
          <Field label="Semi-finalist" prefix={sign} keyboardType="number-pad" value={form.prizes.semiFinal}
                 onChangeText={(t) => setIn('prizes', { semiFinal: t })} />
        </Row>
      </SectionCard>

      <SectionCard title="Visibility" subtitle="Who can see it and what they can do" icon="eye-outline">
        <ChoiceField label="Listing" options={[
          { value: 'public', label: 'Public', icon: 'earth' },
          { value: 'private', label: 'Private', icon: 'lock-outline' },
        ]} value={form.flags.visibility} onChange={(v) => setIn('flags', { visibility: v })}
           hint={form.flags.visibility === 'public'
             ? 'Anyone can find it in the tournaments list'
             : 'Only people with the link or an invite can see it'} />
        <ToggleRow label="Live score" icon="broadcast" value={form.flags.liveScore}
                   description="Followers can watch the ball-by-ball as it happens"
                   onChange={(v) => setIn('flags', { liveScore: v })} />
        <ToggleRow label="Team registration" icon="account-multiple-plus-outline" value={form.flags.teamRegistration}
                   description="Teams can request to join from the tournament page"
                   onChange={(v) => setIn('flags', { teamRegistration: v })} />
        <ToggleRow label="Spectators" icon="account-eye-outline" value={form.flags.spectators} last
                   description="Non-players can follow and comment"
                   onChange={(v) => setIn('flags', { spectators: v })} />
      </SectionCard>

      {/* The preview: the card this tournament becomes, then everything else in
          a form you can actually read back — each block jumping to its step. */}
      <SectionCard title="Preview" subtitle="How it will appear in the tournaments list" icon="cellphone-information">
        <View style={styles.previewCard}>
          <View style={[styles.previewBanner, form.banner ? null : { backgroundColor: DS.surfaceHighest }]}>
            {!!form.banner && <View style={styles.previewBannerFill} />}
            <View style={styles.previewBadge}>
              <Text style={styles.previewBadgeText}>UPCOMING</Text>
            </View>
          </View>
          <View style={{ padding: 12, gap: 4 }}>
            <Text style={styles.previewName} numberOfLines={1}>{form.name || 'Untitled tournament'}</Text>
            <Text style={styles.previewMeta} numberOfLines={1}>
              {[form.category, `${form.format} · ${form.overs} ov`, form.city].filter(Boolean).join('  ·  ')}
            </Text>
            <View style={styles.previewFoot}>
              <Icon name="calendar-blank-outline" size={12} color={DS.textMuted} />
              <Text style={styles.previewFootText}>
                {form.startDate ? fmtDay(form.startDate) : 'Dates not set'}
                {form.endDate && dayOnly(form.endDate) !== dayOnly(form.startDate) ? ` – ${fmtDay(form.endDate)}` : ''}
              </Text>
              <View style={{ flex: 1 }} />
              <Icon name="account-group-outline" size={12} color={DS.textMuted} />
              <Text style={styles.previewFootText}>Up to {form.maxTeams}</Text>
            </View>
          </View>
        </View>
      </SectionCard>

      {summary.map((block) => (
        <SectionCard key={block.title} title={block.title} icon="checkbox-marked-circle-outline"
          right={
            <TouchableOpacity onPress={() => goTo(block.step)} hitSlop={8} style={styles.editLink}>
              <Icon name="pencil-outline" size={13} color={DS.lime} />
              <Text style={styles.editLinkText}>Edit</Text>
            </TouchableOpacity>
          }>
          {block.rows.map(([k, v]) => (
            <View key={k} style={styles.sumRow}>
              <Text style={styles.sumKey}>{k}</Text>
              <Text style={styles.sumVal} numberOfLines={2}>{String(v)}</Text>
            </View>
          ))}
        </SectionCard>
      ))}
    </>
  );

  const body = [stepAbout, stepPlay, stepWhen, stepRules, stepReview][step];
  const last = step === STEPS.length - 1;

  // The action bar is pinned by the sheet itself. It used to be a plain View
  // after the scroll view, which only stays put if the layout above it
  // cooperates — inside a bottom sheet it drifted with the content. This is the
  // same footerComponent the other four drawers use, so all five now end in a
  // bar that cannot be scrolled away from and that rides above the keyboard.
  //
  // Back and Continue are the system's Secondary and Primary buttons: on the
  // last step Continue becomes Create, and only the words change.
  const renderStepFooter = useCallback((props) => (
    <BottomSheetFooter {...props} bottomInset={0}>
      <StickyFooter>
        <View style={{ flexDirection: 'row', gap: SPACE.md }}>
          {/* No Cancel. On the first step it duplicated the X in the header —
              two ways to leave, side by side, one of them taking a third of the
              action bar from the button people actually came to press. Back
              appears once there is a step to go back to. */}
          {step > 0 && (
            <View style={{ width: 112 }}>
              <SecondaryButton label="Back" icon="chevron-left" onPress={onBack} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <PrimaryButton
              label={last ? (editingId ? 'Save Changes' : 'Create Tournament') : 'Continue'}
              icon={last ? 'trophy-outline' : 'chevron-right'}
              loading={busy === 'publish'}
              done={published}
              onPress={last ? publish : onNext}
            />
          </View>
        </View>
      </StickyFooter>
    </BottomSheetFooter>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [step, last, editingId, busy, published, tabClear, onBack, onNext, publish]);

  if (loading) {
    // The system's loading state, which says what is loading. A bare spinner
    // says something is happening and leaves you to guess what.
    return (
      <View style={[styles.container, { justifyContent: 'center' }]}>
        <FormLoading label="Loading this tournament…" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BottomSheetModal
        {...drawerSheet}
        ref={sheetRef}
        onDismiss={handleDismiss}
        backdropComponent={renderBackdrop}
        footerComponent={renderStepFooter}
      >
      {/* Header: the shared drawer header, with Draft as its one screen-specific
          action. A draft is for work that has not been published; an edit is
          already published, so there is nothing to keep on the device. */}
      <DrawerHeader
        icon="trophy-outline"
        title={editingId ? 'Edit Tournament' : 'Create Tournament'}
        subtitle={`Step ${step + 1} of ${STEPS.length} · ${STEPS[step].label}`}
        onClose={confirmLeave}
        right={!editingId ? (
          // An icon, not a labelled pill. "Draft" plus its border took about
          // ninety points out of a header that also carries a 40pt icon and a
          // close button — which is why the title read "Create Tourna…". The
          // action is unchanged and the label moves to the screen reader.
          <TouchableOpacity onPress={() => saveDraft(false)} disabled={busy === 'draft'}
            style={styles.draftBtn}
            accessibilityRole="button" accessibilityLabel="Save as draft">
            {busy === 'draft'
              ? <ActivityIndicator size="small" color={DS.lime} />
              : <Icon name="content-save-outline" size={19} color={DS.lime} />}
          </TouchableOpacity>
        ) : null}
      />

      {/* Progress. Tappable backwards only — jumping ahead past a required field
          is how you end up publishing something half-filled. */}
      
      <View style={styles.progressRow}>
        {STEPS.map((s, i) => {
          const done = i < step, here = i === step;
          return (
            <TouchableOpacity key={s.key} style={{ flex: 1 }} activeOpacity={done ? 0.7 : 1}
                              onPress={() => done && goTo(i)}>
              <View style={[styles.progressBar, (done || here) && { backgroundColor: DS.lime, shadowColor: DS.lime, shadowOpacity: 0.5, shadowRadius: 6, elevation: 4 }]} />
              <View style={styles.progressLabelRow}>
                <Icon name={done ? 'check-circle' : s.icon} size={11}
                      color={done || here ? DS.lime : DS.textMuted} />
                <Text style={[styles.progressLabel, (done || here) && { color: DS.lime }]} numberOfLines={1}>
                  {s.label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <BottomSheetScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, paddingBottom: FOOTER_CLEARANCE }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}>
        {body}
        {last && (
          <View style={styles.legalNote}>
            <Icon name="information-outline" size={13} color={DS.textMuted} />
            <Text style={styles.legalText}>
              Publishing opens the tournament to teams. Once a team is approved it stays in for the
              duration — a side that doesn’t appear forfeits that match rather than withdrawing.
            </Text>
          </View>
        )}
      </BottomSheetScrollView>

      </BottomSheetModal>
    </View>
  );
}

// Two fields side by side on a tablet, stacked on a phone. Declared here rather
// than imported so the breakpoint decision stays with the screen that makes it.
function Row({ children, wide }) {
  const kids = Array.isArray(children) ? children : [children];
  if (!wide) return <>{kids}</>;
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      {kids.map((c, i) => <View key={i} style={{ flex: 1 }}>{c}</View>)}
    </View>
  );
}

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, backgroundColor: DS.surfaceLow,
  },
  iconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: DS.surfaceHigh },
  headerTitle: { fontSize: 18, fontWeight: '900', color: DS.textPrimary, letterSpacing: 0.2 },
  headerSub: { fontSize: 11, fontWeight: '700', color: DS.textMuted, marginTop: 1 },
  draftBtn: {
    width: 40, height: 40, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: DS.lime, backgroundColor: 'transparent',
  },

  progressRow: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingBottom: 12,
    backgroundColor: DS.surfaceLow, borderBottomWidth: 1, borderBottomColor: DS.faint,
  },
  progressBar: { height: 3, borderRadius: 2, backgroundColor: DS.faint },
  progressLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 5 },
  progressLabel: { flex: 1, fontSize: 9.5, fontWeight: '800', color: DS.textMuted, letterSpacing: 0.2 },

  privacyNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  privacyText: { flex: 1, fontSize: 11, fontWeight: '600', color: DS.textMuted },

  editLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editLinkText: { fontSize: 12, fontWeight: '800', color: DS.lime },
  sumRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 6 },
  sumKey: { width: 104, fontSize: 12, fontWeight: '700', color: DS.textMuted },
  sumVal: { flex: 1, fontSize: 13, fontWeight: '700', color: DS.textPrimary, textAlign: 'right' },

  previewCard: {
    borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: DS.border, backgroundColor: DS.surfaceHigh,
  },
  previewBanner: { height: 74, backgroundColor: DS.lime + '33', justifyContent: 'flex-start', alignItems: 'flex-start', padding: 8 },
  previewBannerFill: { ...StyleSheet.absoluteFillObject, backgroundColor: DS.lime + '22' },
  previewBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: DS.lime },
  previewBadgeText: { fontSize: 9, fontWeight: '900', color: DS.onLime, letterSpacing: 0.6 },
  previewName: { fontSize: 15, fontWeight: '900', color: DS.textPrimary },
  previewMeta: { fontSize: 11.5, fontWeight: '700', color: DS.textVariant },
  previewFoot: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  previewFootText: { fontSize: 10.5, fontWeight: '700', color: DS.textMuted },

  legalNote: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    paddingHorizontal: 4, paddingVertical: 6, marginBottom: 4, marginTop: 16,
  },
  legalText: { flex: 1, fontSize: 11, fontWeight: '600', color: DS.textMuted, lineHeight: 15 },

  submitBtn: {
    backgroundColor: DS.lime,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    marginBottom: 40
  },
  submitBtnText: {
    color: DS.bg,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.2
  },
});

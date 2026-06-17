// Entitlements singleton — mirrors the backend /users/me `entitlements`.
// UX-only gating (the API is the real enforcement). TODAY everything is unlocked
// (free tier = all features), so can()/limit() pass through. When Pro launches the
// backend tightens the free tier and this updates automatically on the next getMe().
//
// Note: JSON has no Infinity, so the API serializes unlimited numeric limits as null;
// we treat null/undefined as unlimited.

const DEFAULTS = { plan: 'free', historyDays: null, stats: true, insights: true, savedGames: null, adFree: true, export: true };
let _ent = { ...DEFAULTS };

export const setEntitlements = (e) => { _ent = { ...DEFAULTS, ...(e || {}) }; };
export const getEntitlements = () => _ent;
export const isPro = () => _ent.plan === 'pro';

// Whole-feature boolean gate. Unknown/true/limited-but-allowed → true.
export const can = (feature) => _ent[feature] !== false && _ent[feature] !== 0;

// Numeric limit for a feature; null/undefined = unlimited.
export const limit = (feature) => {
  const v = _ent[feature];
  return v == null ? Infinity : v;
};

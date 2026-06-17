// Entitlements — the single source of truth for free vs pro feature limits.
//
// TODAY: both tiers return everything unlocked, so nothing is gated. To launch Pro
// later, just tighten the `free` row (e.g. historyDays: 30, stats: false) and wire
// billing to set user.plan = 'pro'. No endpoint/screen refactors needed — every check
// reads entitlementsFor(user).
//
// Numbers use Infinity = unlimited; booleans gate a whole feature.

const TIERS = {
  free: { historyDays: Infinity, stats: true, insights: true, savedGames: Infinity, adFree: true, export: true },
  pro:  { historyDays: Infinity, stats: true, insights: true, savedGames: Infinity, adFree: true, export: true },
};

export function entitlementsFor(user) {
  const isPro = user?.plan === 'pro' && (!user.proUntil || new Date(user.proUntil) > new Date());
  return { plan: isPro ? 'pro' : 'free', ...TIERS[isPro ? 'pro' : 'free'] };
}

// Boolean feature check (for whole-feature gates). Numeric limits should be compared
// directly against entitlementsFor(user).<limit>.
export function hasFeature(user, feature) {
  const ent = entitlementsFor(user);
  return ent[feature] !== false && ent[feature] !== 0;
}

// Express guard for a pro-only feature. Unused today (nothing gated); ready to drop in:
//   router.get('/x', authMiddleware, requireFeature('stats'), handler)
export function requireFeature(feature) {
  return async (req, res, next) => {
    try {
      const { prisma } = await import('./prisma.js');
      const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
      if (!hasFeature(user, feature)) {
        return res.status(402).json({ error: 'pro_required', feature });
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}

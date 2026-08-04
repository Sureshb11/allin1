// Admin authorization.
//
// ADMIN_USER_IDS is a comma-separated list of user cuid strings stored in .env.
// Any user whose JWT `sub` appears in this list is an app-wide admin — they can
// approve/reject ground requests, manage content, etc.
//
// Usage:
//   import { requireAdmin, isAdmin } from '../lib/adminAuth.js';
//   router.get('/admin-only', authMiddleware, requireAdmin, handler);

const ADMIN_IDS = new Set(
  (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

/**
 * Express middleware: 403 unless the authenticated user is an admin.
 * Must be used AFTER authMiddleware (so req.user is populated).
 */
export function requireAdmin(req, res, next) {
  if (!req.user?.sub || !ADMIN_IDS.has(req.user.sub)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/** Check whether a userId is an admin (for conditional logic, not middleware). */
export function isAdmin(userId) {
  return ADMIN_IDS.has(userId);
}

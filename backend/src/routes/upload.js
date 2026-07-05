import express from 'express';
import { put } from '@vercel/blob';
import { authMiddleware } from '../lib/auth.js';

const router = express.Router();

// Allowed upload folders → keeps the blob store tidy and prevents arbitrary paths.
const FOLDERS = new Set(['avatars', 'feed', 'gallery', 'marketplace', 'teams']);
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

// A connected Blob store injects a token whose var name depends on the store name
// (e.g. BLOB_READ_WRITE_TOKEN or allin1_api_blob_READ_WRITE_TOKEN). Vercel Blob RW
// tokens always start with "vercel_blob_rw_", so find it by name or by value.
function resolveBlobToken() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v !== 'string') continue;
    if (/READ_WRITE_TOKEN$/.test(k) || v.startsWith('vercel_blob_rw_')) return v;
  }
  return null;
}

// POST /upload  { folder, contentType, dataBase64 }  → { url }
// Uploads a (client-compressed) image to the Vercel Blob store "allin1-api-blob"
// and returns its public URL. BLOB_READ_WRITE_TOKEN is injected by the connected
// Vercel Blob store in production.
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { folder = 'feed', contentType = 'image/jpeg', dataBase64 } = req.body || {};
    if (!dataBase64) return res.status(400).json({ error: 'dataBase64 required' });
    if (!FOLDERS.has(folder)) return res.status(400).json({ error: 'invalid folder' });
    const ext = MIME_EXT[contentType] || 'jpg';
    const blobToken = resolveBlobToken();
    if (!blobToken) {
      return res.status(503).json({ error: 'Blob storage not configured (no blob RW token in env)' });
    }
    // Strip a data-URL prefix if present, then decode.
    const raw = String(dataBase64).replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(raw, 'base64');
    if (buffer.length > 10 * 1024 * 1024) return res.status(413).json({ error: 'Image too large (max 10MB)' });

    const key = `${folder}/${req.user.sub}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const blob = await put(key, buffer, {
      access: 'public',
      contentType,
      token: blobToken,
    });
    res.json({ success: true, url: blob.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

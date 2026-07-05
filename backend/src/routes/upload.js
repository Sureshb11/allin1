import express from 'express';
import { put } from '@vercel/blob';
import { authMiddleware } from '../lib/auth.js';

const router = express.Router();

// Allowed upload folders → keeps the blob store tidy and prevents arbitrary paths.
const FOLDERS = new Set(['avatars', 'feed', 'gallery', 'marketplace', 'teams']);
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

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
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(503).json({ error: 'Blob storage not configured (BLOB_READ_WRITE_TOKEN missing)' });
    }
    // Strip a data-URL prefix if present, then decode.
    const raw = String(dataBase64).replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(raw, 'base64');
    if (buffer.length > 10 * 1024 * 1024) return res.status(413).json({ error: 'Image too large (max 10MB)' });

    const key = `${folder}/${req.user.sub}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const blob = await put(key, buffer, {
      access: 'public',
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    res.json({ success: true, url: blob.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

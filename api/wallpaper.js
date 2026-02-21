/**
 * api/wallpaper.js — Vercel Serverless Function
 *
 * Endpoint: GET /api/wallpaper
 *
 * Query parameters:
 *   model  — iphone16pro | iphone15 | iphone14pro | iphone13  (default: iphone16pro)
 *   date   — YYYY-MM-DD override for testing                   (default: today UTC)
 *   format — jpg | png                                         (default: jpg)
 *   tz     — IANA timezone string e.g. Asia/Dubai              (default: UTC)
 *
 * Returns: image/jpeg (or image/png) of today's overlay image, as-is.
 */

const sharp = require('sharp');
const fs    = require('fs');
const path  = require('path');

// ─── Resolution Table ─────────────────────────────────────────────────────────

const RESOLUTIONS = {
  iphone16pro: { width: 1290, height: 2796 },
  iphone15:    { width: 1179, height: 2556 },
  iphone14pro: { width: 1290, height: 2796 },
  iphone13:    { width: 1170, height: 2532 },
  default:     { width: 1290, height: 2796 },
};

// ─── Paths ────────────────────────────────────────────────────────────────────

const PUBLIC_DIR   = path.join(__dirname, '..', 'public');
const OVERLAYS_DIR = path.join(PUBLIC_DIR, 'overlays');

// ─── Date Utilities ───────────────────────────────────────────────────────────

function parseDateInTz(dateStr, tz) {
  if (dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  const now = new Date();
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year:     'numeric',
        month:    '2-digit',
        day:      '2-digit',
      }).formatToParts(now);

      const get = type => Number(parts.find(p => p.type === type).value);
      return new Date(get('year'), get('month') - 1, get('day'));
    } catch (_) {
      // fall through to UTC
    }
  }

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function getDayOfYear(date) {
  const year = date.getFullYear ? date.getFullYear() : date.getUTCFullYear();
  const jan1 = new Date(year, 0, 1);
  return Math.floor((date - jan1) / 86400000) + 1;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  try {
    // 1. Parse query params
    const { model = 'default', date: dateOverride, format = 'jpg', tz } = req.query;

    // 2. Resolve resolution
    const resolution = RESOLUTIONS[model];
    if (!resolution) {
      return res.status(400).json({ error: `Unsupported model: ${model}. Valid values: ${Object.keys(RESOLUTIONS).join(', ')}` });
    }
    const { width, height } = resolution;

    // 3. Resolve date & day of year
    const today     = parseDateInTz(dateOverride, tz);
    const dayOfYear = getDayOfYear(today);

    // 4. Load PNG overlay — fall back to day-365 for day 366 on leap years
    let overlayPath = path.join(OVERLAYS_DIR, `day-${String(dayOfYear).padStart(3, '0')}.png`);

    if (!fs.existsSync(overlayPath)) {
      overlayPath = path.join(OVERLAYS_DIR, 'day-365.png');
    }

    if (!fs.existsSync(overlayPath)) {
      return res.status(500).json({ error: 'No overlay image found for today.' });
    }

    // 5. Encode (resize only if model resolution differs from source)
    const outputFormat = format === 'png' ? 'png' : 'jpeg';
    const contentType  = format === 'png' ? 'image/png' : 'image/jpeg';

    let pipeline = sharp(overlayPath).resize(width, height, { fit: 'fill' });

    if (outputFormat === 'jpeg') {
      pipeline = pipeline.jpeg({ quality: 92, mozjpeg: true });
    } else {
      pipeline = pipeline.png({ compressionLevel: 6 });
    }

    const imageBuffer = await pipeline.toBuffer();

    // 6. Send response
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Day-Of-Year', String(dayOfYear));

    res.status(200).end(imageBuffer);

  } catch (err) {
    console.error('[wallpaper] Error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};

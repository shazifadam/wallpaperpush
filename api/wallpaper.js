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
 * Returns: image/jpeg (or image/png) of today's wallpaper with text overlay.
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

// In Vercel, __dirname points to the function bundle.
// Assets bundled from /public are available relative to the project root.
const PUBLIC_DIR   = path.join(__dirname, '..', 'public');
const OVERLAYS_DIR = path.join(PUBLIC_DIR, 'overlays');
const FONTS_DIR    = path.join(PUBLIC_DIR, 'fonts');
const FONT_PATH    = path.join(FONTS_DIR, 'SF-Pro-Display-Regular.otf');

// ─── Font Loading (cached across warm invocations) ────────────────────────────

let _fontBase64 = null;

function getFontBase64() {
  if (!_fontBase64) {
    const buf = fs.readFileSync(FONT_PATH);
    _fontBase64 = buf.toString('base64');
  }
  return _fontBase64;
}

// ─── Date Utilities ───────────────────────────────────────────────────────────

function parseDateInTz(dateStr, tz) {
  // If a date override is given, use it directly (ignoring tz)
  if (dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  // Otherwise derive today in the requested timezone
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

  // UTC fallback
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function calcDateInfo(date) {
  const year    = date.getFullYear ? date.getFullYear() : date.getUTCFullYear();
  const isLeap  = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInYear = isLeap ? 366 : 365;

  const jan1    = new Date(year, 0, 1);
  const dayOfYear = Math.floor((date - jan1) / 86400000) + 1;

  const dec31   = new Date(year, 11, 31);
  const daysLeft = Math.floor((dec31 - date) / 86400000);

  const percent = ((dayOfYear / daysInYear) * 100).toFixed(1);

  return { dayOfYear, daysLeft, percent, daysInYear };
}

// ─── SVG Text Overlay ─────────────────────────────────────────────────────────

function buildTextSvg(width, height, daysLeft, percent, fontBase64) {
  // Text: "320 Days Left  •  12.3%"
  const text      = `${daysLeft} Days Left  •  ${percent}%`;

  // Font size scales with image width — ~52px at 1290px
  const fontSize  = Math.round(52 * (width / 1290));
  const fontColor = '#FFFFFF';

  // Position: 91% down the canvas height (within the bottom text zone)
  const textY = Math.round(height * 0.91);

  // Drop shadow for legibility
  const shadowBlur = Math.round(8 * (width / 1290));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <style>
      @font-face {
        font-family: 'SFPro';
        src: url('data:font/otf;base64,${fontBase64}') format('opentype');
      }
      .label {
        font-family: 'SFPro', -apple-system, 'Helvetica Neue', sans-serif;
        font-size: ${fontSize}px;
        fill: ${fontColor};
        text-anchor: middle;
        filter: url(#shadow);
      }
    </style>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="${shadowBlur}" flood-color="rgba(0,0,0,0.55)"/>
    </filter>
  </defs>
  <text class="label" x="${Math.round(width / 2)}" y="${textY}">${text}</text>
</svg>`;
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

    // 3. Resolve date & calculate metrics
    const today = parseDateInTz(dateOverride, tz);
    const { dayOfYear, daysLeft, percent } = calcDateInfo(today);

    // 4. Load PNG overlay
    //    Prefer the exact day file; fall back to day-365 for day 366 on leap years
    let dayFile = `day-${String(dayOfYear).padStart(3, '0')}.png`;
    let overlayPath = path.join(OVERLAYS_DIR, dayFile);

    if (!fs.existsSync(overlayPath)) {
      overlayPath = path.join(OVERLAYS_DIR, 'day-365.png');
    }

    if (!fs.existsSync(overlayPath)) {
      return res.status(500).json({ error: 'No overlay image found for today. Run generate-overlays.js first.' });
    }

    // 5. Build SVG text layer
    const fontBase64 = getFontBase64();
    const textSvg    = buildTextSvg(width, height, daysLeft, percent, fontBase64);

    // 6. Compose: resize overlay → composite text → encode
    const outputFormat = format === 'png' ? 'png' : 'jpeg';
    const contentType  = format === 'png' ? 'image/png' : 'image/jpeg';

    let pipeline = sharp(overlayPath);

    // Resize to target resolution if needed (letterbox / stretch)
    pipeline = pipeline.resize(width, height, { fit: 'fill' });

    // Composite SVG text layer on top
    pipeline = pipeline.composite([{
      input:  Buffer.from(textSvg),
      blend:  'over',
    }]);

    // Encode
    if (outputFormat === 'jpeg') {
      pipeline = pipeline.jpeg({ quality: 92, mozjpeg: true });
    } else {
      pipeline = pipeline.png({ compressionLevel: 6 });
    }

    const imageBuffer = await pipeline.toBuffer();

    // 7. Send response
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Day-Of-Year',  String(dayOfYear));
    res.setHeader('X-Days-Left',    String(daysLeft));
    res.setHeader('X-Year-Percent', String(percent));

    res.status(200).end(imageBuffer);

  } catch (err) {
    console.error('[wallpaper] Error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};

/**
 * generate-overlays.js
 *
 * Generates 365 PNG overlay images for the dynamic wallpaper system.
 * Each image is a white-background iPhone wallpaper with a dot-grid
 * showing year progress: filled dots = elapsed days, empty dots = remaining.
 *
 * Target: iPhone 16 Pro / 14 Pro — 1290 × 2796 px
 *
 * Run: node scripts/generate-overlays.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// ─── Canvas & Grid Configuration ─────────────────────────────────────────────

const WIDTH  = 1290;
const HEIGHT = 2796;

// Dot grid layout (tuned to match the example overlay image)
const COLS         = 20;          // dots per row
const TOTAL_DOTS   = 365;         // days in a standard year
const ROWS         = Math.ceil(TOTAL_DOTS / COLS); // 19 rows

const DOT_RADIUS   = 14;          // px — dot radius
const DOT_SPACING  = 62;          // px — center-to-center distance (horizontal & vertical)

// Grid dimensions
const GRID_W = (COLS - 1) * DOT_SPACING;
const GRID_H = (ROWS - 1) * DOT_SPACING;

// Position the grid: horizontally centered, vertically in lower-middle area
const GRID_X = Math.round((WIDTH  - GRID_W) / 2);  // left edge of first dot column
const GRID_Y = Math.round(HEIGHT * 0.38);           // top edge of first dot row

// Colours
const COL_FILLED   = '#1C1C1E';   // near-black — elapsed days
const COL_EMPTY    = '#D1D1D6';   // light grey  — future days

// ─── SVG Builder ─────────────────────────────────────────────────────────────

function buildDotGridSVG(filledCount) {
  const circles = [];

  for (let i = 0; i < TOTAL_DOTS; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cx  = GRID_X + col * DOT_SPACING;
    const cy  = GRID_Y + row * DOT_SPACING;
    const fill = i < filledCount ? COL_FILLED : COL_EMPTY;

    circles.push(
      `<circle cx="${cx}" cy="${cy}" r="${DOT_RADIUS}" fill="${fill}"/>`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#FFFFFF"/>
  ${circles.join('\n  ')}
</svg>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const outDir = path.join(__dirname, '..', 'public', 'overlays');
  fs.mkdirSync(outDir, { recursive: true });

  const total = 365;
  console.log(`Generating ${total} overlay PNGs → ${outDir}`);
  console.time('total');

  for (let day = 1; day <= total; day++) {
    const svg      = buildDotGridSVG(day);
    const filename = `day-${String(day).padStart(3, '0')}.png`;
    const outPath  = path.join(outDir, filename);

    await sharp(Buffer.from(svg))
      .png({ compressionLevel: 6 })
      .toFile(outPath);

    if (day % 50 === 0 || day === total) {
      process.stdout.write(`  Generated day ${day}/${total}\n`);
    }
  }

  console.timeEnd('total');
  console.log('Done. All overlays written to public/overlays/');
}

main().catch(err => {
  console.error('Generation failed:', err);
  process.exit(1);
});

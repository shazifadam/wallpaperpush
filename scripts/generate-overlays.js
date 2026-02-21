/**
 * generate-overlays.js
 *
 * Generates 365 PNG overlay images for the dynamic wallpaper system.
 *
 * Each image composites a dot-grid onto the background wallpaper:
 *   - Filled dots  (#1C1C1E, opaque)   = days elapsed (today included)
 *   - Empty dots   (white, 15% opacity) = days remaining
 *
 * Layout (derived from design specs):
 *   Canvas        : 1290 × 2796 px
 *   Left margin   : 159 px  (right margin mirrors = 159 px)
 *   Grid width    : 1290 - 159 - 159 = 972 px
 *   Grid top      : 1100 px from top
 *   Grid height   : 704 px  (bottom at y = 1804)
 *   Columns       : 20
 *   Rows          : 19  (20 × 19 = 380 slots ≥ 365)
 *   H spacing     : 972 / 19 gaps = ~51.16 px  → 51 px
 *   V spacing     : 704 / 18 gaps = ~39.11 px  → 39 px
 *   Dot radius    : 11 px
 *
 * Run: node scripts/generate-overlays.js
 */

const sharp = require('sharp');
const fs    = require('fs');
const path  = require('path');

// ─── Layout Constants ─────────────────────────────────────────────────────────

const WIDTH        = 1290;
const HEIGHT       = 2796;

const COLS         = 20;
const TOTAL_DOTS   = 365;
const ROWS         = Math.ceil(TOTAL_DOTS / COLS);   // 19

// Margins / position (from design spec screenshots)
const MARGIN_LEFT  = 159;                             // px from left edge
const MARGIN_RIGHT = 159;                             // px from right edge
const GRID_TOP     = 1100;                            // px from top
const GRID_HEIGHT  = 704;                             // px total grid height

const GRID_W       = WIDTH - MARGIN_LEFT - MARGIN_RIGHT;  // 972 px

// Center-to-center spacing
const H_SPACING    = Math.round(GRID_W  / (COLS - 1));   // ~51 px
const V_SPACING    = Math.round(GRID_HEIGHT / (ROWS - 1));// ~39 px

const DOT_RADIUS   = 11;  // px

// ─── Colours ──────────────────────────────────────────────────────────────────

const COL_FILLED   = '#1C1C1E';           // near-black — elapsed days
const OPACITY_EMPTY = 0.15;              // white at 15% opacity — future days

// ─── SVG Builder ─────────────────────────────────────────────────────────────

function buildDotGridSVG(filledCount) {
  const circles = [];

  for (let i = 0; i < TOTAL_DOTS; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cx  = MARGIN_LEFT + col * H_SPACING;
    const cy  = GRID_TOP    + row * V_SPACING;

    if (i < filledCount) {
      // Filled dot — elapsed day
      circles.push(
        `<circle cx="${cx}" cy="${cy}" r="${DOT_RADIUS}" fill="${COL_FILLED}"/>`
      );
    } else {
      // Empty dot — future day (white, semi-transparent)
      circles.push(
        `<circle cx="${cx}" cy="${cy}" r="${DOT_RADIUS}" fill="white" opacity="${OPACITY_EMPTY}"/>`
      );
    }
  }

  // SVG is transparent — composited over the background wallpaper
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  ${circles.join('\n  ')}
</svg>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const bgPath = path.join(__dirname, '..', 'public', 'background.png');
  const outDir = path.join(__dirname, '..', 'public', 'overlays');

  if (!fs.existsSync(bgPath)) {
    console.error(`Background image not found: ${bgPath}`);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Background : ${bgPath}`);
  console.log(`Output dir : ${outDir}`);
  console.log(`Generating ${TOTAL_DOTS} overlay PNGs…`);
  console.log(`Grid layout: ${COLS} cols × ${ROWS} rows, H-spacing ${H_SPACING}px, V-spacing ${V_SPACING}px`);
  console.log(`Grid origin: x=${MARGIN_LEFT}, y=${GRID_TOP}  |  dot radius: ${DOT_RADIUS}px`);
  console.time('total');

  for (let day = 1; day <= TOTAL_DOTS; day++) {
    const svg      = buildDotGridSVG(day);
    const filename = `day-${String(day).padStart(3, '0')}.png`;
    const outPath  = path.join(outDir, filename);

    // Composite dot-grid SVG over background wallpaper
    await sharp(bgPath)
      .composite([{ input: Buffer.from(svg), blend: 'over' }])
      .png({ compressionLevel: 6 })
      .toFile(outPath);

    if (day % 50 === 0 || day === TOTAL_DOTS) {
      process.stdout.write(`  ✓ day ${day}/${TOTAL_DOTS}\n`);
    }
  }

  console.timeEnd('total');
  console.log('Done. All overlays written to public/overlays/');
}

main().catch(err => {
  console.error('Generation failed:', err);
  process.exit(1);
});

'use strict';

/**
 * Evora Finance — Blog Cover Generator
 * Generates 1200×630 PNG cover images for blog articles via SVG → sharp.
 *
 * Usage (CLI):
 *   node scripts/generate-covers.js "Заголовок статьи" mfo  blog/slug/cover.png
 *   node scripts/generate-covers.js "Заголовок"        rko  path/cover.png
 *
 * API:
 *   const { generateCover } = require('./generate-covers');
 *   await generateCover(text, category, outputPath);
 */

const sharp  = require('sharp');
const fs     = require('fs');
const path   = require('path');

const W = 1200, H = 630;

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapText(text, maxChars) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (test.length <= maxChars) { line = test; }
    else { if (line) lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

// SVG arc path helper (clockwise, sweep-flag=1)
function arcPath(cx, cy, r, startDeg, endDeg) {
  const rad = d => d * Math.PI / 180;
  const x1 = cx + r * Math.cos(rad(startDeg));
  const y1 = cy + r * Math.sin(rad(startDeg));
  const x2 = cx + r * Math.cos(rad(endDeg));
  const y2 = cy + r * Math.sin(rad(endDeg));
  const delta = ((endDeg - startDeg) % 360 + 360) % 360;
  const la = delta > 180 ? 1 : 0;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${la} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

// ── MFO: speedometer gauge showing 98% approval ──────────────────────────
function mfoVisual() {
  const cx = 972, cy = 340, r = 118;
  // 240° arc: from 150° to 390° (= 30°) clockwise — open gap at bottom
  const trackPath = arcPath(cx, cy, r, 150, 30);
  const fillPath  = arcPath(cx, cy, r, 150, 150 + 240 * 0.98); // 98% = 235.2°
  return `
    <circle cx="${cx}" cy="${cy}" r="168" fill="rgba(34,197,94,0.04)"/>
    <circle cx="${cx}" cy="${cy}" r="142" fill="rgba(34,197,94,0.025)"/>
    <path d="${trackPath}" fill="none" stroke="#1e3a5f" stroke-width="15" stroke-linecap="round"/>
    <path d="${fillPath}"  fill="none" stroke="url(#gaugeGrad)" stroke-width="15" stroke-linecap="round"/>
    <text x="${cx}" y="${cy - 8}"  text-anchor="middle" font-family="sans-serif" font-size="50" font-weight="bold"  fill="#22c55e">98%</text>
    <text x="${cx}" y="${cy + 24}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#94a3b8" letter-spacing="3">ОДОБРЕНО</text>
    <circle cx="${cx}" cy="${cy}" r="7" fill="#22c55e"/>
    <rect   x="60"  y="530" width="510" height="52" rx="26" fill="url(#ctaGrad)"/>
    <text   x="315" y="562" text-anchor="middle" font-family="sans-serif" font-size="17" font-weight="600" fill="#fff">Запустить экспресс-проверку 2026 →</text>`;
}

// ── Cards: stylised credit card ───────────────────────────────────────────
function cardsVisual() {
  const cx = 962, cy = 318;
  const cw = 342, ch = 214;
  const x0 = cx - cw / 2, y0 = cy - ch / 2;
  return `
    <rect x="${x0 + 7}" y="${y0 + 7}" width="${cw}" height="${ch}" rx="18" fill="rgba(0,0,0,0.4)"/>
    <rect x="${x0}"     y="${y0}"     width="${cw}" height="${ch}" rx="18" fill="url(#cardGrad)" stroke="rgba(255,255,255,0.09)" stroke-width="1"/>
    <rect x="${x0 + 22}" y="${y0 + 28}" width="50" height="38" rx="7" fill="#d97706"/>
    <rect x="${x0 + 22}" y="${y0 + 40}" width="50" height="2"  fill="rgba(0,0,0,0.22)"/>
    <rect x="${x0 + 22}" y="${y0 + 50}" width="50" height="2"  fill="rgba(0,0,0,0.22)"/>
    <rect x="${x0 + 36}" y="${y0 + 28}" width="2"  height="38" fill="rgba(0,0,0,0.22)"/>
    <rect x="${x0 + 54}" y="${y0 + 28}" width="2"  height="38" fill="rgba(0,0,0,0.22)"/>
    <text x="${x0 + cw - 18}" y="${y0 + 50}" text-anchor="end" font-family="sans-serif" font-size="20" font-weight="bold" fill="rgba(255,255,255,0.18)">VISA</text>
    <text x="${x0 + 22}" y="${cy + 32}" font-family="sans-serif" font-size="15" fill="rgba(255,255,255,0.65)" letter-spacing="5">•••• •••• ••••</text>
    <text x="${cx + 60}" y="${cy + 32}" font-family="sans-serif" font-size="15" fill="rgba(255,255,255,0.85)">2026</text>
    <text x="${x0 + 22}" y="${cy + 62}" font-family="sans-serif" font-size="10" fill="rgba(255,255,255,0.4)" letter-spacing="1">VALID THRU  12/28</text>
    <rect x="${x0}" y="${cy + 82}" width="${cw}" height="31" rx="8" fill="rgba(34,197,94,0.22)"/>
    <text x="${cx}" y="${cy + 103}" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="600" fill="#4ade80">✓  Лимиты увеличены в 2026</text>
    <rect x="60"  y="530" width="398" height="52" rx="26" fill="url(#ctaGrad)"/>
    <text x="259" y="562" text-anchor="middle" font-family="sans-serif" font-size="17" font-weight="600" fill="#fff">Оформить карту онлайн →</text>`;
}

// ── RKO: upward-trend line chart ──────────────────────────────────────────
function rkoVisual() {
  const ox = 820, oy = 445, cw = 315, ch = 190;
  const pts = [[0,.82],[.12,.68],[.26,.72],[.4,.52],[.56,.44],[.7,.28],[.84,.13],[1,0]];
  const svgPts = pts.map(([px, py]) => [ox + px * cw, oy - py * ch]);
  const poly   = svgPts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = svgPts[svgPts.length - 1];
  const area = `M ${ox} ${oy} ` + svgPts.map(([x, y]) => `L ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
             + ` L ${(ox + cw).toFixed(1)} ${oy} Z`;
  return `
    <line x1="${ox}" y1="${oy}"       x2="${ox + cw}" y2="${oy}"       stroke="#1e3a5f" stroke-width="1"/>
    <line x1="${ox}" y1="${oy-ch/2}"  x2="${ox + cw}" y2="${oy-ch/2}"  stroke="#1e3a5f" stroke-width="1" stroke-dasharray="4,7"/>
    <line x1="${ox}" y1="${oy-ch}"    x2="${ox + cw}" y2="${oy-ch}"    stroke="#1e3a5f" stroke-width="1" stroke-dasharray="4,7"/>
    <path d="${area}" fill="url(#chartArea)"/>
    <polyline points="${poly}" fill="none" stroke="#22c55e" stroke-width="3" stroke-linejoin="round"/>
    <polygon points="${lx.toFixed(1)},${(ly - 26).toFixed(1)} ${(lx - 9).toFixed(1)},${(ly - 9).toFixed(1)} ${(lx + 9).toFixed(1)},${(ly - 9).toFixed(1)}" fill="#22c55e"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="7" fill="#22c55e" stroke="#0d1117" stroke-width="2"/>
    <rect x="820" y="457" width="318" height="32" rx="8" fill="rgba(34,197,94,0.12)" stroke="#22c55e" stroke-width="1"/>
    <text x="979" y="478" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="600" fill="#4ade80">Счёт активен · от 0 ₽/мес</text>
    <rect x="60"  y="530" width="382" height="52" rx="26" fill="url(#ctaGrad)"/>
    <text x="251" y="562" text-anchor="middle" font-family="sans-serif" font-size="17" font-weight="600" fill="#fff">Открыть счёт за 1 час →</text>`;
}

// ── Generic: stats panel (mortgage / credits) ─────────────────────────────
function statsVisual(rate, amount, ctaText) {
  const cx = 972, cy = 348;
  const ctaW = Math.min(Math.round(ctaText.length * 11.5 + 90), 500);
  return `
    <rect x="${cx - 165}" y="${cy - 140}" width="330" height="270" rx="16" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
    <text x="${cx}" y="${cy - 90}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#64748b" letter-spacing="3">СТАВКА ОТ</text>
    <text x="${cx}" y="${cy - 36}" text-anchor="middle" font-family="sans-serif" font-size="56" font-weight="bold" fill="#f59e0b">${esc(rate)}</text>
    <line x1="${cx - 125}" y1="${cy}" x2="${cx + 125}" y2="${cy}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
    <text x="${cx}" y="${cy + 38}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#64748b" letter-spacing="3">ДО</text>
    <text x="${cx}" y="${cy + 78}" text-anchor="middle" font-family="sans-serif" font-size="40" font-weight="bold" fill="#e2e8f0">${esc(amount)}</text>
    <rect x="${cx - 128}" y="${cy + 92}" width="256" height="30" rx="8" fill="rgba(34,197,94,0.14)" stroke="#22c55e" stroke-width="1"/>
    <text x="${cx}" y="${cy + 112}" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="600" fill="#4ade80">✓  Одобрение за 1 день</text>
    <rect x="60" y="530" width="${ctaW}" height="52" rx="26" fill="url(#ctaGrad)"/>
    <text x="${60 + ctaW / 2}" y="562" text-anchor="middle" font-family="sans-serif" font-size="17" font-weight="600" fill="#fff">${esc(ctaText)}</text>`;
}

function categoryVisual(category) {
  switch ((category || '').toLowerCase()) {
    case 'mfo':                   return mfoVisual();
    case 'karty': case 'cards':   return cardsVisual();
    case 'rko':                   return rkoVisual();
    case 'mortgage': case 'zalog':
      return statsVisual('8.9%', '15 млн ₽', 'Получить деньги под залог →');
    default:
      return statsVisual('4.9%', '7.5 млн ₽', 'Получить кредит онлайн →');
  }
}

// ── Build full SVG ────────────────────────────────────────────────────────
function buildSvg(text, category) {
  const lines   = wrapText(text, 30);
  const fsize   = lines.length <= 2 ? 58 : lines.length === 3 ? 50 : 44;
  const lh      = Math.round(fsize * 1.28);
  const startY  = lines.length <= 2 ? 238 : lines.length === 3 ? 212 : 194;

  const textEls = lines.map((l, i) =>
    `<text x="78" y="${startY + i * lh}" font-family="sans-serif" font-size="${fsize}" font-weight="bold" fill="#f1f5f9">${esc(l)}</text>`
  ).join('\n    ');

  const visual = categoryVisual(category);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0%"   stop-color="#0f1f3d"/>
      <stop offset="60%"  stop-color="#0d1527"/>
      <stop offset="100%" stop-color="#0d1117"/>
    </linearGradient>
    <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
      <stop offset="0%"   stop-color="#15803d"/>
      <stop offset="100%" stop-color="#22c55e"/>
    </linearGradient>
    <linearGradient id="ctaGrad" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
      <stop offset="0%"   stop-color="#1d4ed8"/>
      <stop offset="100%" stop-color="#3b82f6"/>
    </linearGradient>
    <linearGradient id="cardGrad" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0%"   stop-color="#1e3a8a"/>
      <stop offset="100%" stop-color="#312e81"/>
    </linearGradient>
    <linearGradient id="chartArea" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0%"   stop-color="#22c55e" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="#22c55e" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="accentBar" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
      <stop offset="0%"   stop-color="#2563eb" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#2563eb" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="110"  cy="570" r="290" fill="rgba(29,78,216,0.05)"/>
  <circle cx="1110" cy="70"  r="170" fill="rgba(34,197,94,0.04)"/>

  <rect x="0" y="0" width="${W}" height="70" fill="rgba(0,0,0,0.22)"/>
  <rect x="0" y="69" width="${W}" height="1" fill="rgba(255,255,255,0.06)"/>

  <circle cx="42"  cy="36" r="7" fill="#ef4444" opacity="0.88"/>
  <circle cx="66"  cy="36" r="7" fill="#f59e0b" opacity="0.88"/>
  <circle cx="90"  cy="36" r="7" fill="#22c55e" opacity="0.88"/>

  <text x="1150" y="28"  text-anchor="end" font-family="sans-serif" font-size="11" fill="rgba(255,255,255,0.36)" letter-spacing="3">EVORA</text>
  <text x="1150" y="50"  text-anchor="end" font-family="sans-serif" font-size="13" font-weight="bold" fill="#f59e0b" letter-spacing="4">FINANCE</text>

  ${textEls}

  ${visual}

  <rect x="0" y="${H - 4}" width="${W}" height="4" fill="url(#accentBar)"/>
</svg>`;
}

// ── Public API ─────────────────────────────────────────────────────────────
async function generateCover(text, category, outputPath) {
  const svg = buildSvg(text, category);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
  console.log(`  🖼  Cover → ${outputPath}`);
}

module.exports = { generateCover };

// ── CLI ────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const [,, text = 'Лучшие МФО 2026: займ онлайн срочно без отказа', category = 'mfo', output] = process.argv;
  const outPath = output || path.join(__dirname, '..', `test-cover-${category}.png`);
  generateCover(text, category, outPath)
    .then(() => console.log('✅ Done'))
    .catch(e => { console.error('❌', e.message); process.exit(1); });
}

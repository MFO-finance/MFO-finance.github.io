#!/usr/bin/env node
/**
 * Evora Finance — IndexNow client (Yandex + Bing)
 *
 * Key file: /f7158a54b90e4412a7cb11c751bc16f8.txt  ← already in repo root
 * Key verification URL: https://mfo-finance.github.io/f7158a54b90e4412a7cb11c751bc16f8.txt
 *
 * Usage:
 *   node scripts/indexnow.js                   # submit all URLs from sitemap.xml
 *   node scripts/indexnow.js /blog/slug/       # submit specific path(s)
 *   node scripts/indexnow.js --yandex-only     # skip Bing
 *   node scripts/indexnow.js --bing-only       # skip Yandex
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

/* ---- Config ---- */
const INDEXNOW_KEY = process.env.INDEXNOW_KEY || 'f7158a54b90e4412a7cb11c751bc16f8';
const BASE_URL     = 'https://mfo-finance.github.io';
const HOST         = 'mfo-finance.github.io';
const KEY_LOCATION = `${BASE_URL}/${INDEXNOW_KEY}.txt`;

const ENGINES = {
  yandex: 'yandex.com',
  bing:   'www.bing.com',
};

/* ---- HTTP POST helper ---- */
function postJson(hostname, urlPath, payload) {
  return new Promise(resolve => {
    const body = JSON.stringify(payload);
    const opts = {
      hostname,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type':   'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(opts, res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });

    req.on('error', err => resolve({ status: 0, body: err.message }));
    req.write(body);
    req.end();
  });
}

/* ---- Submit to one engine ---- */
async function submitToEngine(name, hostname, urls) {
  const payload = {
    host:        HOST,
    key:         INDEXNOW_KEY,
    keyLocation: KEY_LOCATION,
    urlList:     urls.slice(0, 10000),
  };

  const { status, body } = await postJson(hostname, '/indexnow', payload);

  if (status === 200 || status === 202) {
    console.log(`   ✅ ${name}: HTTP ${status} — принято (${urls.length} URL)`);
  } else if (status === 422) {
    console.warn(`   ⚠️  ${name}: HTTP 422 — ключ не найден.`);
    console.warn(`      Убедитесь, что файл доступен: ${KEY_LOCATION}`);
  } else if (status === 429) {
    console.warn(`   ⏳ ${name}: HTTP 429 — слишком много запросов, попробуйте позже.`);
  } else {
    console.error(`   ❌ ${name}: HTTP ${status} — ${body.slice(0, 120)}`);
  }
}

/* ---- Submit to all selected engines ---- */
async function submitUrls(urls, opts = {}) {
  const yandexOnly = opts.yandexOnly || false;
  const bingOnly   = opts.bingOnly   || false;

  if (!urls || !urls.length) {
    console.log('   Нет URL для отправки.');
    return;
  }

  const targets = [];
  if (!bingOnly)   targets.push(['Yandex', ENGINES.yandex]);
  if (!yandexOnly) targets.push(['Bing',   ENGINES.bing]);

  for (const [name, hostname] of targets) {
    await submitToEngine(name, hostname, urls);
  }
}

/* ---- Read URLs from sitemap.xml ---- */
function readSitemapUrls() {
  const sitemapPath = path.join(__dirname, '..', 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) {
    console.error('❌ sitemap.xml не найден. Сначала запустите: npm run sitemap');
    return [];
  }
  const xml     = fs.readFileSync(sitemapPath, 'utf8');
  const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)];
  return matches.map(m => m[1]);
}

/* ---- CLI entry point ---- */
async function main() {
  const args       = process.argv.slice(2);
  const yandexOnly = args.includes('--yandex-only');
  const bingOnly   = args.includes('--bing-only');
  const paths      = args.filter(a => !a.startsWith('--'));

  let urls;
  if (paths.length) {
    urls = paths.map(p =>
      p.startsWith('http') ? p : `${BASE_URL}${p.startsWith('/') ? p : '/' + p}`
    );
  } else {
    urls = readSitemapUrls();
  }

  console.log(`\n📡 IndexNow — отправка URL`);
  console.log(`   Ключ    : ${INDEXNOW_KEY}`);
  console.log(`   Key URL : ${KEY_LOCATION}`);
  console.log(`   URL     : ${urls.length} шт.`);
  urls.slice(0, 5).forEach(u => console.log(`   • ${u}`));
  if (urls.length > 5) console.log(`   … и ещё ${urls.length - 5}`);
  console.log('');

  await submitUrls(urls, { yandexOnly, bingOnly });
  console.log('\nГотово.');
}

/* ---- Exports ---- */
module.exports = { submitUrls };

if (require.main === module) {
  main().catch(err => { console.error('Fatal:', err); process.exit(1); });
}

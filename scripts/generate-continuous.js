#!/usr/bin/env node
/**
 * Evora Finance — Continuous Article Generator
 *
 * Reads keywords.txt line by line, generates one article per keyword,
 * commits and pushes to GitHub after each, pings IndexNow.
 * Skips keywords that already have a generated article (safe to restart).
 *
 * Usage:
 *   node scripts/generate-continuous.js
 *   node scripts/generate-continuous.js --limit=50   # stop after N articles
 *   node scripts/generate-continuous.js --dry-run    # show slugs without generating
 */

'use strict';

const fs        = require('fs');
const path      = require('path');
const { execSync } = require('child_process');
const Anthropic  = require('@anthropic-ai/sdk');

/* ─── Config ─────────────────────────────────────────────────── */
const BASE_URL         = 'https://mfo-finance.github.io';
const ROOT             = path.resolve(__dirname, '..');
const KEYWORDS_TXT     = path.join(ROOT, 'keywords.txt');
const OFFERS_FILE      = path.join(ROOT, 'src', 'data', 'offers.json');
const BLOG_DIR         = path.join(ROOT, 'blog');
const MODEL            = 'claude-sonnet-4-6';
const MAX_TOKENS       = 16000;
const OFFERS_IN_WIDGET = 7;
const DELAY_MS         = 3000; // pause between API calls (avoid rate limits)

/* ─── CLI args ────────────────────────────────────────────────── */
const args   = process.argv.slice(2);
const LIMIT  = (args.find(a => a.startsWith('--limit=')) || '').replace('--limit=', '') | 0 || null;
const DRY    = args.includes('--dry-run');

/* ─── Anthropic client ────────────────────────────────────────── */
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey && !DRY) { console.error('❌  Set ANTHROPIC_API_KEY before running.'); process.exit(1); }
const client = !DRY ? new Anthropic({ apiKey }) : null;

/* ─── Russian → Latin transliteration (for slugs) ────────────── */
const TR = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',
  к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',
  х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
};

function toSlug(str) {
  return str.toLowerCase()
    .split('').map(c => TR[c] !== undefined ? TR[c] : c)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}

/* ─── Category detection ──────────────────────────────────────── */
function detectCategory(kw) {
  const lc = kw.toLowerCase();
  if (lc.includes('займ') || lc.includes('заем') || lc.includes('мфо') || lc.includes('микрозайм')) return 'mfo';
  if (lc.includes('кредитная карта') || lc.includes('кредитные карты') || lc.includes('кредитку')) return 'cards';
  if (lc.includes('рко') || lc.includes('расчётный счёт') || lc.includes('расчетный счет')) return 'rko';
  if (lc.includes('залог недвижимости') || lc.includes('ипотека') || lc.includes('под залог')) return 'mortgage';
  if (lc.includes('кредит')) return 'credits';
  return 'credits'; // default fallback
}

/* ─── Money formatting ────────────────────────────────────────── */
function fmtMoney(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toLocaleString('ru-RU') + ' млн ₽';
  if (n >= 1_000)     return (n / 1_000).toLocaleString('ru-RU') + ' 000 ₽';
  return n + ' ₽';
}

/* ─── Offer widget ────────────────────────────────────────────── */
function pickOffers(offersData, category, count) {
  const pool = [...(offersData[category] || [])];
  pool.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.rating - a.rating);
  return pool.slice(0, count);
}

function renderWidget(offers, category) {
  const titles = {
    mfo:      '🏆 Лучшие МФО 2026 — займ за 5 минут',
    cards:    '💳 Топ кредитных карт 2026',
    rko:      '🏦 Лучшие банки для РКО 2026',
    mortgage: '🏠 Кредиты под залог недвижимости 2026',
    credits:  '💰 Выгодные кредиты наличными 2026',
  };
  const items = offers.map(o => {
    const bg  = o.logo_bg || '#2563eb';
    const clr = o.logo_text_color || '#fff';
    let params = '';
    if (category === 'mfo')      params = `0% первый займ · до ${fmtMoney(o.amount_max)} · ${o.approval_time}`;
    else if (category === 'cards')    params = `0% до ${o.grace_period || o.installment_months || '—'} дней · ${fmtMoney(o.credit_limit_max)} · ${o.annual_fee_text}`;
    else if (category === 'rko')      params = `от ${o.monthly_fee_min === 0 ? 'бесплатно' : o.monthly_fee_min + ' ₽/мес'} · открытие ${o.opening_time}`;
    else if (category === 'mortgage') params = `от ${o.rate_year_min}% · до ${fmtMoney(o.amount_max)} · ${o.approval_time}`;
    else if (category === 'credits')  params = `от ${o.rate_year_min}% · до ${fmtMoney(o.amount_max)} · ${o.approval_time}`;
    return `    <div class="widget-offer">
      <div class="widget-offer-logo" style="background:${bg};color:${clr};">${o.logo_text}</div>
      <div class="widget-offer-info">
        <div class="widget-offer-name">${o.name}</div>
        <div class="widget-offer-params">${params}</div>
      </div>
      <a href="${o.url}" target="_blank" rel="noopener sponsored" class="widget-offer-btn">Получить →</a>
    </div>`;
  }).join('\n');
  return `<div class="article-offers-widget">
  <div class="widget-title">${titles[category] || 'Лучшие предложения 2026'}</div>
  <div class="widget-offers">
${items}
  </div>
</div>`;
}

/* ─── Build prompt ────────────────────────────────────────────── */
function buildPrompt(keyword, category) {
  const linkingMap = {
    mfo:      [{ href: '/karty/',   anchor: 'лучшие кредитные карты с кэшбэком' },
               { href: '/kredity/', anchor: 'кредиты наличными без залога' }],
    cards:    [{ href: '/',         anchor: 'займы онлайн без отказа' },
               { href: '/kredity/', anchor: 'потребительские кредиты банков' }],
    rko:      [{ href: '/',         anchor: 'быстрые займы для бизнеса' },
               { href: '/kredity/', anchor: 'кредиты для ИП и ООО' }],
    mortgage: [{ href: '/kredity/', anchor: 'потребительские кредиты без залога' },
               { href: '/',         anchor: 'займы под залог онлайн' }],
    credits:  [{ href: '/',         anchor: 'микрозаймы на карту без отказа' },
               { href: '/karty/',   anchor: 'кредитные карты с льготным периодом' }],
  };
  const links = (linkingMap[category] || []).map(l => `<a href="${l.href}">${l.anchor}</a>`).join(', ');

  return `Ты — профессиональный финансовый аналитик, экспертный копирайтер и топовый SEO-оптимизатор (уровень Senior). Твоя цель — писать экспертные, живые и конвертящие статьи для финансового агрегатора "Evora Finance", оптимизированные под требования Яндекса (YMYL, E-A-T, Баден-Баден) и коммерческий интент 2026 года.

### НАШ КЛЮЧЕВОЙ ЗАПРОС:
"${keyword}" (Категория: ${category})

---

### 1. ТРЕБОВАНИЯ К СТИЛЮ
- Исключи «ИИ-штампы»: "в современном мире", "немаловажно", "критически важно", "стоит отметить", "таким образом", "рассмотрим подробнее", "в заключение".
- Живой синтаксис: чередуй длинные предложения с короткими. Тон — холодный, экспертный, аналитический. Без агрессивных продаж.
- Конкретика: цифры, проценты, сроки, реальные условия рынка 2026 года. Упоминай ограничения ЦБ РФ по ставкам, ПСК, Закон о потребительском кредите 353-ФЗ.

---

### 2. СТРУКТУРА И SEO
- Объём: 4 000–7 000 знаков с пробелами.
- Один <h1> в начале (содержит главный ключ).
- Не менее 4 блоков <h2>, минимум 2 блока <h3>.
- Обязательно: 1 таблица <table> для сравнения (ставки, сроки, суммы, особенности).
- Обязательно: 1-2 списка <ul> или <ol>.
- Внутренняя перелинковка (вставь органично): ${links}

---

### 3. ПАРТНЁРСКИЙ БЛОК
Вставь маркер строго в одно место — туда, где пользователь максимально готов к действию (после первого <h2> с разбором критериев выбора):
<!-- OFFERS_WIDGET_HERE -->

---

### 4. FAQ с микроразметкой Schema.org
В конце статьи создай ровно 4 острых вопроса-ответа (FAQ). Оберни в валидный JSON-LD:
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [...]
}
</script>

---

### 5. ФОРМАТ ОТВЕТА — СТРОГО JSON
Верни ТОЛЬКО чистый JSON без каких-либо вводных слов, без markdown-кода, без блоков \`\`\`json:
{
  "title": "SEO-Title до 70 символов с триггерами: 2026, онлайн, срочно",
  "description": "Meta-Description до 160 символов с призывом к действию",
  "html_content": "Полный HTML от <h1> до закрывающего </script> микроразметки FAQ"
}`;
}

/* ─── Parse JSON response ─────────────────────────────────────── */
function parseResponse(raw) {
  const cleaned = raw
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in response');
  return JSON.parse(cleaned.slice(start, end + 1));
}

/* ─── Build full HTML page ────────────────────────────────────── */
function buildPage(keyword, slug, category, offersData, parsed, date) {
  const { title, description, html_content } = parsed;
  const offers = pickOffers(offersData, category, OFFERS_IN_WIDGET);
  const widget  = renderWidget(offers, category);
  const articleHtml   = html_content.replace('<!-- OFFERS_WIDGET_HERE -->', widget);
  const sidebarWidget = renderWidget(offers.slice(0, 3), category);

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${BASE_URL}/blog/${slug}/">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${BASE_URL}/blog/${slug}/">
  <meta property="og:type" content="article">
  <meta property="article:published_time" content="${date}T10:00:00+03:00">
  <meta property="article:modified_time" content="${date}T10:00:00+03:00">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${title.replace(/"/g, '\\"')}",
    "description": "${description.replace(/"/g, '\\"')}",
    "datePublished": "${date}",
    "dateModified": "${date}",
    "author": {"@type": "Organization", "name": "Evora Finance"},
    "publisher": {"@type": "Organization", "name": "Evora Finance", "url": "${BASE_URL}"}
  }
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>

<header class="site-header">
  <div class="container">
    <div class="header-inner">
      <a href="/" class="logo">
        <div class="logo-icon">E</div>
        <div class="logo-text">Evora <span>Finance</span></div>
      </a>
      <nav class="site-nav">
        <a href="/">МФО</a>
        <a href="/karty/">Карты</a>
        <a href="/kredity/">Кредиты</a>
        <a href="/kredity-pod-zalog-nedvizhimosti/">Залог</a>
        <a href="/rko/">РКО</a>
        <a href="/blog/" class="active">Блог</a>
      </nav>
      <div class="header-badge">Обновлено сегодня</div>
      <div class="burger"><span></span><span></span><span></span></div>
    </div>
  </div>
</header>

<section class="page-hero" style="padding:32px 0 40px;">
  <div class="container">
    <div class="page-hero-breadcrumb">
      <a href="/">Главная</a><span>/</span><a href="/blog/">Блог</a><span>/</span>Статья
    </div>
  </div>
</section>

<div class="container section">
  <div class="article-layout">
    <article class="article-body">
      ${articleHtml}
    </article>
    <aside class="article-sidebar">
      <div class="sidebar-widget">
        <div class="sidebar-widget-title">📌 Лучшие предложения</div>
        ${sidebarWidget}
      </div>
      <div class="sidebar-widget">
        <div class="sidebar-widget-title">📚 Разделы сайта</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <a href="/blog/" style="font-size:13px;color:var(--blue);">← Все статьи</a>
          <a href="/" style="font-size:13px;color:var(--gray-600);">МФО и займы</a>
          <a href="/karty/" style="font-size:13px;color:var(--gray-600);">Кредитные карты</a>
          <a href="/kredity/" style="font-size:13px;color:var(--gray-600);">Кредиты наличными</a>
          <a href="/kredity-pod-zalog-nedvizhimosti/" style="font-size:13px;color:var(--gray-600);">Кредит под залог</a>
          <a href="/rko/" style="font-size:13px;color:var(--gray-600);">РКО для бизнеса</a>
        </div>
      </div>
    </aside>
  </div>
</div>

<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <div class="footer-logo">
          <div class="logo-icon">E</div>
          <div class="logo-text" style="color:var(--white)">Evora <span style="color:#60a5fa">Finance</span></div>
        </div>
        <p class="footer-desc">Независимый финансовый агрегатор.</p>
      </div>
      <div>
        <div class="footer-col-title">Продукты</div>
        <div class="footer-links">
          <a href="/">МФО</a><a href="/karty/">Карты</a><a href="/kredity/">Кредиты</a>
          <a href="/kredity-pod-zalog-nedvizhimosti/">Залог</a><a href="/rko/">РКО</a>
        </div>
      </div>
      <div><div class="footer-col-title">Блог</div><div class="footer-links"><a href="/blog/">Все статьи</a></div></div>
      <div><div class="footer-col-title">ЦБ РФ</div><div class="footer-links"><a href="https://cbr.ru/" target="_blank" rel="noopener">cbr.ru</a></div></div>
    </div>
    <div class="footer-bottom">
      <p class="footer-disclaimer">Сайт не является финансовой организацией, не выдаёт кредиты и не берёт плату за услуги. Информация носит ознакомительный характер. Все товарные знаки принадлежат их правообладателям. <strong>18+</strong></p>
      <div class="footer-copy"><span>© 2026 Evora Finance</span></div>
    </div>
  </div>
</footer>

<script src="/js/main.js"></script>
</body>
</html>`;
}

/* ─── Git commit + push ───────────────────────────────────────── */
function gitCommitPush(slug, keyword) {
  try {
    execSync(`git add blog/${slug}/ sitemap.xml blog/index.html`, { cwd: ROOT, stdio: 'pipe' });
    execSync(`git commit -m "feat: статья — ${keyword.slice(0, 60)}"`, { cwd: ROOT, stdio: 'pipe' });
    execSync('git push', { cwd: ROOT, stdio: 'pipe' });
    console.log('   📤 Pushed to GitHub');
  } catch (e) {
    console.error('   ⚠️  Git error:', e.message.slice(0, 120));
  }
}

/* ─── Rebuild blog/index.html from generated articles ────────── */
function rebuildBlogIndex() {
  const entries = [];
  if (!fs.existsSync(BLOG_DIR)) return;
  for (const slug of fs.readdirSync(BLOG_DIR)) {
    const file = path.join(BLOG_DIR, slug, 'index.html');
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const descMatch  = html.match(/<meta name="description" content="([^"]+)"/);
    const dateMatch  = html.match(/"datePublished":\s*"([^"]+)"/);
    if (!titleMatch) continue;
    entries.push({
      slug,
      title: titleMatch[1],
      description: descMatch  ? descMatch[1]  : '',
      date:        dateMatch   ? dateMatch[1]   : '2026-01-01',
    });
  }
  entries.sort((a, b) => b.date.localeCompare(a.date));

  const cards = entries.map(e => `    <a href="/blog/${e.slug}/" class="blog-card">
      <div class="blog-card-body">
        <div class="blog-card-title">${e.title}</div>
        <div class="blog-card-desc">${e.description.slice(0, 120)}</div>
        <div class="blog-card-meta">${e.date} · Evora Finance</div>
      </div>
    </a>`).join('\n');

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Финансовый блог — советы по займам, картам и кредитам 2026 | Evora Finance</title>
  <meta name="description" content="Экспертные статьи о займах, кредитных картах, кредитах наличными и РКО. Актуальные обзоры, сравнения и советы от Evora Finance.">
  <link rel="canonical" href="${BASE_URL}/blog/">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>

<header class="site-header">
  <div class="container">
    <div class="header-inner">
      <a href="/" class="logo">
        <div class="logo-icon">E</div>
        <div class="logo-text">Evora <span>Finance</span></div>
      </a>
      <nav class="site-nav">
        <a href="/">МФО</a>
        <a href="/karty/">Карты</a>
        <a href="/kredity/">Кредиты</a>
        <a href="/kredity-pod-zalog-nedvizhimosti/">Залог</a>
        <a href="/rko/">РКО</a>
        <a href="/blog/" class="active">Блог</a>
      </nav>
      <div class="header-badge">Обновлено сегодня</div>
      <div class="burger"><span></span><span></span><span></span></div>
    </div>
  </div>
</header>

<section class="page-hero">
  <div class="container">
    <div class="page-hero-breadcrumb"><a href="/">Главная</a><span>/</span>Блог</div>
    <h1 class="page-hero-title">Финансовый блог</h1>
    <p class="page-hero-sub">Экспертные обзоры займов, кредитных карт, кредитов и РКО</p>
  </div>
</section>

<div class="container section">
  <div class="blog-grid">
${cards}
  </div>
</div>

<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <div class="footer-logo">
          <div class="logo-icon">E</div>
          <div class="logo-text" style="color:var(--white)">Evora <span style="color:#60a5fa">Finance</span></div>
        </div>
        <p class="footer-desc">Независимый финансовый агрегатор.</p>
      </div>
      <div>
        <div class="footer-col-title">Продукты</div>
        <div class="footer-links">
          <a href="/">МФО</a><a href="/karty/">Карты</a><a href="/kredity/">Кредиты</a>
          <a href="/kredity-pod-zalog-nedvizhimosti/">Залог</a><a href="/rko/">РКО</a>
        </div>
      </div>
      <div><div class="footer-col-title">Блог</div><div class="footer-links"><a href="/blog/">Все статьи</a></div></div>
      <div><div class="footer-col-title">ЦБ РФ</div><div class="footer-links"><a href="https://cbr.ru/" target="_blank" rel="noopener">cbr.ru</a></div></div>
    </div>
    <div class="footer-bottom">
      <p class="footer-disclaimer">Сайт не является финансовой организацией, не выдаёт кредиты и не берёт плату за услуги. Информация носит ознакомительный характер. Все товарные знаки принадлежат их правообладателям. <strong>18+</strong></p>
      <div class="footer-copy"><span>© 2026 Evora Finance</span></div>
    </div>
  </div>
</footer>

<script src="/js/main.js"></script>
</body>
</html>`;

  fs.writeFileSync(path.join(BLOG_DIR, 'index.html'), html, 'utf8');
}

/* ─── Sleep helper ────────────────────────────────────────────── */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ─── Main loop ───────────────────────────────────────────────── */
async function main() {
  const offersData = JSON.parse(fs.readFileSync(OFFERS_FILE, 'utf8'));
  const { submitUrls } = require('./indexnow');
  const buildSitemap   = require('./build-sitemap');

  const keywords = fs.readFileSync(KEYWORDS_TXT, 'utf8')
    .split('\n').map(l => l.trim()).filter(Boolean);

  console.log(`\n🚀 Evora Finance — Continuous Generator`);
  console.log(`   Model   : ${MODEL}`);
  console.log(`   Keywords: ${keywords.length}`);
  if (LIMIT) console.log(`   Limit   : ${LIMIT}`);
  if (DRY)   console.log(`   Mode    : DRY RUN (no API calls)`);

  let generated = 0;
  let skipped   = 0;
  const date    = new Date().toISOString().slice(0, 10);

  for (const keyword of keywords) {
    if (LIMIT && generated >= LIMIT) break;

    const category = detectCategory(keyword);
    const slug     = toSlug(keyword);
    const outFile  = path.join(BLOG_DIR, slug, 'index.html');

    if (fs.existsSync(outFile)) {
      skipped++;
      continue;
    }

    if (DRY) {
      console.log(`  [DRY] ${slug}  (${category})`);
      generated++;
      continue;
    }

    console.log(`\n📝 [${generated + 1}] "${keyword}"`);
    console.log(`   Category: ${category}  →  /blog/${slug}/`);

    try {
      const prompt = buildPrompt(keyword, category);
      const msg    = await client.messages.create({
        model: MODEL, max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      });
      const raw    = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const parsed = parseResponse(raw);

      if (!parsed.html_content) throw new Error('html_content missing');

      const fullHtml = buildPage(keyword, slug, category, offersData, parsed, date);
      fs.mkdirSync(path.join(BLOG_DIR, slug), { recursive: true });
      fs.writeFileSync(outFile, fullHtml, 'utf8');
      console.log(`   ✅ Saved | ${parsed.title.slice(0, 55)}`);

      // Rebuild blog index and sitemap
      rebuildBlogIndex();
      buildSitemap();

      // Commit and push
      gitCommitPush(slug, keyword);

      // Ping IndexNow
      await submitUrls([`${BASE_URL}/blog/${slug}/`]);

      generated++;
    } catch (err) {
      console.error(`   ❌ Error: ${err.message.slice(0, 100)}`);
    }

    // Pause to respect API rate limits
    await sleep(DELAY_MS);
  }

  console.log(`\n🎉 Done: ${generated} generated, ${skipped} skipped.`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });

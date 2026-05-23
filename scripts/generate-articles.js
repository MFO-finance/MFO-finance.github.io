#!/usr/bin/env node
/**
 * Evora Finance — AI SEO Article Generator
 *
 * Reads topics from src/data/keywords.json, enriches prompts with
 * LSI keywords from keywords.txt, calls Anthropic API, injects offer widgets,
 * saves to /blog/[slug]/index.html, rebuilds sitemap and pings IndexNow.
 *
 * Usage:
 *   node scripts/generate-articles.js              # all topics
 *   node scripts/generate-articles.js mfo-2026     # one topic by id
 *   node scripts/generate-articles.js --limit=2    # first N topics
 */

'use strict';

const fs       = require('fs');
const path     = require('path');
const Anthropic = require('@anthropic-ai/sdk');

/* ─── Config ─────────────────────────────────────────────────── */
const BASE_URL        = 'https://mfo-finance.github.io';
const ROOT            = path.resolve(__dirname, '..');
const KEYWORDS_JSON   = path.join(ROOT, 'src', 'data', 'keywords.json');
const KEYWORDS_TXT    = path.join(ROOT, 'keywords.txt');
const OFFERS_FILE     = path.join(ROOT, 'src', 'data', 'offers.json');
const BLOG_DIR        = path.join(ROOT, 'blog');
const MODEL           = 'claude-sonnet-4-6';
const MAX_TOKENS      = 16000;
const OFFERS_IN_WIDGET = 7;

/* ─── CLI args ────────────────────────────────────────────────── */
const args     = process.argv.slice(2);
const LIMIT    = (args.find(a => a.startsWith('--limit=')) || '').replace('--limit=', '') | 0 || null;
const TOPIC_ID = args.find(a => !a.startsWith('--')) || null;

/* ─── Anthropic client ────────────────────────────────────────── */
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('❌  Set ANTHROPIC_API_KEY before running.');
  process.exit(1);
}
const client = new Anthropic({ apiKey });

/* ─── Helpers: money formatting ───────────────────────────────── */
function fmtMoney(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toLocaleString('ru-RU') + ' млн ₽';
  if (n >= 1_000)     return (n / 1_000).toLocaleString('ru-RU') + ' 000 ₽';
  return n + ' ₽';
}

/* ─── Load & group keywords.txt by category ──────────────────── */
function loadTxtKeywords() {
  if (!fs.existsSync(KEYWORDS_TXT)) return { mfo: [], cards: [], credits: [], rko: [], mortgage: [] };

  const lines = fs.readFileSync(KEYWORDS_TXT, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const groups = { mfo: [], cards: [], credits: [], rko: [], mortgage: [] };

  for (const kw of lines) {
    const lc = kw.toLowerCase();
    if (lc.includes('займ') || lc.includes('заем') || lc.includes('мфо'))         groups.mfo.push(kw);
    else if (lc.includes('кредитная карта') || lc.includes('кредитные карты'))     groups.cards.push(kw);
    else if (lc.includes('рко') || lc.includes('расчётный счёт'))                  groups.rko.push(kw);
    else if (lc.includes('залог недвижимости') || lc.includes('ипотека'))          groups.mortgage.push(kw);
    else if (lc.includes('кредит'))                                                 groups.credits.push(kw);
  }
  return groups;
}

/* ─── Pick relevant LSI keywords from txt pool ───────────────── */
function pickLsiKeywords(mainKeyword, category, txtGroups, maxLsi = 30) {
  const pool = txtGroups[category] || [];
  // Prefer keywords sharing words with the main keyword
  const mainWords = new Set(mainKeyword.toLowerCase().split(/\s+/));
  const scored = pool.map(kw => {
    const words = kw.toLowerCase().split(/\s+/);
    const overlap = words.filter(w => mainWords.has(w)).length;
    return { kw, score: overlap };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxLsi).map(x => x.kw);
}

/* ─── Offer widget renderer ───────────────────────────────────── */
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
    const bg  = o.logo_bg  || '#2563eb';
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

/* ─── Build full article HTML page ───────────────────────────── */
function buildPage(topic, offersData, parsed, date) {
  const { title, description, html_content } = parsed;
  const offers = pickOffers(offersData, topic.target_offer_category, OFFERS_IN_WIDGET);
  const widget = renderWidget(offers, topic.target_offer_category);

  // Replace the placeholder the AI was told to insert
  const articleHtml = html_content.replace('<!-- OFFERS_WIDGET_HERE -->', widget);

  // Sidebar: top-3 offers
  const sidebarWidget = renderWidget(offers.slice(0, 3), topic.target_offer_category);

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${BASE_URL}/blog/${topic.slug}/">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${BASE_URL}/blog/${topic.slug}/">
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

/* ─── Build the generation prompt ────────────────────────────── */
function buildPrompt(topic, lsiKeywords) {
  const category = topic.category;
  const allKeywords = [...topic.keywords, ...lsiKeywords].join(', ');

  // Internal linking map by category
  const linkingMap = {
    mfo:      [
      { href: '/karty/',   anchor: 'лучшие кредитные карты с кэшбэком' },
      { href: '/kredity/', anchor: 'кредиты наличными без залога' },
    ],
    cards:    [
      { href: '/',         anchor: 'займы онлайн без отказа' },
      { href: '/kredity/', anchor: 'потребительские кредиты банков' },
    ],
    rko:      [
      { href: '/',         anchor: 'быстрые займы для бизнеса' },
      { href: '/kredity/', anchor: 'кредиты для ИП и ООО' },
    ],
    mortgage: [
      { href: '/kredity/', anchor: 'потребительские кредиты без залога' },
      { href: '/',         anchor: 'займы под залог онлайн' },
    ],
    credits:  [
      { href: '/',         anchor: 'микрозаймы на карту без отказа' },
      { href: '/karty/',   anchor: 'кредитные карты с льготным периодом' },
    ],
  };
  const links = (linkingMap[category] || [])
    .map(l => `<a href="${l.href}">${l.anchor}</a>`)
    .join(', ');

  return `Ты — профессиональный финансовый аналитик, экспертный копирайтер и топовый SEO-оптимизатор (уровень Senior). Твоя цель — писать экспертные, живые и конвертящие статьи для финансового агрегатора "Evora Finance", оптимизированные под требования Яндекса (YMYL, E-A-T, Баден-Баден) и коммерческий интент 2026 года.

### НАШ КЛЮЧЕВОЙ ЗАПРОС ДЛЯ ТЕКУЩЕЙ СТАТЬИ:
"${topic.main_keyword}" (Категория: ${category})

---

### 1. ТРЕБОВАНИЯ К СТИЛЮ И СНИЖЕНИЮ «РОБОТНОСТИ»
- Исключи «ИИ-штампы»: "в современном мире", "немаловажно", "критически важно", "стоит отметить", "таким образом", "рассмотрим подробнее", "в заключение".
- Живой синтаксис: чередуй длинные предложения с короткими. Тон — холодный, экспертный, аналитический, понятный человеческим языком. Без агрессивных продаж.
- Конкретика вместо «воды»: цифры, проценты, сроки, реальные условия рынка 2026 года. Упоминай ограничения ЦБ РФ по ставкам, ПСК, Закон о потребительском кредите 353-ФЗ.

---

### 2. СТРУКТУРА И SEO
- Объём: 4 000–7 000 знаков с пробелами.
- Один <h1> в начале (содержит главный ключ).
- Не менее 4 блоков <h2>, минимум 2 блока <h3>.
- Обязательно: 1 таблица <table> для сравнения (ставки, сроки, суммы, особенности).
- Обязательно: 1-2 списка <ul> или <ol>.
- LSI-ключи для органичного распределения: ${allKeywords.slice(0, 400)}
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

/* ─── Call Anthropic API ──────────────────────────────────────── */
async function callApi(prompt) {
  const msg = await client.messages.create({
    model:      MODEL,
    max_tokens: MAX_TOKENS,
    messages:   [{ role: 'user', content: prompt }],
  });
  return msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
}

/* ─── Parse JSON from API response ───────────────────────────── */
function parseResponse(raw) {
  // Strip possible markdown fences
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/,  '')
    .trim();

  // Find first { … } that looks like our object
  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in response');

  return JSON.parse(cleaned.slice(start, end + 1));
}

/* ─── Generate one article ────────────────────────────────────── */
async function generateArticle(topic, offersData, txtGroups) {
  console.log(`\n📝 "${topic.article_title}"`);
  console.log(`   → /blog/${topic.slug}/`);

  const lsi    = pickLsiKeywords(topic.main_keyword, topic.target_offer_category, txtGroups);
  const prompt = buildPrompt(topic, lsi);

  const raw    = await callApi(prompt);
  const parsed = parseResponse(raw);

  if (!parsed.html_content) throw new Error('html_content missing from API response');

  const date    = new Date().toISOString().slice(0, 10);
  const fullHtml = buildPage(topic, offersData, parsed, date);

  const dir = path.join(BLOG_DIR, topic.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), fullHtml, 'utf8');

  console.log(`   ✅ Saved  | title: ${parsed.title.slice(0, 60)}`);
  return `${BASE_URL}/blog/${topic.slug}/`;
}

/* ─── Main ────────────────────────────────────────────────────── */
async function main() {
  const keywordsData = JSON.parse(fs.readFileSync(KEYWORDS_JSON, 'utf8'));
  const offersData   = JSON.parse(fs.readFileSync(OFFERS_FILE,   'utf8'));
  const txtGroups    = loadTxtKeywords();

  let topics = keywordsData.clusters;
  if (TOPIC_ID) topics = topics.filter(t => t.id === TOPIC_ID);
  if (LIMIT)    topics = topics.slice(0, LIMIT);
  if (!topics.length) { console.error('No matching topics.'); process.exit(1); }

  console.log(`\n🚀 Evora Finance Article Generator`);
  console.log(`   Model  : ${MODEL}`);
  console.log(`   Topics : ${topics.length}`);
  console.log(`   LSI pool: mfo=${txtGroups.mfo.length} cards=${txtGroups.cards.length} credits=${txtGroups.credits.length}`);

  const generated = [];
  for (const topic of topics) {
    try {
      const url = await generateArticle(topic, offersData, txtGroups);
      generated.push(url);
    } catch (err) {
      console.error(`   ❌ ${topic.id}: ${err.message}`);
    }
  }

  // Rebuild sitemap
  console.log('\n🗺  Rebuilding sitemap…');
  require('./build-sitemap');

  // Ping IndexNow (Yandex + Bing)
  if (generated.length) {
    const { submitUrls } = require('./indexnow');
    await submitUrls(generated);
  }

  console.log(`\n🎉 Done: ${generated.length}/${topics.length} articles generated.`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });

#!/usr/bin/env node
/**
 * Эвора Финанс — AI SEO Article Generator
 *
 * Optimised for cost:
 *   • Prompt Caching  — SEO system prompt cached (ephemeral), -90% input token cost
 *   • Hybrid assembly — Claude returns Markdown only; HTML/schema built locally
 *   • max_tokens 2500 — sufficient for ~6 000 chars of clean prose
 *
 * Usage:
 *   node scripts/generate-articles.js              # all topics
 *   node scripts/generate-articles.js mfo-2026     # one topic by id
 *   node scripts/generate-articles.js --limit=2    # first N topics
 */

'use strict';

const fs        = require('fs');
const path      = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { generateCover } = require('./generate-covers');

/* ─── Config ─────────────────────────────────────────────────── */
const BASE_URL         = 'https://mfo-finance.github.io';
const ROOT             = path.resolve(__dirname, '..');
const KEYWORDS_JSON    = path.join(ROOT, 'src', 'data', 'keywords.json');
const KEYWORDS_TXT     = path.join(ROOT, 'keywords.txt');
const OFFERS_FILE      = path.join(ROOT, 'src', 'data', 'offers.json');
const BLOG_DIR         = path.join(ROOT, 'blog');
const MODEL            = 'claude-sonnet-4-6';
const MAX_TOKENS       = 4500;
const OFFERS_IN_WIDGET = 7;

/* ─── CLI args ────────────────────────────────────────────────── */
const args     = process.argv.slice(2);
const LIMIT    = (args.find(a => a.startsWith('--limit=')) || '').replace('--limit=', '') | 0 || null;
const TOPIC_ID = args.find(a => !a.startsWith('--')) || null;

/* ─── Anthropic client ────────────────────────────────────────── */
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error('❌  Set ANTHROPIC_API_KEY before running.'); process.exit(1); }
const client = new Anthropic({ apiKey });

/* ─────────────────────────────────────────────────────────────────
   SYSTEM PROMPT — static SEO rules, cached via cache_control.
   Keep it large (>1024 tokens) so Anthropic caches reliably.
   ───────────────────────────────────────────────────────────────── */
const SYSTEM_PROMPT = `Ты — профессиональный финансовый аналитик, экспертный копирайтер и топовый SEO-оптимизатор (уровень Senior). Твоя цель — писать экспертные, живые и конвертящие статьи для финансового агрегатора "Эвора Финанс", оптимизированные под требования Яндекса (YMYL, E-A-T, Баден-Баден) и коммерческий интент 2026 года.

═══════════════════════════════════════════════
БЛОК А — ТРЕБОВАНИЯ К СТИЛЮ И СНИЖЕНИЮ «РОБОТНОСТИ»
═══════════════════════════════════════════════

Запрещённые ИИ-штампы (никогда не используй):
— "в современном мире", "немаловажно", "критически важно"
— "стоит отметить", "таким образом", "рассмотрим подробнее"
— "в заключение", "следует отметить", "необходимо учитывать"
— "данный продукт", "является оптимальным выбором"

Обязательный стиль:
— Живой синтаксис: чередуй длинные предложения с короткими (2–5 слов).
— Тон — холодный, экспертный, аналитический, человеческим языком. Без агрессивных продаж.
— Конкретика: цифры, проценты, сроки, реальные условия рынка 2026 г��да.
— Упоминай регуляторику: ЦБ РФ, ПСК, Закон о потребительском кредите 353-ФЗ, ограничение 0,8% в день.

═══════════════════════════════════════════════
БЛОК Б — СТРУКТУРА И SEO-ТРЕБОВАНИЯ
═══════════════════════════════════════════════

Объём: 4 000–6 000 знаков с пробелами чистого текста.
Структура заголовков:
— 1 заголовок H1 в самом начале (содержит главный ключ, title-case)
— Минимум 4 заголовка H2
— Минимум 2 заголовка H3

Обязательные элемен��ы:
— 1 сравнительная таблица (ставки / сроки / суммы / условия конкурентов)
— 1–2 списка (маркированный или нумерованный)
— Органичное распределение LSI-ключей без переспама
— Внутренняя перелинковка по схеме из задания

YMYL-требования (финансовый контент):
— Не давай юридических советов, только информацию
— Не обещай 100% одобрения
— Не указывай конкретные ставки как гарантированные
— Используй "от X%" и "как правило"

═══════════════════════════════════════════════
БЛОК В — ПАРТНЁРСКИЙ БЛОК
═══════════════════════════════════════════════

Вставь маркер ровно в одном месте — туда, где читатель максимально готов к действию (после первого H2 с разбором критериев выбора):

OFFERS_WIDGET_HERE

Маркер должен стоять на отдельной строке без других символов.

═══════════════════════════════════════════════
БЛОК Г — FAQ (4 вопроса)
═══════════════════════════════════════════════

В конце статьи создай ровно 4 вопроса-ответа FAQ.
Формат — строго как Markdown-секция:

## FAQ

**Вопрос 1?**
Ответ 1. Развёрнутый, 2–4 предложения.

**Вопрос 2?**
Ответ 2.

**Вопрос 3?**
Ответ 3.

**Вопрос 4?**
Ответ 4.

Вопросы должны быть острыми, реально востребованными, без канцелярита.

═══════════════════════════════════════════════
БЛОК Д — ФОРМАТ ОТВЕТА (СТРОГО СОБЛЮДАТЬ)
═══════════════════════════════════════════════

Верни ответ СТРОГО в следующем формате с XML-тегами. Никаких вводных слов до тега <TITLE>.

<TITLE>SEO-заголовок до 70 символов. Начинается с ключевого слова. НЕ содержит год (2026, 2025 и т.п.) — ни в начале, ни в конце, ни в середине.</TITLE>
<DESCRIPTION>Meta-description до 160 символов. Содержит главный ключ, цифры, призыв к действию.</DESCRIPTION>
<MARKDOWN>
Полный Markdown-текст статьи от # H1 до последнего ответа FAQ.
</MARKDOWN>

ВАЖНО:
— Внутри <MARKDOWN> используй стандартный Markdown: # H1, ## H2, ### H3, **bold**, таблицы, списки.
— Таблицы в формате: | Колонка | Колонка | / |---|---| / | Значение |
— Никаких HTML-тегов внутри MARKDOWN.
— Партнёрский маркер вставляй как отдельную строку: OFFERS_WIDGET_HERE
— Объём Markdown: 4 000–5 500 знаков. Не превышай, чтобы уложиться в лимит.`;

/* ─── Helpers: money formatting ───────────────────────────────── */
function fmtMoney(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toLocaleString('ru-RU') + ' млн ₽';
  if (n >= 1_000)     return (n / 1_000).toLocaleString('ru-RU') + ' 000 ₽';
  return n + ' ₽';
}

/* ─── Load & group keywords.txt by category ──────────────────── */
function loadTxtKeywords() {
  if (!fs.existsSync(KEYWORDS_TXT)) return { mfo: [], cards: [], credits: [], rko: [], mortgage: [] };
  const lines = fs.readFileSync(KEYWORDS_TXT, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
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

/* ─── Pick relevant LSI keywords ─────────────────────────────── */
function pickLsiKeywords(mainKeyword, category, txtGroups, maxLsi = 30) {
  const pool = txtGroups[category] || [];
  const mainWords = new Set(mainKeyword.toLowerCase().split(/\s+/));
  const scored = pool.map(kw => {
    const overlap = kw.toLowerCase().split(/\s+/).filter(w => mainWords.has(w)).length;
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
    const bg  = o.logo_bg || '#2563eb';
    const clr = o.logo_text_color || '#fff';
    let params = '';
    if (category === 'mfo')          params = `0% первый займ · до ${fmtMoney(o.amount_max)} · ${o.approval_time}`;
    else if (category === 'cards')   params = `0% до ${o.grace_period || o.installment_months || '—'} дней · ${fmtMoney(o.credit_limit_max)} · ${o.annual_fee_text}`;
    else if (category === 'rko')     params = `от ${o.monthly_fee_min === 0 ? 'бесплатно' : o.monthly_fee_min + ' ₽/мес'} · открытие ${o.opening_time}`;
    else if (category === 'mortgage') params = `от ${o.rate_year_min}% · до ${fmtMoney(o.amount_max)} · ${o.approval_time}`;
    else if (category === 'credits') params = `от ${o.rate_year_min}% · до ${fmtMoney(o.amount_max)} · ${o.approval_time}`;
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

/* ─── Markdown → HTML (local, no API cost) ───────────────────── */
function markdownToHtml(md) {
  let html = md
    // Headings
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm,  '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,   '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,    '<h1>$1</h1>')
    // Bold / italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    // Markdown tables → HTML tables
    .replace(/(?:(?:\|[^\n]+\|\n)+)/g, matchTable);

  // Lists: collect consecutive lines starting with - or *
  html = html
    .replace(/((?:^[-*] .+\n?)+)/gm, block => {
      const items = block.trim().split('\n')
        .map(l => `  <li>${l.replace(/^[-*] /, '')}</li>`)
        .join('\n');
      return `<ul>\n${items}\n</ul>\n`;
    })
    .replace(/((?:^\d+\. .+\n?)+)/gm, block => {
      const items = block.trim().split('\n')
        .map(l => `  <li>${l.replace(/^\d+\. /, '')}</li>`)
        .join('\n');
      return `<ol>\n${items}\n</ol>\n`;
    });

  // Paragraphs: wrap non-tag lines
  html = html.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    if (/^<[houlp]|^OFFERS_WIDGET_HERE/.test(trimmed)) return trimmed;
    return `<p>${trimmed}</p>`;
  }).join('\n');

  return html;
}

function matchTable(block) {
  const rows = block.trim().split('\n').filter(r => r.trim());
  if (rows.length < 2) return block;

  const parseRow = r => r.split('|').map(c => c.trim()).filter(Boolean);
  const headers  = parseRow(rows[0]);
  // rows[1] is the separator line (---|---), skip it
  const body     = rows.slice(2);

  const thead = '<thead><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead>';
  const tbody = '<tbody>' + body.map(r => {
    const cells = parseRow(r);
    return '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
  }).join('') + '</tbody>';

  return `<table>\n${thead}\n${tbody}\n</table>\n`;
}

/* ─── Extract FAQ section and build Schema.org JSON-LD ───────── */
function extractFaqSchema(md) {
  const faqMatch = md.match(/## FAQ\s*([\s\S]+)$/i);
  if (!faqMatch) return '';

  const block = faqMatch[1].trim();
  // Each QA: **Question?** followed by answer text until next **
  const pairs = [];
  const qaRegex = /\*\*(.+?\??)\*\*\s*\n([\s\S]+?)(?=\n\*\*|$)/g;
  let m;
  while ((m = qaRegex.exec(block)) !== null) {
    pairs.push({ q: m[1].trim(), a: m[2].trim().replace(/\n+/g, ' ') });
  }
  if (!pairs.length) return '';

  const entities = pairs.map(({ q, a }) => ({
    '@type':          'Question',
    'name':           q,
    'acceptedAnswer': { '@type': 'Answer', 'text': a },
  }));

  return `<script type="application/ld+json">
${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: entities }, null, 2)}
</script>`;
}

/* ─── Build full HTML page from parsed API response ──────────── */
function buildPage(topic, offersData, parsed, date) {
  const { title, description, markdown } = parsed;
  const offers       = pickOffers(offersData, topic.target_offer_category, OFFERS_IN_WIDGET);
  const widget       = renderWidget(offers, topic.target_offer_category);
  const faqSchema    = extractFaqSchema(markdown);
  const articleHtml  = markdownToHtml(markdown).replace('OFFERS_WIDGET_HERE', widget);
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
  <meta property="og:image" content="${BASE_URL}/blog/${topic.slug}/cover.png">
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
    "author": {"@type": "Organization", "name": "Эвора Финанс"},
    "publisher": {"@type": "Organization", "name": "Эвора Финанс", "url": "${BASE_URL}"}
  }
  </script>
  ${faqSchema}
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
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
        <div class="logo-icon">Э</div>
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
        <nav class="sidebar-nav">
          <a href="/blog/">← Все статьи</a>
          <a href="/">МФО и займы</a>
          <a href="/karty/">Кредитные карты</a>
          <a href="/kredity/">Кредиты наличными</a>
          <a href="/kredity-pod-zalog-nedvizhimosti/">Кредит под залог</a>
          <a href="/rko/">РКО для бизнеса</a>
        </nav>
      </div>
    </aside>
  </div>
</div>

<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <div class="footer-logo">
          <div class="logo-icon">Э</div>
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
      <div class="footer-copy"><span>© 2026 Эвора Финанс</span></div>
    </div>
  </div>
</footer>

<script src="/js/main.js"></script>
</body>
</html>`;
}

/* ─── Build variable user message (cheap, not cached) ────────── */
function buildUserMessage(topic, lsiKeywords) {
  const category    = topic.category;
  const allKeywords = [...topic.keywords, ...lsiKeywords].join(', ');

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
  const links = (linkingMap[category] || [])
    .map(l => `<a href="${l.href}">${l.anchor}</a>`)
    .join(', ');

  return `ЗАДАНИЕ НА СТАТЬЮ:
Главный ключ: "${topic.main_keyword}"
Категория: ${category}
LSI-ключи: ${allKeywords.slice(0, 500)}
Внутренние ссылки: ${links}`;
}

/* ─── Call Anthropic API with prompt caching ─────────────────── */
async function callApi(userMessage) {
  const msg = await client.messages.create({
    model:      MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type:          'text',
        text:          SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userMessage }],
  });

  // Log cache usage if available
  const usage = msg.usage;
  if (usage) {
    const cached = usage.cache_read_input_tokens || 0;
    const fresh  = usage.cache_creation_input_tokens || 0;
    if (cached || fresh) {
      console.log(`   💾 Cache: read=${cached} created=${fresh} out=${usage.output_tokens}`);
    }
  }

  return msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
}

/* ─── Parse XML-tagged response from API ─────────────────────── */
function parseResponse(raw) {
  const extract = (tag) => {
    const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const m = raw.match(re);
    if (!m) throw new Error(`<${tag}> tag missing from response`);
    return m[1].trim();
  };
  return {
    title:       extract('TITLE'),
    description: extract('DESCRIPTION'),
    markdown:    extract('MARKDOWN'),
  };
}

/* ─── Generate one article ────────────────────────────────────── */
async function generateArticle(topic, offersData, txtGroups) {
  console.log(`\n📝 "${topic.article_title}"`);
  console.log(`   → /blog/${topic.slug}/`);

  const lsi     = pickLsiKeywords(topic.main_keyword, topic.target_offer_category, txtGroups);
  const userMsg = buildUserMessage(topic, lsi);
  const raw     = await callApi(userMsg);
  const parsed  = parseResponse(raw);

  if (!parsed.markdown) throw new Error('MARKDOWN tag missing from API response');

  const date     = new Date().toISOString().slice(0, 10);
  const fullHtml = buildPage(topic, offersData, parsed, date);

  const dir = path.join(BLOG_DIR, topic.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), fullHtml, 'utf8');

  await generateCover(parsed.title, topic.target_offer_category, path.join(dir, 'cover.png'));

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

  console.log(`\n🚀 Эвора Финанс Article Generator`);
  console.log(`   Model    : ${MODEL}`);
  console.log(`   Topics   : ${topics.length}`);
  console.log(`   MaxTokens: ${MAX_TOKENS}`);
  console.log(`   Cache    : ephemeral system prompt`);

  const generated = [];
  for (const topic of topics) {
    try {
      const url = await generateArticle(topic, offersData, txtGroups);
      generated.push(url);
    } catch (err) {
      console.error(`   ❌ ${topic.id}: ${err.message}`);
    }
  }

  console.log('\n🗺  Rebuilding sitemap…');
  require('./build-sitemap');

  if (generated.length) {
    const { submitUrls } = require('./indexnow');
    await submitUrls(generated);
  }

  console.log(`\n🎉 Done: ${generated.length}/${topics.length} articles generated.`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });

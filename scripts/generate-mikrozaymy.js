#!/usr/bin/env node
'use strict';

const fs        = require('fs');
const path      = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const ROOT    = path.resolve(__dirname, '..');
const BASE_URL = 'https://mfo-finance.github.io';
const apiKey  = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error('Set ANTHROPIC_API_KEY first'); process.exit(1); }
const client  = new Anthropic({ apiKey });

async function main() {
  console.log('Generating /mikrozaymy/ page content…');

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    messages: [{
      role: 'user',
      content: `Ты SEO-копирайтер финансового агрегатора "Эвора Финанс".
Напиши SEO-контент для страницы раздела "Микрозаймы" сайта mfo-finance.github.io.

Тема: Микрозаймы / Займы на карту онлайн в Москве
URL: /mikrozaymy/
Title страницы: "Займы на карту онлайн в Москве — сравнить и оформить микрозайм"

Требования к стилю:
— Живой аналитический текст без ИИ-штампов
— Конкретные цифры, ссылки на 353-ФЗ и реестр ЦБ РФ
— Ограничение ставки 0,8% в день по закону
— Москва и МО упомянуты органично, не навязчиво
— Объём: ~2000 знаков текста

Верни в строгом формате XML:
<H2_1>Заголовок первого раздела (7-10 слов)</H2_1>
<TEXT_1>Текст первого раздела (3-4 абзаца)</TEXT_1>
<H2_2>Заголовок второго раздела</H2_2>
<TEXT_2>Текст второго раздела (2-3 абзаца)</TEXT_2>
<ADV_1_ICON>emoji</ADV_1_ICON><ADV_1_TITLE>Краткое название (2-3 слова)</ADV_1_TITLE><ADV_1_TEXT>1-2 предложения</ADV_1_TEXT>
<ADV_2_ICON>emoji</ADV_2_ICON><ADV_2_TITLE>Краткое название</ADV_2_TITLE><ADV_2_TEXT>1-2 предложения</ADV_2_TEXT>
<ADV_3_ICON>emoji</ADV_3_ICON><ADV_3_TITLE>Краткое название</ADV_3_TITLE><ADV_3_TEXT>1-2 предложения</ADV_3_TEXT>
<ADV_4_ICON>emoji</ADV_4_ICON><ADV_4_TITLE>Краткое название</ADV_4_TITLE><ADV_4_TEXT>1-2 предложения</ADV_4_TEXT>
<FAQ_Q1>Вопрос 1</FAQ_Q1><FAQ_A1>Ответ 1 (2-3 предложения)</FAQ_A1>
<FAQ_Q2>Вопрос 2</FAQ_Q2><FAQ_A2>Ответ 2</FAQ_A2>
<FAQ_Q3>Вопрос 3</FAQ_Q3><FAQ_A3>Ответ 3</FAQ_A3>
<META_DESC>Meta-description до 160 символов с ключом и призывом</META_DESC>`
    }]
  });

  const raw = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  console.log('Generated content length:', raw.length);

  const ex = (tag) => {
    const m = raw.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return m ? m[1].trim() : '';
  };

  const h2_1    = ex('H2_1');
  const text1   = ex('TEXT_1');
  const h2_2    = ex('H2_2');
  const text2   = ex('TEXT_2');
  const adv1    = { icon: ex('ADV_1_ICON'), title: ex('ADV_1_TITLE'), text: ex('ADV_1_TEXT') };
  const adv2    = { icon: ex('ADV_2_ICON'), title: ex('ADV_2_TITLE'), text: ex('ADV_2_TEXT') };
  const adv3    = { icon: ex('ADV_3_ICON'), title: ex('ADV_3_TITLE'), text: ex('ADV_3_TEXT') };
  const adv4    = { icon: ex('ADV_4_ICON'), title: ex('ADV_4_TITLE'), text: ex('ADV_4_TEXT') };
  const faq1    = { q: ex('FAQ_Q1'), a: ex('FAQ_A1') };
  const faq2    = { q: ex('FAQ_Q2'), a: ex('FAQ_A2') };
  const faq3    = { q: ex('FAQ_Q3'), a: ex('FAQ_A3') };
  const metaDesc = ex('META_DESC');

  // Convert newlines to <p> tags for text blocks
  const toParagraphs = (txt) => txt.split(/\n\n+/).filter(Boolean).map(p => `<p>${p.trim()}</p>`).join('\n    ');

  const faqSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [faq1, faq2, faq3].map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a }
    }))
  }, null, 2);

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Займы на карту онлайн в Москве — сравнить и оформить микрозайм | Эвора Финанс</title>
  <meta name="description" content="${metaDesc}">
  <link rel="canonical" href="${BASE_URL}/mikrozaymy/">
  <meta property="og:title" content="Займы на карту онлайн в Москве — Эвора Финанс">
  <meta property="og:description" content="${metaDesc}">
  <meta property="og:url" content="${BASE_URL}/mikrozaymy/">
  <meta property="og:type" content="website">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"WebPage","name":"Микрозаймы онлайн в Москве","description":"${metaDesc}","url":"${BASE_URL}/mikrozaymy/"}
  </script>
  <script type="application/ld+json">
${faqSchema}
  </script>
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
        <div class="logo-text">Эвора <span>Финанс</span></div>
      </a>
      <nav class="site-nav">
        <a href="/">МФО</a>
        <a href="/karty/">Карты</a>
        <a href="/kredity/">Кредиты</a>
        <a href="/kredity-pod-zalog-nedvizhimosti/">Залог</a>
        <a href="/rko/">РКО</a>
        <a href="/mikrozaymy/" class="active">Микрозаймы</a>
        <a href="/blog/">Блог</a>
      </nav>
      <div class="header-badge">Обновлено сегодня</div>
      <div class="burger"><span></span><span></span><span></span></div>
    </div>
  </div>
</header>

<section class="page-hero">
  <div class="container">
    <div class="page-hero-breadcrumb">
      <a href="/">Главная</a><span>/</span>Микрозаймы в Москве
    </div>
    <h1 class="page-hero-title">Займы на карту онлайн <span style="color:#60a5fa">в Москве</span></h1>
    <p class="page-hero-subtitle">Сравниваем микрозаймы от проверенных МФО с лицензией ЦБ РФ. Одобрение за 5 минут, перевод мгновенно на карту или через СБП.</p>
  </div>
</section>

<div class="trust-bar">
  <div class="container">
    <div class="trust-bar-inner">
      <div class="trust-item"><span class="icon">🏦</span> Только реестр ЦБ РФ</div>
      <div class="trust-item"><span class="icon">⚡</span> Одобрение за 5 минут</div>
      <div class="trust-item"><span class="icon">💳</span> На карту или через СБП</div>
      <div class="trust-item"><span class="icon">🆓</span> Первый займ 0%</div>
    </div>
  </div>
</div>

<div class="container section">
  <div class="filters-bar">
    <div class="filters-title">Сортировка</div>
    <div class="filters-row">
      <button class="filter-btn active" data-sort="featured">Лучшие предложения</button>
      <button class="filter-btn" data-sort="amount">Максимальная сумма</button>
      <button class="filter-btn" data-sort="rating">По рейтингу</button>
    </div>
  </div>
  <div class="offers-list" id="offers-list"></div>
</div>

<section class="section" style="background:var(--white);border-top:1px solid var(--gray-200);">
  <div class="container">
    <div class="section-header">
      <div class="section-label">Как выбрать</div>
      <h2 class="section-title">На что обратить внимание при выборе займа</h2>
    </div>
    <div class="advantages-grid">
      <div class="advantage-card">
        <div class="advantage-icon">${adv1.icon}</div>
        <div class="advantage-title">${adv1.title}</div>
        <div class="advantage-text">${adv1.text}</div>
      </div>
      <div class="advantage-card">
        <div class="advantage-icon">${adv2.icon}</div>
        <div class="advantage-title">${adv2.title}</div>
        <div class="advantage-text">${adv2.text}</div>
      </div>
      <div class="advantage-card">
        <div class="advantage-icon">${adv3.icon}</div>
        <div class="advantage-title">${adv3.title}</div>
        <div class="advantage-text">${adv3.text}</div>
      </div>
      <div class="advantage-card">
        <div class="advantage-icon">${adv4.icon}</div>
        <div class="advantage-title">${adv4.title}</div>
        <div class="advantage-text">${adv4.text}</div>
      </div>
    </div>
  </div>
</section>

<div class="container section-sm">
  <div class="seo-block">
    <h2>${h2_1}</h2>
    ${toParagraphs(text1)}
    <h3>${h2_2}</h3>
    ${toParagraphs(text2)}
  </div>
</div>

<div class="container section-sm">
  <div class="section-header">
    <div class="section-label">FAQ</div>
    <h2 class="section-title">Часто задаваемые вопросы о микрозаймах</h2>
  </div>
  <div class="faq-list">
    <div class="faq-item">
      <div class="faq-question">${faq1.q}</div>
      <div class="faq-answer">${faq1.a}</div>
    </div>
    <div class="faq-item">
      <div class="faq-question">${faq2.q}</div>
      <div class="faq-answer">${faq2.a}</div>
    </div>
    <div class="faq-item">
      <div class="faq-question">${faq3.q}</div>
      <div class="faq-answer">${faq3.a}</div>
    </div>
  </div>
</div>

<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <div class="footer-logo"><div class="logo-icon">Э</div><div class="logo-text" style="color:var(--white)">Эвора <span style="color:#60a5fa">Финанс</span></div></div>
        <p class="footer-desc">Независимый финансовый агрегатор. Сравниваем займы, карты, кредиты и РКО.</p>
      </div>
      <div>
        <div class="footer-col-title">Продукты</div>
        <div class="footer-links">
          <a href="/">МФО и займы</a><a href="/mikrozaymy/">Микрозаймы</a><a href="/karty/">Кредитные карты</a>
          <a href="/kredity/">Кредиты</a><a href="/kredity-pod-zalog-nedvizhimosti/">Залог</a><a href="/rko/">РКО</a>
        </div>
      </div>
      <div><div class="footer-col-title">Блог</div><div class="footer-links"><a href="/blog/">Все статьи</a></div></div>
      <div><div class="footer-col-title">Реестры ЦБ</div><div class="footer-links"><a href="https://cbr.ru/" target="_blank" rel="noopener">cbr.ru</a></div></div>
    </div>
    <div class="footer-bottom">
      <p class="footer-disclaimer">Сайт не является финансовой организацией, не выдаёт кредиты и не берёт плату за услуги. Информация носит ознакомительный характер. Все товарные знаки принадлежат их правообладателям. <strong>18+</strong></p>
      <div class="footer-copy"><span>© 2026 Эвора Финанс</span></div>
    </div>
  </div>
</footer>

<script src="/js/main.js"></script>
<script>loadAndRenderOffers('offers-list', 'mfo'); initFilters('mfo');</script>
</body>
</html>`;

  const dir = path.join(ROOT, 'mikrozaymy');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
  console.log('✅ Written: /mikrozaymy/index.html');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });

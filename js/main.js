/* Evora Finance — Main JS */

const BASE_URL = 'https://mfo-finance.github.io';

/* ---- Formatters ---- */
function fmtMoney(n) {
  if (n >= 1000000) return (n / 1000000).toLocaleString('ru-RU') + ' млн ₽';
  if (n >= 1000) return (n / 1000).toLocaleString('ru-RU') + ' тыс. ₽';
  return n.toLocaleString('ru-RU') + ' ₽';
}
function fmtRate(offer) {
  if (offer.rate_first_loan === 0) return '0%';
  if (offer.rate_day) return offer.rate_day + '%/день';
  if (offer.rate_year_min) return 'от ' + offer.rate_year_min + '%';
  return '—';
}
function fmtTerm(offer) {
  if (offer.term_min && offer.term_max) {
    if (offer.term_max >= 30) return 'до ' + offer.term_max + ' дн.';
    return offer.term_min + '–' + offer.term_max + ' дн.';
  }
  return '—';
}
function stars(rating) {
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

/* ---- Render offer card ---- */
function renderOfferCard(offer) {
  const logoColor = offer.logo_bg || '#2563eb';
  const textColor = offer.logo_text_color || '#fff';
  const badgeHtml = offer.featured
    ? '<div class="offer-badge">Топ выбор</div>' : '';

  let params = '';
  if (offer.category === 'mfo') {
    params = `
      <div class="offer-params">
        <div class="param"><div class="param-value green">${fmtRate(offer)}</div><div class="param-label">1-й займ</div></div>
        <div class="param"><div class="param-value">${fmtMoney(offer.amount_max)}</div><div class="param-label">Макс. сумма</div></div>
        <div class="param"><div class="param-value">${offer.approval_time}</div><div class="param-label">Решение</div></div>
      </div>`;
  } else if (offer.category === 'cards') {
    params = `
      <div class="offer-params">
        <div class="param"><div class="param-value green">${offer.grace_period > 0 ? '0% / ' + offer.grace_period + ' дн.' : offer.cashback}</div><div class="param-label">${offer.grace_period > 0 ? 'Льготный период' : 'Кэшбэк'}</div></div>
        <div class="param"><div class="param-value">${fmtMoney(offer.credit_limit_max)}</div><div class="param-label">Лимит</div></div>
        <div class="param"><div class="param-value">${offer.annual_fee_text}</div><div class="param-label">Обслуживание</div></div>
      </div>`;
  } else if (offer.category === 'rko') {
    params = `
      <div class="offer-params">
        <div class="param"><div class="param-value green">${offer.monthly_fee_min === 0 ? 'Бесплатно' : 'от ' + offer.monthly_fee_min + ' ₽'}</div><div class="param-label">Тариф/мес</div></div>
        <div class="param"><div class="param-value">${offer.opening_time}</div><div class="param-label">Открытие</div></div>
        <div class="param"><div class="param-value">${offer.cashback_on_spending || '—'}</div><div class="param-label">Кэшбэк</div></div>
      </div>`;
  } else if (offer.category === 'mortgage') {
    params = `
      <div class="offer-params">
        <div class="param"><div class="param-value green">от ${offer.rate_year_min}%</div><div class="param-label">Ставка/год</div></div>
        <div class="param"><div class="param-value">${fmtMoney(offer.amount_max)}</div><div class="param-label">Макс. сумма</div></div>
        <div class="param"><div class="param-value">${offer.approval_time}</div><div class="param-label">Решение</div></div>
      </div>`;
  } else if (offer.category === 'credits') {
    params = `
      <div class="offer-params">
        <div class="param"><div class="param-value green">от ${offer.rate_year_min}%</div><div class="param-label">Ставка/год</div></div>
        <div class="param"><div class="param-value">${fmtMoney(offer.amount_max)}</div><div class="param-label">Макс. сумма</div></div>
        <div class="param"><div class="param-value">${offer.approval_time}</div><div class="param-label">Решение</div></div>
      </div>`;
  }

  const legalName = offer.legal_name || offer.bank_name || '';
  const license = offer.license_cb || '';
  const inn = offer.inn ? `ИНН: ${offer.inn}` : '';
  const legalLine = [legalName, inn, license ? `Лицензия ЦБ: ${license}` : ''].filter(Boolean).join(' · ');

  const tagsHtml = (offer.tags || []).map(t => {
    const cls = t.includes('0%') ? 'green' : '';
    return `<span class="offer-tag ${cls}">${t}</span>`;
  }).join('');

  return `
    <div class="offer-card ${offer.featured ? 'featured' : ''}" data-id="${offer.id}">
      ${badgeHtml}
      <div class="offer-logo" style="background:${logoColor};color:${textColor};">${offer.logo_text}</div>
      <div class="offer-info">
        <div class="offer-name">${offer.name}</div>
        <div class="offer-tagline">${offer.tagline}</div>
        <div class="offer-tags">${tagsHtml}</div>
      </div>
      ${params}
      <div class="offer-action">
        <a href="${offer.url}" target="_blank" rel="noopener sponsored" class="btn-get">Получить →</a>
        <div class="offer-rating"><span class="stars">${stars(offer.rating)}</span> ${offer.rating}</div>
      </div>
      ${legalLine ? `<div class="offer-legal">${legalLine}</div>` : ''}
    </div>`;
}

/* ---- Load and render offers ---- */
async function loadAndRenderOffers(containerId, category, limit) {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const resp = await fetch('/src/data/offers.json');
    const data = await resp.json();
    const offers = data[category] || [];
    const toShow = limit ? offers.slice(0, limit) : offers;

    container.innerHTML = toShow.map(renderOfferCard).join('');

    /* count badge */
    const countEl = document.getElementById('offers-count');
    if (countEl) countEl.textContent = offers.length;
  } catch (e) {
    console.error('Failed to load offers:', e);
    container.innerHTML = '<p class="text-muted text-center mt-2">Не удалось загрузить предложения. Попробуйте обновить страницу.</p>';
  }
}

/* ---- Filter buttons ---- */
function initFilters(category) {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const sort = btn.dataset.sort;
      const container = document.getElementById('offers-list');
      if (!container) return;

      const resp = await fetch('/src/data/offers.json');
      const data = await resp.json();
      let offers = [...(data[category] || [])];

      if (sort === 'rate') offers.sort((a, b) => (a.rate_day || a.rate_year_min || 0) - (b.rate_day || b.rate_year_min || 0));
      else if (sort === 'amount') offers.sort((a, b) => b.amount_max - a.amount_max);
      else if (sort === 'rating') offers.sort((a, b) => b.rating - a.rating);
      else offers.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));

      container.innerHTML = offers.map(renderOfferCard).join('');
    });
  });
}

/* ---- Mobile nav burger ---- */
function initBurger() {
  const burger = document.querySelector('.burger');
  const nav = document.querySelector('.site-nav');
  if (!burger || !nav) return;
  burger.addEventListener('click', () => nav.classList.toggle('open'));
}

/* ---- FAQ accordion ---- */
function initFAQ() {
  document.querySelectorAll('.faq-question').forEach(q => {
    q.addEventListener('click', () => {
      const item = q.closest('.faq-item');
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });
}

/* ---- Init ---- */
document.addEventListener('DOMContentLoaded', () => {
  initBurger();
  initFAQ();
});

(function (global) {
  'use strict';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtMoney(amount, currency) {
    var sym = currency === 'RUB' ? '\u20BD' : (currency || '');
    var n = Number(amount);
    if (!isFinite(n)) n = 0;
    var hasCents = Math.abs(n % 1) > 0.004;
    var s = n.toLocaleString('ru-RU', {
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2
    });
    return sym ? s + '\u00A0' + sym : s;
  }

  function signedMoney(amount, currency) {
    var n = Number(amount);
    return (n >= 0 ? '+' : '\u2212') + fmtMoney(Math.abs(n), currency);
  }

  function stars(n) {
    var full = Math.round(Number(n) || 0);
    var out = '';
    for (var i = 0; i < full; i++) out += '\u2605';
    return out;
  }

  function linkCard(href, inner) {
    return '<a class="bls-return-card" href="' + esc(href) + '" target="_blank" rel="noopener">' + inner + '</a>';
  }

  function render(root, data) {
    var d = data || {};
    var trip = d.trip || {};
    var tr = d.transport || {};
    var hotel = d.hotel || {};
    var split = d.split || {};
    var cur = split.currency || tr.currency || 'RUB';

    var parts = [];

    parts.push(
      '<div class="bls-head">',
      '<span class="bls-kicker">Bleisure</span>',
      '<div class="bls-title">' + esc(trip.origin) + ' \u2192 ' + esc(trip.destination) + '</div>',
      '<p class="bls-subtitle">Командировка ' + esc(trip.departureDate) + ' \u00b7 ' + esc(trip.businessReturnDate) +
        ' \u00b7 продли до ' + esc(trip.leisureReturnDate) + '</p>',
      '</div>'
    );

    if (split.company != null || split.personalTotal != null) {
      var company = Number(split.company) || 0;
      var personal = Number(split.personalTotal) || 0;
      var total = company + personal;
      var companyPct = total > 0 ? (company / total) * 100 : 0;
      var personalPct = total > 0 ? (personal / total) * 100 : 0;

      parts.push(
        '<div class="bls-split">',
        '<div class="bls-split-bar">',
        '<div class="bls-split-company" style="width:' + companyPct.toFixed(2) + '%"></div>',
        '<div class="bls-split-personal" style="width:' + personalPct.toFixed(2) + '%"></div>',
        '</div>',
        '<div class="bls-split-legend">',
        '<span><span class="bls-legend-dot" style="background:var(--bls-company)"></span>Компания</span>',
        '<span><span class="bls-legend-dot" style="background:var(--bls-personal)"></span>Сотрудник</span>',
        '</div>',
        '<div class="bls-split-amounts">',
        '<div class="bls-split-row"><span class="bls-split-label">Компания (рабочий билет)</span><span class="bls-split-value bls-split-value--company">' + fmtMoney(company, cur) + '</span></div>',
        '<div class="bls-split-row"><span class="bls-split-label">Личное (билет + отель)</span><span class="bls-split-value bls-split-value--personal">' + fmtMoney(personal, cur) + '</span></div>',
        '<div class="bls-split-row"><span class="bls-split-label">Итого поездка</span><span class="bls-split-value">' + fmtMoney(total, cur) + '</span></div>',
        '</div>',
        '</div>'
      );
    }

    if (tr.delta != null) {
      parts.push(
        '<div class="bls-punch">Билет до воскресенья \u2014 всего ' + signedMoney(tr.delta, cur) +
        '. Главное личное \u2014 отель на выходные.</div>'
      );
    }

    parts.push('<div class="bls-section">');
    parts.push('<h4 class="bls-section-title">Транспорт \u00b7 ' + esc(tr.modeLabel || '') + '</h4>');
    if (tr.note) parts.push('<p class="bls-note">' + esc(tr.note) + '</p>');

    if (tr.business && tr.business.legs && tr.business.legs.length) {
      parts.push('<div class="bls-legs">');
      tr.business.legs.forEach(function (leg) {
        parts.push(
          '<div class="bls-leg">',
          '<div class="bls-leg-main">',
          '<div class="bls-leg-label">' + esc(leg.label) + '</div>',
          '<div class="bls-leg-time">' + esc(leg.time) + '</div>',
          '</div>',
          '<span class="bls-leg-price">' + fmtMoney(leg.price, cur) + '</span>',
          leg.url ? '<a class="bls-btn bls-btn--ghost" style="width:auto;padding:6px 12px;font-size:12px" href="' + esc(leg.url) + '" target="_blank" rel="noopener">Билет</a>' : '',
          '</div>'
        );
      });
      parts.push('</div>');
    }

    if (tr.bleisure && tr.bleisure.returnLeg) {
      var businessReturn = null;
      if (tr.business && tr.business.legs && tr.business.legs.length > 1) {
        businessReturn = tr.business.legs[tr.business.legs.length - 1];
      }
      parts.push('<div class="bls-return-compare" style="margin-top:10px">');
      if (businessReturn) {
        parts.push(linkCard(businessReturn.url || '#',
          '<div class="bls-return-tag">Рабочий возврат</div>' +
          '<div class="bls-return-time">' + esc(businessReturn.time) + '</div>' +
          '<div class="bls-return-price"><b>' + fmtMoney(businessReturn.price, cur) + '</b></div>'));
      }
      var rl = tr.bleisure.returnLeg;
      parts.push(linkCard(rl.url || '#',
        '<div class="bls-return-tag">Bleisure возврат</div>' +
        '<div class="bls-return-time">' + esc(rl.time) + '</div>' +
        '<div class="bls-return-price"><b>' + fmtMoney(rl.price, cur) + '</b></div>'));
      if (tr.delta != null) {
        parts.push('<div class="bls-delta">Разница на возврате: ' + signedMoney(tr.delta, cur) + '</div>');
      }
      parts.push('</div>');
    }
    parts.push('</div>');

    parts.push('<div class="bls-section">');
    parts.push('<h4 class="bls-section-title">Отель на выходные \u00b7 ' + esc(hotel.checkIn) + ' \u2192 ' + esc(hotel.checkOut) +
      ' \u00b7 ' + esc(hotel.weekendNights) + ' ноч.</h4>');
    parts.push('<p class="bls-note">Личная часть \u2014 проживание на выходные оплачивает сотрудник.</p>');

    if (hotel.recommended) {
      var rec = hotel.recommended;
      parts.push(
        '<div class="bls-hotel-card bls-hotel-card--rec">',
        '<div class="bls-hotel-top">',
        '<div><span class="bls-hotel-name">' + esc(rec.name) + '</span>' +
        '<span class="bls-hotel-stars">' + stars(rec.stars) + '</span></div>',
        '<span class="bls-hotel-price">' + fmtMoney(rec.price, rec.currency || cur) + '</span>',
        '</div>',
        '<div class="bls-hotel-meta">\u2605 ' + esc(rec.rating) + ' \u00b7 ' + esc(rec.reviewCount) + ' отзывов</div>',
        '<div class="bls-hotel-badges">',
        rec.meal ? '<span class="bls-badge bls-badge--ok">' + esc(rec.meal) + '</span>' : '',
        rec.freeCancellation ? '<span class="bls-badge bls-badge--ok">Бесплатная отмена</span>' : '',
        '</div>',
        '<div style="margin-top:8px"><a class="bls-btn bls-btn--primary" href="' + esc(rec.url) + '" target="_blank" rel="noopener">Выбрать номер</a></div>',
        '</div>'
      );
    }

    if (hotel.alternatives && hotel.alternatives.length) {
      hotel.alternatives.forEach(function (alt) {
        parts.push(
          '<div class="bls-hotel-card">',
          '<div class="bls-hotel-top">',
          '<div><span class="bls-hotel-name">' + esc(alt.name) + '</span>' +
          '<span class="bls-hotel-stars">' + stars(alt.stars) + '</span></div>',
          '<span class="bls-hotel-price">' + fmtMoney(alt.price, alt.currency || cur) + '</span>',
          '</div>',
          '<div class="bls-hotel-meta">\u2605 ' + esc(alt.rating) + ' \u00b7 ' + esc(alt.reviewCount) + ' отзывов</div>',
          '<div class="bls-hotel-badges">',
          alt.meal ? '<span class="bls-badge bls-badge--ok">' + esc(alt.meal) + '</span>' : '<span class="bls-badge">Без завтрака</span>',
          alt.freeCancellation ? '<span class="bls-badge bls-badge--ok">Бесплатная отмена</span>' : '',
          '</div>',
          '<div style="margin-top:8px"><a class="bls-btn bls-btn--ghost" href="' + esc(alt.url) + '" target="_blank" rel="noopener">Выбрать номер</a></div>',
          '</div>'
        );
      });
    }
    parts.push('</div>');

    parts.push(
      '<div class="bls-actions">',
      '<a class="bls-btn bls-btn--primary" href="' + esc((hotel.recommended && hotel.recommended.url) || '#') + '" target="_blank" rel="noopener">Продлить поездку \u00b7 +' + fmtMoney(split.personalTotal, cur) + '</a>',
      '</div>'
    );

    parts.push('<div class="bls-footer">' + esc(d.disclaimer || '') + '</div>');

    root.innerHTML = '<div class="bls-widget">' + parts.join('') + '</div>';
  }

  function parseConfig(node) {
    var src = node.getAttribute('data-bleisure-src');
    var raw = node.getAttribute('data-bleisure-widget');
    if (src) {
      fetch(src)
        .then(function (r) { return r.json(); })
        .then(function (data) { render(node, data); })
        .catch(function () {
          if (raw) { try { render(node, JSON.parse(raw)); } catch (e) {} }
        });
      return;
    }
    if (raw) {
      try { render(node, JSON.parse(raw)); } catch (e) {}
    }
  }

  function autoInit() {
    var nodes = global.document.querySelectorAll('[data-bleisure-widget]');
    for (var i = 0; i < nodes.length; i++) parseConfig(nodes[i]);
  }

  global.BleisureWidget = {
    init: render,
    autoInit: autoInit
  };

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', autoInit);
    } else {
      autoInit();
    }
  }
})(window);

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

  function punchText(extendSide, delta, cur) {
    var n = Number(delta);
    var isDep = extendSide === 'departure';
    var verbPos = isDep ? 'Приехать в субботу' : 'Вернуться в воскресенье';
    var verbZero = isDep ? 'Выезд в субботу' : 'Возврат в воскресенье';
    if (n > 0) return verbPos + ' \u2014 ' + signedMoney(n, cur) + ' за билет.';
    if (n < 0) return verbPos + ' даже дешевле на ' + fmtMoney(-n, cur) + '.';
    return verbZero + ' стоит столько же \u2014 продление билета бесплатно.';
  }

  function renderLeg(parts, leg, cur) {
    if (!leg || !leg.options || !leg.options.length) return;
    parts.push('<div class="bls-leg-block">');
    parts.push('<div class="bls-leg-block-head">' + esc(leg.label) + ' · ' + esc(leg.date) + '</div>');
    parts.push('<div class="bls-opts">');
    leg.options.forEach(function (o) {
      parts.push(
        '<div class="bls-opt">',
        '<span class="bls-mode bls-mode--' + esc(o.mode) + '">' + esc(o.modeLabel) + '</span>',
        '<div class="bls-opt-main">',
        '<div class="bls-opt-title">' + esc(o.title) + '</div>',
        '<div class="bls-opt-time">' + esc(o.time) + '</div>',
        '</div>',
        '<span class="bls-opt-price">' + fmtMoney(o.price, cur) + '</span>',
        o.url ? '<a class="bls-btn bls-btn--ghost bls-opt-link" href="' + esc(o.url) + '" target="_blank" rel="noopener">Билет</a>' : '',
        '</div>'
      );
    });
    parts.push('</div></div>');
  }

  function galleryHtml(photos) {
    if (!photos || !photos.length) return '';
    var imgs = photos.map(function (p) {
      return '<img class="bls-gallery-img" src="' + esc(p) + '" alt="" loading="lazy" />';
    }).join('');
    var controls = photos.length > 1
      ? '<button type="button" class="bls-gallery-btn bls-gallery-prev" aria-label="Назад">\u2039</button>' +
        '<button type="button" class="bls-gallery-btn bls-gallery-next" aria-label="Вперёд">\u203A</button>' +
        '<div class="bls-gallery-counter">1 / ' + photos.length + '</div>'
      : '';
    return '<div class="bls-gallery">' +
      '<div class="bls-gallery-track">' + imgs + '</div>' +
      controls +
      '</div>';
  }

  function render(root, data) {
    var d = data || {};
    var trip = d.trip || {};
    var tr = d.transport || {};
    var hotel = d.hotel || {};
    var split = d.split || {};
    var cur = split.currency || tr.currency || 'RUB';
    var isDep = tr.extendSide === 'departure';

    var parts = [];

    parts.push(
      '<div class="bls-head">',
      '<span class="bls-kicker">Bleisure</span>',
      '<div class="bls-title">' + esc(trip.origin) + ' \u2192 ' + esc(trip.destination) + '</div>',
      '<p class="bls-subtitle">' + esc(trip.headline) + '</p>',
      '</div>'
    );

    if (split.company != null || split.personalTotal != null) {
      var company = Number(split.company) || 0;
      var personal = Number(split.personalTotal) || 0;
      var total = company + personal;
      var companyPct = total > 0 ? (company / total) * 100 : 0;
      var personalPct = total > 0 ? (personal / total) * 100 : 0;
      var companyLabel = isDep ? 'Компания (рабочий выезд)' : 'Компания (рабочий возврат)';

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
        '<div class="bls-split-row"><span class="bls-split-label">' + esc(companyLabel) + '</span><span class="bls-split-value bls-split-value--company">' + fmtMoney(company, cur) + '</span></div>',
        '<div class="bls-split-row"><span class="bls-split-label">Личное (продление + отель)</span><span class="bls-split-value bls-split-value--personal">' + fmtMoney(personal, cur) + '</span></div>',
        '<div class="bls-split-row"><span class="bls-split-label">Итого</span><span class="bls-split-value">' + fmtMoney(total, cur) + '</span></div>',
        '</div>',
        '</div>'
      );
    }

    if (tr.delta != null) {
      parts.push('<div class="bls-punch">' + punchText(tr.extendSide, tr.delta, cur) + ' Главная личная часть \u2014 отель на выходные.</div>');
    }

    parts.push('<div class="bls-section">');
    parts.push('<h4 class="bls-section-title">Транспорт · сравнение всех типов</h4>');
    renderLeg(parts, tr.businessLeg, cur);
    renderLeg(parts, tr.leisureLeg, cur);
    if (tr.delta != null) {
      var deltaLabel = isDep ? 'Разница на выезде' : 'Разница на возврате';
      parts.push('<div class="bls-delta">' + deltaLabel + ': ' + signedMoney(tr.delta, cur) + '</div>');
    }
    parts.push('</div>');

    parts.push('<div class="bls-section">');
    parts.push('<h4 class="bls-section-title">Отель на выходные · ' + esc(hotel.checkIn) + ' \u2192 ' + esc(hotel.checkOut) +
      ' · ' + esc(hotel.weekendNights) + ' ноч.</h4>');
    parts.push('<p class="bls-note">Личная часть \u2014 проживание на выходные оплачивает сотрудник.</p>');

    if (hotel.recommended) {
      var rec = hotel.recommended;
      parts.push(
        '<div class="bls-hotel-card bls-hotel-card--rec">',
        galleryHtml(rec.photos),
        '<div class="bls-hotel-body">',
        '<div class="bls-hotel-top">',
        '<div><span class="bls-hotel-name">' + esc(rec.name) + '</span>' +
        '<span class="bls-hotel-stars">' + stars(rec.stars) + '</span></div>',
        '<span class="bls-hotel-price">' + fmtMoney(rec.price, rec.currency || cur) + '</span>',
        '</div>',
        '<div class="bls-hotel-meta">\u2605 ' + esc(rec.rating) + ' · ' + esc(rec.reviewCount) + ' отзывов</div>',
        '<div class="bls-hotel-badges">',
        rec.meal ? '<span class="bls-badge bls-badge--ok">' + esc(rec.meal) + '</span>' : '',
        rec.freeCancellation ? '<span class="bls-badge bls-badge--ok">Бесплатная отмена</span>' : '',
        '</div>',
        '<div style="margin-top:8px"><a class="bls-btn bls-btn--primary" href="' + esc(rec.url) + '" target="_blank" rel="noopener">Выбрать номер</a></div>',
        '</div>',
        '</div>'
      );
    }

    if (hotel.alternatives && hotel.alternatives.length) {
      hotel.alternatives.forEach(function (alt) {
        var thumb = (alt.photos && alt.photos.length)
          ? '<img class="bls-thumb" src="' + esc(alt.photos[0]) + '" alt="" loading="lazy" />'
          : '';
        parts.push(
          '<div class="bls-hotel-card">',
          '<div class="bls-hotel-row">',
          thumb,
          '<div class="bls-hotel-main">',
          '<div class="bls-hotel-top">',
          '<div><span class="bls-hotel-name">' + esc(alt.name) + '</span>' +
          '<span class="bls-hotel-stars">' + stars(alt.stars) + '</span></div>',
          '<span class="bls-hotel-price">' + fmtMoney(alt.price, alt.currency || cur) + '</span>',
          '</div>',
          '<div class="bls-hotel-meta">\u2605 ' + esc(alt.rating) + ' · ' + esc(alt.reviewCount) + ' отзывов</div>',
          '<div class="bls-hotel-badges">',
          alt.meal ? '<span class="bls-badge bls-badge--ok">' + esc(alt.meal) + '</span>' : '<span class="bls-badge">Без завтрака</span>',
          alt.freeCancellation ? '<span class="bls-badge bls-badge--ok">Бесплатная отмена</span>' : '',
          '</div>',
          '<div style="margin-top:8px"><a class="bls-btn bls-btn--ghost" href="' + esc(alt.url) + '" target="_blank" rel="noopener">Выбрать номер</a></div>',
          '</div>',
          '</div>',
          '</div>'
        );
      });
    }
    parts.push('</div>');

    var ctaText = isDep ? 'Приехать раньше · +' : 'Продлить поездку · +';
    parts.push(
      '<div class="bls-actions">',
      '<a class="bls-btn bls-btn--primary" href="' + esc((hotel.recommended && hotel.recommended.url) || '#') + '" target="_blank" rel="noopener">' + ctaText + fmtMoney(split.personalTotal, cur) + '</a>',
      '</div>'
    );

    parts.push('<div class="bls-footer">' + esc(d.disclaimer || '') + '</div>');

    root.innerHTML = '<div class="bls-widget">' + parts.join('') + '</div>';
    attachGalleries(root);
  }

  function attachGalleries(root) {
    var gals = root.querySelectorAll('.bls-gallery');
    for (var i = 0; i < gals.length; i++) {
      (function (gal) {
        var track = gal.querySelector('.bls-gallery-track');
        var counter = gal.querySelector('.bls-gallery-counter');
        var prev = gal.querySelector('.bls-gallery-prev');
        var next = gal.querySelector('.bls-gallery-next');
        if (!track) return;
        function update() {
          if (!counter) return;
          var w = track.clientWidth;
          var idx = w > 0 ? Math.round(track.scrollLeft / w) + 1 : 1;
          var total = track.children.length;
          counter.textContent = idx + ' / ' + total;
        }
        function scrollByDir(dir) {
          track.scrollBy({ left: dir * track.clientWidth, behavior: 'smooth' });
        }
        if (prev) prev.addEventListener('click', function () { scrollByDir(-1); });
        if (next) next.addEventListener('click', function () { scrollByDir(1); });
        track.addEventListener('scroll', update, { passive: true });
        update();
      })(gals[i]);
    }
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

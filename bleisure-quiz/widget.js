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

  function pluralHotels(n) {
    if (n % 10 === 1 && n % 100 !== 11) return 'отель';
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) return 'отеля';
    return 'отелей';
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

  function hotelCardHtml(h, cur, expanded) {
    var thumb = (h.photos && h.photos.length)
      ? '<img class="bls-thumb" src="' + esc(h.photos[0]) + '" alt="" loading="lazy" />'
      : '';
    var rating = h.rating != null
      ? '\u2605 ' + esc(h.rating) + ' · ' + esc(h.reviewCount) + ' отзывов'
      : esc(h.reviewCount) + ' отзывов';

    var b = [];
    if (h.meal) b.push('<span class="bls-badge bls-badge--ok">' + esc(h.meal) + '</span>');
    else b.push('<span class="bls-badge">Без завтрака</span>');
    if (h.freeCancellation) b.push('<span class="bls-badge bls-badge--ok">Бесплатная отмена</span>');
    var badges = b.length ? '<div class="bls-hotel-badges">' + b.join('') + '</div>' : '';

    return '<div class="bls-hotel-card' + (expanded ? ' is-expanded' : '') + '">' +
      '<div class="bls-hotel-head">' +
      thumb +
      '<div class="bls-hotel-main">' +
      '<div class="bls-hotel-top">' +
      '<div>' +
      '<span class="bls-hotel-name">' + esc(h.name) + '</span>' +
      '<span class="bls-hotel-stars">' + stars(h.stars) + '</span>' +
      '</div>' +
      '<span class="bls-hotel-price">' + fmtMoney(h.price, h.currency || cur) + '</span>' +
      '</div>' +
      '<div class="bls-hotel-meta">' + rating + '</div>' +
      '</div>' +
      '<span class="bls-hotel-chevron">\u25BE</span>' +
      '</div>' +
      '<div class="bls-hotel-body">' +
      galleryHtml(h.photos) +
      badges +
      '<div style="margin-top:8px"><a class="bls-btn bls-btn--primary" href="' + esc(h.url) + '" target="_blank" rel="noopener">Выбрать номер</a></div>' +
      '</div>' +
      '</div>';
  }

  function collectionCardHtml(c, cur) {
    var meta = c.count + ' ' + pluralHotels(c.count);
    if (c.priceFrom != null) meta += ' · от ' + fmtMoney(c.priceFrom, cur);
    return '<button type="button" class="bls-coll" data-id="' + esc(c.id) + '">' +
      '<span class="bls-coll-emoji">' + esc(c.emoji) + '</span>' +
      '<span class="bls-coll-body">' +
      '<span class="bls-coll-title">' + esc(c.title) + '</span>' +
      '<span class="bls-coll-sub">' + esc(c.subtitle) + '</span>' +
      '<span class="bls-coll-meta">' + meta + '</span>' +
      '</span>' +
      '</button>';
  }

  function render(root, data) {
    var d = data || {};
    var trip = d.trip || {};
    var tr = d.transport || {};
    var hotel = d.hotel || {};
    var split = d.split || {};
    var collections = d.collections || [];
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
    parts.push('<p class="bls-quiz-q">Какие у тебя выходные?</p>');
    parts.push('<div class="bls-collections">');
    collections.forEach(function (c) { parts.push(collectionCardHtml(c, cur)); });
    parts.push('</div>');
    parts.push('<div class="bls-collection-detail" style="display:none"></div>');
    parts.push('</div>');

    var ctaText = isDep ? 'Приехать раньше · +' : 'Продлить поездку · +';
    parts.push(
      '<div class="bls-actions">',
      '<a class="bls-btn bls-btn--primary" href="' + esc(hotel.cheapestUrl || '#') + '" target="_blank" rel="noopener">' + ctaText + fmtMoney(split.personalTotal, cur) + '</a>',
      '</div>'
    );

    parts.push('<div class="bls-footer">' + esc(d.disclaimer || '') + '</div>');

    root.innerHTML = '<div class="bls-widget">' + parts.join('') + '</div>';
    attachGalleries(root);
    attachHotels(root);
    attachQuiz(root, collections, cur);
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

  function attachHotels(root) {
    var cards = root.querySelectorAll('.bls-hotel-card');
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        var head = card.querySelector('.bls-hotel-head');
        if (!head) return;
        head.addEventListener('click', function () {
          var wasExpanded = card.classList.contains('is-expanded');
          for (var j = 0; j < cards.length; j++) cards[j].classList.remove('is-expanded');
          if (!wasExpanded) card.classList.add('is-expanded');
        });
      })(cards[i]);
    }
  }

  function attachQuiz(root, collections, cur) {
    var collectionsEl = root.querySelector('.bls-collections');
    var detailEl = root.querySelector('.bls-collection-detail');
    if (!collectionsEl || !detailEl) return;
    var PAGE_SIZE = 5;
    var state = { page: 0, current: null };

    function currentCollection() {
      for (var i = 0; i < collections.length; i++) if (collections[i].id === state.current) return collections[i];
      return null;
    }

    function renderPage() {
      var col = currentCollection();
      if (!col) return;
      var hotels = col.hotels || [];
      var totalPages = Math.max(1, Math.ceil(hotels.length / PAGE_SIZE));
      if (state.page >= totalPages) state.page = totalPages - 1;
      if (state.page < 0) state.page = 0;
      var start = state.page * PAGE_SIZE;
      var items = hotels.slice(start, start + PAGE_SIZE);

      var html = '';
      html += '<button type="button" class="bls-btn bls-btn--ghost bls-back-btn">\u2190 Назад</button>';
      html += '<div class="bls-collection-head"><span class="bls-coll-emoji">' + esc(col.emoji) + '</span> ' + esc(col.title) + '</div>';
      html += '<div class="bls-full-list">';
      items.forEach(function (h) { html += hotelCardHtml(h, cur, false); });
      html += '</div>';
      if (totalPages > 1) {
        html += '<div class="bls-pager">' +
          '<button type="button" class="bls-pager-btn" data-dir="-1"' + (state.page === 0 ? ' disabled' : '') + '>\u2039</button>' +
          '<span class="bls-pager-info">' + (state.page + 1) + ' / ' + totalPages + '</span>' +
          '<button type="button" class="bls-pager-btn" data-dir="1"' + (state.page === totalPages - 1 ? ' disabled' : '') + '>\u203A</button>' +
          '</div>';
      }
      detailEl.innerHTML = html;
      attachGalleries(detailEl);
      attachHotels(detailEl);

      var back = detailEl.querySelector('.bls-back-btn');
      if (back) back.addEventListener('click', function () {
        detailEl.style.display = 'none';
        collectionsEl.style.display = '';
      });
      var pbtns = detailEl.querySelectorAll('.bls-pager-btn');
      for (var i = 0; i < pbtns.length; i++) {
        (function (b) {
          b.addEventListener('click', function () {
            state.page += Number(b.getAttribute('data-dir'));
            renderPage();
          });
        })(pbtns[i]);
      }
    }

    var cards = collectionsEl.querySelectorAll('.bls-coll');
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        card.addEventListener('click', function () {
          state.current = card.getAttribute('data-id');
          state.page = 0;
          collectionsEl.style.display = 'none';
          detailEl.style.display = 'block';
          renderPage();
        });
      })(cards[i]);
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

  global.BleisureQuiz = {
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

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

  function pluralDays(n) {
    if (n % 10 === 1 && n % 100 !== 11) return 'день';
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) return 'дня';
    return 'дней';
  }

  function renderSplit(parts, d, cur) {
    var split = d.split || {};
    var dest = d.destination || {};
    var company = Number(split.companyPays) || 0;
    var employee = Number(split.employeePays) || 0;
    var savings = Number(split.companySavings) || 0;
    var employeeTransport = Number(split.employeeTransport) || 0;
    var days = dest.weekendDays || 2;
    var total = company + employee;
    var companyPct = total > 0 ? (company / total) * 100 : 0;
    var employeePct = total > 0 ? (employee / total) * 100 : 0;

    parts.push('<div class="bls-split">');
    parts.push('<div class="bls-benefit">Мини-отпуск на ' + days + ' ' + pluralDays(days) + '</div>');
    parts.push('<div class="bls-benefit-sub">за ' + fmtMoney(employee, cur) + '</div>');
    if (savings > 0) {
      parts.push('<div class="bls-savings">Компания при этом экономит ' + fmtMoney(savings, cur) + '</div>');
    }
    parts.push(
      '<div class="bls-split-bar">',
      '<div class="bls-split-company" style="width:' + companyPct.toFixed(2) + '%"></div>',
      '<div class="bls-split-personal" style="width:' + employeePct.toFixed(2) + '%"></div>',
      '</div>',
      '<div class="bls-split-legend">',
      '<span><span class="bls-legend-dot" style="background:var(--bls-company)"></span>Компания</span>',
      '<span><span class="bls-legend-dot" style="background:var(--bls-personal)"></span>Сотрудник</span>',
      '</div>',
      '<div class="bls-split-amounts">',
      '<div class="bls-split-row"><span class="bls-split-label">Компания — билет</span><span class="bls-split-value bls-split-value--company">' + fmtMoney(company, cur) + '</span></div>',
      '<div class="bls-split-row"><span class="bls-split-label">Ты — отель' + (employeeTransport > 0 ? ' + билет' : '') + '</span><span class="bls-split-value bls-split-value--personal">' + fmtMoney(employee, cur) + '</span></div>',
      '</div>',
      '</div>'
    );
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

  function hotelCardHtml(h, cur, isRec, expanded) {
    var thumb = (h.photos && h.photos.length)
      ? '<img class="bls-thumb" src="' + esc(h.photos[0]) + '" alt="" loading="lazy" />'
      : '';
    var rating = h.rating != null
      ? '\u2605 ' + esc(h.rating) + ' · ' + esc(h.reviewCount) + ' отзывов'
      : esc(h.reviewCount) + ' отзывов';
    var recBadge = isRec ? '<span class="bls-badge bls-badge--rec">Рекомендуем</span>' : '';

    var b = [];
    if (h.meal) b.push('<span class="bls-badge bls-badge--ok">' + esc(h.meal) + '</span>');
    else if (!isRec) b.push('<span class="bls-badge">Без завтрака</span>');
    if (h.freeCancellation) b.push('<span class="bls-badge bls-badge--ok">Бесплатная отмена</span>');
    var badges = b.length ? '<div class="bls-hotel-badges">' + b.join('') + '</div>' : '';

    return '<div class="bls-hotel-card' + (isRec ? ' bls-hotel-card--rec' : '') + (expanded ? ' is-expanded' : '') + '"' +
      ' data-stars="' + (h.stars || 0) + '" data-meal="' + esc(h.mealType || '') + '" data-features="' + esc((h.features || []).join(' ')) + '">' +
      '<div class="bls-hotel-head">' +
      thumb +
      '<div class="bls-hotel-main">' +
      '<div class="bls-hotel-top">' +
      '<div>' +
      '<span class="bls-hotel-name">' + esc(h.name) + '</span>' +
      '<span class="bls-hotel-stars">' + stars(h.stars) + '</span>' +
      recBadge +
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
      '<div style="margin-top:8px"><a class="bls-btn ' + (isRec ? 'bls-btn--primary' : 'bls-btn--ghost') + '" href="' + esc(h.url) + '" target="_blank" rel="noopener">Выбрать номер</a></div>' +
      '</div>' +
      '</div>';
  }

  function filtersHtml(hotels) {
    var starsSet = {};
    var mealSet = {};
    var featSet = {};
    hotels.forEach(function (h) {
      if (h.stars) starsSet[h.stars] = true;
      if (h.mealType) mealSet[h.mealType] = true;
      (h.features || []).forEach(function (f) { featSet[f] = true; });
    });
    var stars = Object.keys(starsSet).map(Number).sort(function (a, b) { return a - b; });
    var meals = Object.keys(mealSet);
    var feats = Object.keys(featSet);
    var MEAL_LABEL = { breakfast: 'Завтрак', nomeal: 'Без питания', allinclusive: 'Всё включено', other: 'Другое' };
    var FEAT_LABEL = { cancel: 'Бесплатная отмена', pay_hotel: 'Оплата на месте', pay_online: 'Оплата онлайн' };

    if (!stars.length && !meals.length && !feats.length) return '';

    var html = '<div class="bls-filters">';
    if (stars.length) {
      html += '<div class="bls-filter-group"><span class="bls-filter-label">Звёзды</span>';
      stars.forEach(function (s) {
        html += '<button type="button" class="bls-chip" data-group="stars" data-value="' + s + '">' + s + '\u2605</button>';
      });
      html += '</div>';
    }
    if (meals.length) {
      html += '<div class="bls-filter-group"><span class="bls-filter-label">Питание</span>';
      meals.forEach(function (m) {
        html += '<button type="button" class="bls-chip" data-group="meal" data-value="' + esc(m) + '">' + esc(MEAL_LABEL[m] || m) + '</button>';
      });
      html += '</div>';
    }
    if (feats.length) {
      html += '<div class="bls-filter-group"><span class="bls-filter-label">Условия</span>';
      feats.forEach(function (f) {
        html += '<button type="button" class="bls-chip" data-group="features" data-value="' + esc(f) + '">' + esc(FEAT_LABEL[f] || f) + '</button>';
      });
      html += '</div>';
    }
    html += '</div>';
    return html;
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

    renderSplit(parts, d, cur);

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

    var allHotels = [];
    var remaining = [];
    parts.push('<div class="bls-compact">');
    if (hotel.recommended) {
      allHotels.push(hotel.recommended);
      parts.push(hotelCardHtml(hotel.recommended, cur, true, true));
    }
    var alts = hotel.alternatives || [];
    var visibleAlts = alts.slice(0, 2);
    remaining = alts.slice(2);
    visibleAlts.forEach(function (alt) { allHotels.push(alt); parts.push(hotelCardHtml(alt, cur, false, false)); });
    remaining.forEach(function (alt) { allHotels.push(alt); });
    parts.push('</div>');

    if (remaining.length) {
      parts.push('<button type="button" class="bls-btn bls-btn--ghost bls-more-btn">Посмотреть другие отели (' + remaining.length + ')</button>');
      parts.push('<div class="bls-full" style="display:none">');
      parts.push('<button type="button" class="bls-btn bls-btn--ghost bls-back-btn">\u2190 Назад</button>');
      parts.push(filtersHtml(allHotels));
      parts.push('<div class="bls-full-list"></div>');
      parts.push('<div class="bls-pager"></div>');
      parts.push('</div>');
    }
    parts.push('</div>');

    parts.push(
      '<div class="bls-actions">',
      '<a class="bls-btn bls-btn--primary" href="' + esc((hotel.recommended && hotel.recommended.url) || '#') + '" target="_blank" rel="noopener">Получить мини-отпуск · за ' + fmtMoney(split.employeePays, cur) + '</a>',
      '</div>'
    );

    parts.push('<div class="bls-footer">' + esc(d.disclaimer || '') + '</div>');

    root.innerHTML = '<div class="bls-widget">' + parts.join('') + '</div>';
    attachGalleries(root);
    attachHotels(root);
    attachHotelControls(root, remaining, cur);
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

  function attachHotelControls(root, remaining, cur) {
    var PAGE_SIZE = 5;
    var full = root.querySelector('.bls-full');
    var moreBtn = root.querySelector('.bls-more-btn');
    var backBtn = root.querySelector('.bls-back-btn');
    var listEl = root.querySelector('.bls-full-list');
    var pagerEl = root.querySelector('.bls-pager');
    var chips = root.querySelectorAll('.bls-chip');

    var state = { page: 0, stars: {}, meal: {}, features: {} };

    function filtered() {
      return remaining.filter(function (h) {
        if (Object.keys(state.stars).length && !state.stars[String(h.stars || 0)]) return false;
        if (Object.keys(state.meal).length && !state.meal[h.mealType || '']) return false;
        if (Object.keys(state.features).length) {
          var ok = false;
          (h.features || []).forEach(function (f) { if (state.features[f]) ok = true; });
          if (!ok) return false;
        }
        return true;
      });
    }

    function renderPage() {
      var list = filtered();
      var totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
      if (state.page >= totalPages) state.page = totalPages - 1;
      if (state.page < 0) state.page = 0;
      var start = state.page * PAGE_SIZE;
      var items = list.slice(start, start + PAGE_SIZE);
      var html = '';
      items.forEach(function (h) { html += hotelCardHtml(h, cur, false, false); });
      listEl.innerHTML = html || '<div class="bls-note">Ничего не нашлось под фильтры.</div>';
      attachGalleries(listEl);
      attachHotels(listEl);

      if (totalPages > 1) {
        pagerEl.innerHTML =
          '<button type="button" class="bls-pager-btn" data-dir="-1"' + (state.page === 0 ? ' disabled' : '') + '>\u2039</button>' +
          '<span class="bls-pager-info">' + (state.page + 1) + ' / ' + totalPages + '</span>' +
          '<button type="button" class="bls-pager-btn" data-dir="1"' + (state.page === totalPages - 1 ? ' disabled' : '') + '>\u203A</button>';
        var pbtns = pagerEl.querySelectorAll('.bls-pager-btn');
        for (var i = 0; i < pbtns.length; i++) {
          (function (b) {
            b.addEventListener('click', function () {
              state.page += Number(b.getAttribute('data-dir'));
              renderPage();
            });
          })(pbtns[i]);
        }
      } else {
        pagerEl.innerHTML = '';
      }
    }

    if (moreBtn && full) {
      moreBtn.addEventListener('click', function () {
        var compact = root.querySelector('.bls-compact');
        if (compact) compact.style.display = 'none';
        moreBtn.style.display = 'none';
        full.style.display = 'block';
        renderPage();
      });
    }
    if (backBtn && full) {
      backBtn.addEventListener('click', function () {
        full.style.display = 'none';
        var compact = root.querySelector('.bls-compact');
        if (compact) compact.style.display = '';
        if (moreBtn) moreBtn.style.display = 'block';
      });
    }

    for (var i = 0; i < chips.length; i++) {
      (function (chip) {
        chip.addEventListener('click', function () {
          var g = chip.getAttribute('data-group');
          var v = chip.getAttribute('data-value');
          var map = g === 'stars' ? state.stars : (g === 'meal' ? state.meal : state.features);
          chip.classList.toggle('is-active');
          if (chip.classList.contains('is-active')) map[v] = true; else delete map[v];
          state.page = 0;
          renderPage();
        });
      })(chips[i]);
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

const MCP = process.env.TUTU_MCP_URL || 'https://mcp.tutu.ru/mcp';

let rpcId = 0;

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const DAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const MODES = [
  { key: 'railway', label: 'Поезд', tool: 'search_rail', args: function (a) { return { passengers: a }; } },
  { key: 'bus', label: 'Автобус', tool: 'search_bus', args: function (a) { return { adults: a }; } },
  { key: 'avia', label: 'Самолёт', tool: 'search_avia', args: function (a) { return { adults: a }; } }
];

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function toIso(dt) {
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}

function parseIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return d + ' ' + MONTHS[m - 1] + ' · ' + DAYS[dt.getDay()];
}

function nextSundayAfter(iso) {
  const dt = parseIso(iso);
  do { dt.setDate(dt.getDate() + 1); } while (dt.getDay() !== 0);
  return toIso(dt);
}

function previousSaturday(iso) {
  const dt = parseIso(iso);
  do { dt.setDate(dt.getDate() - 1); } while (dt.getDay() !== 6);
  return toIso(dt);
}

function dayDiff(a, b) {
  return Math.round((parseIso(b) - parseIso(a)) / 86400000);
}

function timeOf(iso) { return iso.slice(11, 16); }

async function callTool(name, args) {
  const body = {
    jsonrpc: '2.0',
    id: ++rpcId,
    method: 'tools/call',
    params: { name, arguments: args }
  };
  const res = await fetch(MCP, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('MCP HTTP ' + res.status);
  const j = await res.json();
  if (j.error) throw new Error('MCP ' + (j.error.message || JSON.stringify(j.error)));
  const c = j.result && j.result.content;
  if (!c || !c[0] || j.result.isError) throw new Error('MCP tool error: ' + name);
  return JSON.parse(c[0].text);
}

function makeOption(mode, modeLabel, off) {
  const seg = off.legs && off.legs[0] && off.legs[0].segments && off.legs[0].segments[0];
  let title = '';
  if (mode === 'bus') {
    title = (seg && seg.carrier) || (off.carriers && off.carriers[0]) || '';
  } else {
    title = (seg && seg.voyage_no) || '';
    const name = seg && seg.vehicle_meta && seg.vehicle_meta.name;
    if (name) title += ' «' + name + '»';
  }
  return {
    mode: mode,
    modeLabel: modeLabel,
    title: title,
    time: timeOf(off.departure_at) + ' → ' + timeOf(off.arrival_at),
    price: off.price.amount,
    url: off.checkout_url || off.search_results_url || null
  };
}

async function multimodalLeg(origin, destination, date, adults) {
  const summary = await callTool('search_multitransport', {
    origin: origin, destination: destination, departure_date: date, adults: adults, page_size: 3
  });
  const available = summary.meta && summary.meta.modes_summary ? Object.keys(summary.meta.modes_summary) : [];
  const options = [];
  for (const m of MODES) {
    if (available.indexOf(m.key) === -1) continue;
    const args = Object.assign({ origin: origin, destination: destination, departure_date: date, page_size: 1 }, m.args(adults));
    const res = await callTool(m.tool, args);
    const off = res.offers && res.offers[0];
    if (!off) continue;
    options.push(makeOption(m.key, m.label, off));
  }
  options.sort(function (a, b) { return a.price - b.price; });
  const hasRailOrAvia = options.some(function (o) { return o.mode === 'railway' || o.mode === 'avia'; });
  return hasRailOrAvia ? options.filter(function (o) { return o.mode !== 'bus'; }) : options;
}

function hotelFeatures(h) {
  const bo = h.best_offer || {};
  const feats = [];
  if (bo.free_cancellation) feats.push('cancel');
  if (bo.pay_at_hotel) feats.push('pay_hotel');
  if (bo.pay_online) feats.push('pay_online');
  return feats;
}

function mealTypeOf(h) {
  const bo = h.best_offer || {};
  if (bo.breakfast_included) return 'breakfast';
  const name = (bo.meal_name || '').toLowerCase();
  if (/вс[ёе] включено|all.?inclusive/i.test(name)) return 'allinclusive';
  if (name) return 'other';
  return 'nomeal';
}

function hotelCard(h) {
  const bo = h.best_offer || {};
  const photos = (h.photos || []).slice(0, 6);
  return {
    name: h.name,
    stars: h.stars || 0,
    rating: (h.review_summary && h.review_summary.rating) || null,
    reviewCount: (h.review_summary && h.review_summary.review_count) || 0,
    meal: bo.meal_name || null,
    mealType: mealTypeOf(h),
    freeCancellation: !!bo.free_cancellation,
    features: hotelFeatures(h),
    price: bo.price ? bo.price.amount : null,
    currency: bo.price ? bo.price.currency : 'RUB',
    url: bo.checkout_url || null,
    photos: photos,
    photosTotal: h.photos_total || photos.length
  };
}

function distMeters(h) {
  const a = h.address || '';
  const k = /([\d.,]+)\s*км/.exec(a);
  if (k) return parseFloat(k[1].replace(',', '.')) * 1000;
  const m = /([\d.,]+)\s*м/.exec(a);
  if (m) return parseFloat(m[1].replace(',', '.'));
  return Infinity;
}

function byPriceObj(a, b) {
  const pa = (a.best_offer && a.best_offer.price) ? a.best_offer.price.amount : Infinity;
  const pb = (b.best_offer && b.best_offer.price) ? b.best_offer.price.amount : Infinity;
  return pa - pb;
}

function makeCollection(id, emoji, title, subtitle, list) {
  const hotels = list.map(hotelCard);
  const prices = hotels.map(function (x) { return x.price; }).filter(function (p) { return p != null; });
  return {
    id: id,
    emoji: emoji,
    title: title,
    subtitle: subtitle,
    count: hotels.length,
    priceFrom: prices.length ? Math.min.apply(null, prices) : null,
    cover: hotels.length && hotels[0].photos && hotels[0].photos.length ? hotels[0].photos[0] : null,
    hotels: hotels
  };
}

function buildCollections(main, spa) {
  const withPrice = main.filter(function (h) { return h.best_offer && h.best_offer.price; });
  const spaWithPrice = (spa || []).filter(function (h) { return h.best_offer && h.best_offer.price; });

  const luxe = withPrice.filter(function (h) { return (h.stars || 0) >= 4; });
  const walk = withPrice.filter(function (h) { return distMeters(h) <= 600; }).sort(function (a, b) { return distMeters(a) - distMeters(b); });
  const budget = withPrice.slice().sort(byPriceObj).slice(0, 4);

  const collections = [
    makeCollection('luxe', '\uD83D\uDC8E', 'Лакшери', '4–5★, всё включено', luxe),
    makeCollection('spa', '\uD83E\uDDD6', 'Спа и wellness', 'спа / сауна / бассейн', spaWithPrice),
    makeCollection('walk', '\uD83D\uDEB6', 'Погулять по центру', 'в 600 м от центра', walk),
    makeCollection('budget', '\uD83D\uDCB0', 'Бюджетно', 'дешевле всех', budget)
  ];

  return collections.filter(function (c) { return c.count > 0; });
}

async function computeBleisure(q) {
  const origin = (q.origin || '').trim();
  const destination = (q.destination || '').trim();
  const depart = q.depart;
  const ret = q.ret;
  const adults = Math.min(6, Math.max(1, Number(q.adults || 1)));

  if (!origin || !destination || !depart || !ret) {
    return { error: 'Укажи откуда, куда, даты выезда и возврата.' };
  }
  if (parseIso(ret) <= parseIso(depart)) {
    return { error: 'Дата возврата должна быть позже даты выезда.' };
  }

  const depDay = parseIso(depart).getDay();
  const extendSide = depDay === 1 ? 'departure' : 'return';

  let businessLeg;
  let leisureLeg;
  let hotelIn;
  let hotelOut;
  let headline;

  if (extendSide === 'departure') {
    const leiDepart = previousSaturday(depart);
    const bizOpts = await multimodalLeg(origin, destination, depart, adults);
    const leiOpts = await multimodalLeg(origin, destination, leiDepart, adults);
    if (!bizOpts.length) return { error: 'Не нашли транспорт из «' + origin + '» в «' + destination + '» на ' + fmtDate(depart) + '.' };
    if (!leiOpts.length) return { error: 'Не нашли транспорт из «' + origin + '» в «' + destination + '» на ' + fmtDate(leiDepart) + '.' };
    businessLeg = { label: 'Рабочий выезд', date: fmtDate(depart), options: bizOpts };
    leisureLeg = { label: 'Bleisure выезд', date: fmtDate(leiDepart), options: leiOpts };
    hotelIn = leiDepart;
    hotelOut = depart;
    headline = 'Командировка ' + fmtDate(depart) + ' — ' + fmtDate(ret) + ' · приезжай уже ' + fmtDate(leiDepart);
  } else {
    const leiReturn = nextSundayAfter(ret);
    const bizOpts = await multimodalLeg(destination, origin, ret, adults);
    const leiOpts = await multimodalLeg(destination, origin, leiReturn, adults);
    if (!bizOpts.length) return { error: 'Не нашли транспорт обратно на ' + fmtDate(ret) + '.' };
    if (!leiOpts.length) return { error: 'Не нашли транспорт обратно на ' + fmtDate(leiReturn) + '.' };
    businessLeg = { label: 'Рабочий возврат', date: fmtDate(ret), options: bizOpts };
    leisureLeg = { label: 'Bleisure возврат', date: fmtDate(leiReturn), options: leiOpts };
    hotelIn = ret;
    hotelOut = leiReturn;
    headline = 'Командировка ' + fmtDate(depart) + ' — ' + fmtDate(ret) + ' · вернись ' + fmtDate(leiReturn);
  }

  const delta = round2(leisureLeg.options[0].price - businessLeg.options[0].price);

  const mainRes = await callTool('search_hotels', {
    city_name: destination, check_in: hotelIn, check_out: hotelOut, adults: adults, page_size: 15, view: 'full'
  });
  let spaRes = null;
  try {
    spaRes = await callTool('search_hotels', {
      city_name: destination, check_in: hotelIn, check_out: hotelOut, adults: adults, page_size: 10, view: 'full', hotel_amenities: ['spa', 'sauna', 'jacuzzi']
    });
  } catch (e) {
    spaRes = null;
  }

  const main = (mainRes.hotels || []).filter(function (h) {
    return h.best_offer && h.best_offer.price && h.best_offer.price.amount != null;
  });
  const spa = spaRes ? (spaRes.hotels || []) : [];

  const collections = buildCollections(main, spa);

  const allPrices = main.map(function (h) { return h.best_offer.price.amount; });
  const cheapestHotel = allPrices.length ? Math.min.apply(null, allPrices) : 0;
  const cheapestHotelUrl = main.length
    ? (main.slice().sort(byPriceObj)[0].best_offer.checkout_url || null)
    : null;

  const baseTransport = businessLeg.options[0].price;
  const companySavings = round2(Math.max(0, -delta));
  const employeeTransport = round2(Math.max(0, delta));
  const employeeHotel = cheapestHotel;
  const employeePays = round2(employeeTransport + employeeHotel);
  const companyPays = round2(baseTransport - companySavings);

  return {
    trip: {
      origin: origin,
      destination: destination,
      headline: headline,
      travelers: adults + (adults === 1 ? ' взрослый' : ' взрослых')
    },
    transport: {
      currency: 'RUB',
      extendSide: extendSide,
      businessLeg: businessLeg,
      leisureLeg: leisureLeg,
      delta: delta
    },
    destination: {
      weekendDays: dayDiff(hotelIn, hotelOut)
    },
    hotel: {
      weekendNights: dayDiff(hotelIn, hotelOut),
      checkIn: fmtDate(hotelIn),
      checkOut: fmtDate(hotelOut),
      cheapestUrl: cheapestHotelUrl
    },
    collections: collections,
    baseline: { companyTransport: baseTransport },
    bleisure: { transport: leisureLeg.options[0].price, hotel: employeeHotel },
    split: {
      companyPays: companyPays,
      employeeTransport: employeeTransport,
      employeeHotel: employeeHotel,
      employeePays: employeePays,
      companySavings: companySavings,
      currency: 'RUB'
    },
    disclaimer: 'Цены актуальны на момент поиска и могут измениться в корзине. Оплата проходит на Tutu.'
  };
}

module.exports = { computeBleisure: computeBleisure };

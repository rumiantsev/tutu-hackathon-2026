const MCP = process.env.TUTU_MCP_URL || 'https://mcp.tutu.ru/mcp';

let rpcId = 0;

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const DAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const MODES = [
  { key: 'railway', label: 'Поезд', tool: 'search_rail', args: function (a) { return { passengers: a }; } },
  { key: 'bus', label: 'Автобус', tool: 'search_bus', args: function (a) { return { adults: a }; } },
  { key: 'avia', label: 'Самолёт', tool: 'search_avia', args: function (a) { return { adults: a }; } }
];

const DESTINATION_GUIDE = {
  'тверь': {
    note: 'Город на Волге: купеческая архитектура, прогулки по набережной.',
    points: ['Набережная Афанасия Никитина', 'Морозовский городок', 'Рестораны на Трёхсвятской']
  },
  'москва': {
    note: 'Парки, набережные и музеи — выходных хватит впритык.',
    points: ['Зарядье и парки', 'Набережная Москвы-реки', 'Рестораны и бары']
  },
  'санкт-петербург': {
    note: 'Эрмитаж, каналы и разводные мосты.',
    points: ['Дворцовая и Невский', 'Каналы и прогулки на катере', 'Музеи и галереи']
  }
};

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

function byPrice(a, b) {
  const pa = (a.best_offer && a.best_offer.price) ? a.best_offer.price.amount : Infinity;
  const pb = (b.best_offer && b.best_offer.price) ? b.best_offer.price.amount : Infinity;
  return pa - pb;
}

function pickRecommended(hotels) {
  if (!hotels.length) return null;
  const list = hotels.slice().sort(byPrice);
  let rec = null;
  for (const h of list) {
    const bo = h.best_offer || {};
    if (bo.breakfast_included && bo.free_cancellation) { rec = h; break; }
  }
  if (!rec) for (const h of list) { if ((h.best_offer || {}).free_cancellation) { rec = h; break; } }
  if (!rec) rec = list[0];
  return rec;
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

  const hotelsRes = await callTool('search_hotels', {
    city_name: destination, check_in: hotelIn, check_out: hotelOut, adults: adults, page_size: 15, view: 'full'
  });
  const hotels = (hotelsRes.hotels || []).filter(function (h) {
    return h.best_offer && h.best_offer.price && h.best_offer.price.amount != null;
  });

  let recommended = null;
  let alternatives = [];
  if (hotels.length) {
    const rec = pickRecommended(hotels);
    recommended = hotelCard(rec);
    alternatives = hotels.filter(function (h) { return h.hotel_id !== rec.hotel_id; }).sort(byPrice).map(function (h) { return hotelCard(h); });
  }

  const cheapestHotel = hotels.length
    ? Math.min.apply(null, hotels.map(function (h) { return h.best_offer.price.amount; }))
    : 0;

  let spaRes = null;
  try {
    spaRes = await callTool('search_hotels', {
      city_name: destination, check_in: hotelIn, check_out: hotelOut, adults: adults, page_size: 10, view: 'full', hotel_amenities: ['spa', 'sauna', 'jacuzzi']
    });
  } catch (e) {
    spaRes = null;
  }
  const spaHotels = ((spaRes && spaRes.hotels) || []).filter(function (h) {
    return h.best_offer && h.best_offer.price && h.best_offer.price.amount != null;
  }).sort(byPrice);
  const spaHotel = spaHotels.length ? {
    name: spaHotels[0].name,
    price: spaHotels[0].best_offer.price.amount,
    url: spaHotels[0].best_offer.checkout_url || null
  } : null;

  const resolvedName = (hotelsRes.meta && hotelsRes.meta.resolved_geo && hotelsRes.meta.resolved_geo.name) || destination;
  const guide = DESTINATION_GUIDE[resolvedName.toLowerCase()] || null;

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
      weekendDays: dayDiff(hotelIn, hotelOut),
      city: resolvedName,
      note: guide ? guide.note : null,
      points: guide ? guide.points : [],
      spa: spaHotel
    },
    hotel: {
      weekendNights: dayDiff(hotelIn, hotelOut),
      checkIn: fmtDate(hotelIn),
      checkOut: fmtDate(hotelOut),
      recommended: recommended,
      alternatives: alternatives,
      hasMore: !!(hotelsRes.meta && hotelsRes.meta.has_more)
    },
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

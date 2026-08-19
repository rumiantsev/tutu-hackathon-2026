const MCP = process.env.TUTU_MCP_URL || 'https://mcp.tutu.ru/mcp';

let rpcId = 0;

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const DAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const MODES = [
  { key: 'railway', label: 'Поезд', tool: 'search_rail', args: function (a) { return { passengers: a }; } },
  { key: 'etrain', label: 'Электричка', tool: 'search_etrain', args: function () { return {}; } },
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
  return options;
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

function hotelCard(h) {
  const bo = h.best_offer || {};
  return {
    name: h.name,
    stars: h.stars || 0,
    rating: (h.review_summary && h.review_summary.rating) || null,
    reviewCount: (h.review_summary && h.review_summary.review_count) || 0,
    meal: bo.meal_name || null,
    freeCancellation: !!bo.free_cancellation,
    price: bo.price ? bo.price.amount : null,
    currency: bo.price ? bo.price.currency : 'RUB',
    url: bo.checkout_url || null
  };
}

async function computeBleisure(q) {
  const origin = (q.origin || '').trim();
  const destination = (q.destination || '').trim();
  const depart = q.depart;
  const ret = q.ret;
  const leisure = q.leisure || nextSundayAfter(ret);
  const adults = Math.min(6, Math.max(1, Number(q.adults || 1)));

  if (!origin || !destination || !depart || !ret) {
    return { error: 'Укажи откуда, куда, даты выезда и возврата.' };
  }
  if (parseIso(leisure) <= parseIso(ret)) {
    return { error: 'Дата bleisure-возврата должна быть позже рабочего возврата.' };
  }

  const outOpts = await multimodalLeg(origin, destination, depart, adults);
  const bizOpts = await multimodalLeg(destination, origin, ret, adults);
  const leiOpts = await multimodalLeg(destination, origin, leisure, adults);

  if (!outOpts.length) return { error: 'Не нашли транспорт из «' + origin + '» в «' + destination + '» на ' + fmtDate(depart) + '.' };
  if (!bizOpts.length) return { error: 'Не нашли транспорт обратно на ' + fmtDate(ret) + '.' };
  if (!leiOpts.length) return { error: 'Не нашли транспорт обратно на ' + fmtDate(leisure) + '.' };

  const hotelsRes = await callTool('search_hotels', {
    city_name: destination, check_in: ret, check_out: leisure, adults: adults, page_size: 8
  });
  const hotels = (hotelsRes.hotels || []).filter(function (h) {
    return h.best_offer && h.best_offer.price && h.best_offer.price.amount != null;
  });

  const outCheapest = outOpts[0].price;
  const bizCheapest = bizOpts[0].price;
  const leiCheapest = leiOpts[0].price;

  const businessTotal = round2(outCheapest + bizCheapest);
  const bleisureTotal = round2(outCheapest + leiCheapest);
  const delta = round2(bleisureTotal - businessTotal);

  let recommended = null;
  let alternatives = [];
  if (hotels.length) {
    const rec = pickRecommended(hotels);
    recommended = hotelCard(rec);
    const rest = hotels.filter(function (h) { return h.hotel_id !== rec.hotel_id; }).sort(byPrice);
    alternatives = rest.slice(0, 2).map(function (h) { return hotelCard(h); });
  }

  const personalHotel = recommended ? recommended.price : 0;
  const personalTotal = round2(delta + personalHotel);

  return {
    trip: {
      origin: origin,
      destination: destination,
      departureDate: fmtDate(depart),
      businessReturnDate: fmtDate(ret),
      leisureReturnDate: fmtDate(leisure),
      travelers: adults + (adults === 1 ? ' взрослый' : ' взрослых')
    },
    transport: {
      currency: 'RUB',
      outbound: { label: 'Туда', date: fmtDate(depart), options: outOpts },
      businessReturn: { label: 'Рабочий возврат', date: fmtDate(ret), options: bizOpts },
      leisureReturn: { label: 'Bleisure возврат', date: fmtDate(leisure), options: leiOpts },
      businessTotal: businessTotal,
      bleisureTotal: bleisureTotal,
      delta: delta
    },
    hotel: {
      weekendNights: dayDiff(ret, leisure),
      checkIn: fmtDate(ret),
      checkOut: fmtDate(leisure),
      recommended: recommended,
      alternatives: alternatives
    },
    split: {
      company: businessTotal,
      personalTransport: delta,
      personalHotel: personalHotel,
      personalTotal: personalTotal,
      currency: 'RUB'
    },
    disclaimer: 'Цены актуальны на момент поиска и могут измениться в корзине. Оплата проходит на Tutu.'
  };
}

module.exports = { computeBleisure: computeBleisure };

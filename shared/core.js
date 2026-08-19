'use strict';

/**
 * Общий слой для обоих вариантов виджета (список + квиз).
 * Содержит MCP-клиент, утилиты дат, мультимодальный поиск транспорта
 * и приведение отелей к карточкам. Бизнес-логика каждого варианта —
 * в `bleisure-widget/bleisure.js` и `bleisure-quiz/bleisure.js`.
 */

const MCP = process.env.TUTU_MCP_URL || 'https://mcp.tutu.ru/mcp';
const FETCH_TIMEOUT_MS = Number(process.env.TUTU_MCP_TIMEOUT_MS || 15000);

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const DAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** Доступные виды транспорта и соответствующие MCP-инструменты поиска. */
const MODES = [
  { key: 'railway', label: 'Поезд', tool: 'search_rail', args: function (a) { return { passengers: a }; } },
  { key: 'bus', label: 'Автобус', tool: 'search_bus', args: function (a) { return { adults: a }; } },
  { key: 'avia', label: 'Самолёт', tool: 'search_avia', args: function (a) { return { adults: a }; } }
];

const MAX_ADULTS = 6;
const MIN_ADULTS = 1;

let rpcId = 0;

/** Округляет число до двух знаков, null/NaN → 0. */
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/** Date → 'YYYY-MM-DD' (локально). */
function toIso(dt) {
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}

/** 'YYYY-MM-DD' → Date (локально, полночь). */
function parseIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 'YYYY-MM-DD' → '26 авг · ср'. */
function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return d + ' ' + MONTHS[m - 1] + ' · ' + DAYS[dt.getDay()];
}

/** Ближайшее воскресенье строго после даты. */
function nextSundayAfter(iso) {
  const dt = parseIso(iso);
  do { dt.setDate(dt.getDate() + 1); } while (dt.getDay() !== 0);
  return toIso(dt);
}

/** Ближайшая суббота строго до даты. */
function previousSaturday(iso) {
  const dt = parseIso(iso);
  do { dt.setDate(dt.getDate() - 1); } while (dt.getDay() !== 6);
  return toIso(dt);
}

/** Разница в целых днях b − a. */
function dayDiff(a, b) {
  return Math.round((parseIso(b) - parseIso(a)) / 86400000);
}

/** '2026-08-26T13:30:00+03:00' → '13:30'. */
function timeOf(iso) { return iso.slice(11, 16); }

/**
 * Минимальный JSON-RPC-клиент поверх HTTP для MCP-сервера Tutu.
 * С таймаутом и устойчивым разбором ответа.
 */
async function callTool(name, args) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
  try {
    const body = {
      jsonrpc: '2.0',
      id: ++rpcId,
      method: 'tools/call',
      params: { name: name, arguments: args }
    };
    const res = await fetch(MCP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) throw new Error('MCP HTTP ' + res.status);
    const j = await res.json();
    if (j.error) throw new Error('MCP ' + (j.error.message || JSON.stringify(j.error)));
    if (!j.result || j.result.isError) throw new Error('MCP tool error: ' + name);
    const content = Array.isArray(j.result.content) ? j.result.content : [];
    const text = content.length && content[0] ? content[0].text : null;
    if (!text) throw new Error('MCP empty content: ' + name);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

/** Собирает строку-заголовок варианта транспорта (номер рейса/поезда + бренд). */
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

/**
 * Самый дешёвый вариант каждого доступного вида транспорта на дату.
 * Автобус показывается только если на маршруте нет ни поезда, ни самолёта.
 */
async function multimodalLeg(origin, destination, date, adults) {
  const summary = await callTool('search_multitransport', {
    origin: origin, destination: destination, departure_date: date, adults: adults, page_size: 3
  });
  const available = summary.meta && summary.meta.modes_summary ? Object.keys(summary.meta.modes_summary) : [];
  const selected = MODES.filter(function (m) { return available.indexOf(m.key) !== -1; });

  const results = await Promise.all(selected.map(function (m) {
    const args = Object.assign(
      { origin: origin, destination: destination, departure_date: date, page_size: 1 },
      m.args(adults)
    );
    return callTool(m.tool, args).catch(function () { return null; });
  }));

  const options = [];
  results.forEach(function (res, i) {
    if (!res) return;
    const off = res.offers && res.offers[0];
    if (off) options.push(makeOption(selected[i].key, selected[i].label, off));
  });

  options.sort(function (a, b) { return a.price - b.price; });
  const hasRailOrAvia = options.some(function (o) { return o.mode === 'railway' || o.mode === 'avia'; });
  return hasRailOrAvia ? options.filter(function (o) { return o.mode !== 'bus'; }) : options;
}

/** Сортировка отелей по цене (отели без цены уходят в конец). */
function byPrice(a, b) {
  const pa = (a.best_offer && a.best_offer.price) ? a.best_offer.price.amount : Infinity;
  const pb = (b.best_offer && b.best_offer.price) ? b.best_offer.price.amount : Infinity;
  return pa - pb;
}

/** Ключи «фишек» отеля для виджета (cancel / pay_hotel / pay_online). */
function hotelFeatures(h) {
  const bo = h.best_offer || {};
  const feats = [];
  if (bo.free_cancellation) feats.push('cancel');
  if (bo.pay_at_hotel) feats.push('pay_hotel');
  if (bo.pay_online) feats.push('pay_online');
  return feats;
}

/** Нормализует тип питания отеля в один из ключей виджета. */
function mealTypeOf(h) {
  const bo = h.best_offer || {};
  if (bo.breakfast_included) return 'breakfast';
  const name = (bo.meal_name || '').toLowerCase();
  if (/вс[ёе] включено|all.?inclusive/i.test(name)) return 'allinclusive';
  if (name) return 'other';
  return 'nomeal';
}

/** Приводит отель из ответа search_hotels к карточке виджета. */
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

/**
 * Общая часть расчёта: валидация входа, определение стороны продления
 * (выезд в понедельник → bleisure «до», иначе «после»), поиск рабочей и
 * личной ноги транспорта, дельта цены.
 */
async function resolveTrip(q) {
  const origin = (q.origin || '').trim();
  const destination = (q.destination || '').trim();
  const depart = q.depart;
  const ret = q.ret;
  const adults = Math.min(MAX_ADULTS, Math.max(MIN_ADULTS, Number(q.adults || 1)));

  if (!origin || !destination || !depart || !ret) {
    return { error: 'Укажи откуда, куда, даты выезда и возврата.' };
  }
  if (parseIso(ret) <= parseIso(depart)) {
    return { error: 'Дата возврата должна быть позже даты выезда.' };
  }

  const extendSide = parseIso(depart).getDay() === 1 ? 'departure' : 'return';

  let businessLeg, leisureLeg, hotelIn, hotelOut, headline;

  if (extendSide === 'departure') {
    const leiDepart = previousSaturday(depart);
    const legs = await Promise.all([
      multimodalLeg(origin, destination, depart, adults),
      multimodalLeg(origin, destination, leiDepart, adults)
    ]);
    const bizOpts = legs[0];
    const leiOpts = legs[1];
    if (!bizOpts.length) return { error: 'Не нашли транспорт из «' + origin + '» в «' + destination + '» на ' + fmtDate(depart) + '.' };
    if (!leiOpts.length) return { error: 'Не нашли транспорт из «' + origin + '» в «' + destination + '» на ' + fmtDate(leiDepart) + '.' };
    businessLeg = { label: 'Рабочий выезд', date: fmtDate(depart), options: bizOpts };
    leisureLeg = { label: 'Bleisure выезд', date: fmtDate(leiDepart), options: leiOpts };
    hotelIn = leiDepart;
    hotelOut = depart;
    headline = 'Командировка ' + fmtDate(depart) + ' — ' + fmtDate(ret) + ' · приезжай уже ' + fmtDate(leiDepart);
  } else {
    const leiReturn = nextSundayAfter(ret);
    const legs = await Promise.all([
      multimodalLeg(destination, origin, ret, adults),
      multimodalLeg(destination, origin, leiReturn, adults)
    ]);
    const bizOpts = legs[0];
    const leiOpts = legs[1];
    if (!bizOpts.length) return { error: 'Не нашли транспорт обратно на ' + fmtDate(ret) + '.' };
    if (!leiOpts.length) return { error: 'Не нашли транспорт обратно на ' + fmtDate(leiReturn) + '.' };
    businessLeg = { label: 'Рабочий возврат', date: fmtDate(ret), options: bizOpts };
    leisureLeg = { label: 'Bleisure возврат', date: fmtDate(leiReturn), options: leiOpts };
    hotelIn = ret;
    hotelOut = leiReturn;
    headline = 'Командировка ' + fmtDate(depart) + ' — ' + fmtDate(ret) + ' · вернись ' + fmtDate(leiReturn);
  }

  const delta = round2(leisureLeg.options[0].price - businessLeg.options[0].price);
  const baseTransport = businessLeg.options[0].price;

  return {
    origin: origin,
    destination: destination,
    adults: adults,
    extendSide: extendSide,
    businessLeg: businessLeg,
    leisureLeg: leisureLeg,
    hotelIn: hotelIn,
    hotelOut: hotelOut,
    headline: headline,
    delta: delta,
    baseTransport: baseTransport
  };
}

/**
 * Раскладка «компания vs сотрудник».
 * Компания платит рабочий билет (или дешевле — если bleisure-билет выгоднее),
 * сотрудник — доплату за билет сверх рабочего + отель на выходные.
 */
function buildSplit(baseTransport, delta, cheapestHotel) {
  const companySavings = round2(Math.max(0, -delta));
  const employeeTransport = round2(Math.max(0, delta));
  const employeeHotel = cheapestHotel;
  const employeePays = round2(employeeTransport + employeeHotel);
  const companyPays = round2(baseTransport - companySavings);
  return {
    companyPays: companyPays,
    employeeTransport: employeeTransport,
    employeeHotel: employeeHotel,
    employeePays: employeePays,
    companySavings: companySavings,
    currency: 'RUB'
  };
}

module.exports = {
  MCP: MCP,
  MODES: MODES,
  round2: round2,
  toIso: toIso,
  parseIso: parseIso,
  fmtDate: fmtDate,
  nextSundayAfter: nextSundayAfter,
  previousSaturday: previousSaturday,
  dayDiff: dayDiff,
  timeOf: timeOf,
  callTool: callTool,
  makeOption: makeOption,
  multimodalLeg: multimodalLeg,
  byPrice: byPrice,
  hotelFeatures: hotelFeatures,
  mealTypeOf: mealTypeOf,
  hotelCard: hotelCard,
  resolveTrip: resolveTrip,
  buildSplit: buildSplit
};

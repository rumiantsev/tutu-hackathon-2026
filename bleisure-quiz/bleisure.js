'use strict';

/**
 * Вариант «Квиз»: подбор отеля через коллекции «под вайб»
 * (💎 Лакшери / 🧖 Спа и wellness / 🚶 Погулять по центру / 💰 Бюджетно).
 * Общий слой (MCP-клиент, транспорт, отели, сплит) — в shared/core.js.
 */

const {
  resolveTrip,
  callTool,
  byPrice,
  hotelCard,
  dayDiff,
  fmtDate,
  buildSplit
} = require('../shared/core.js');

/** Достаёт расстояние до центра из адреса вида «N м/км от центра». */
function distMeters(h) {
  const a = h.address || '';
  const k = /([\d.,]+)\s*км/.exec(a);
  if (k) return parseFloat(k[1].replace(',', '.')) * 1000;
  const m = /([\d.,]+)\s*м/.exec(a);
  if (m) return parseFloat(m[1].replace(',', '.'));
  return Infinity;
}

/** Собирает коллекцию отелей: обложка, число, цена «от». */
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

/** Формирует коллекции из основного листинга + результата спа-поиска. */
function buildCollections(main, spa) {
  const withPrice = main.filter(function (h) { return h.best_offer && h.best_offer.price; });
  const spaWithPrice = (spa || []).filter(function (h) { return h.best_offer && h.best_offer.price; });

  const luxe = withPrice.filter(function (h) { return (h.stars || 0) >= 4; });
  const walk = withPrice.filter(function (h) { return distMeters(h) <= 600; }).sort(function (a, b) { return distMeters(a) - distMeters(b); });
  const budget = withPrice.slice().sort(byPrice).slice(0, 4);

  const collections = [
    makeCollection('luxe', '\uD83D\uDC8E', 'Лакшери', '4–5★', luxe),
    makeCollection('spa', '\uD83E\uDDD6', 'Спа и wellness', 'спа / сауна / бассейн', spaWithPrice),
    makeCollection('walk', '\uD83D\uDEB6', 'Погулять по центру', 'до 600 м от центра', walk),
    makeCollection('budget', '\uD83D\uDCB0', 'Бюджетно', 'самые недорогие', budget)
  ];

  return collections.filter(function (c) { return c.count > 0; });
}

/** Полный расчёт виджета «Квиз»: транспорт + коллекции отелей + сплит. */
async function computeBleisure(q) {
  const trip = await resolveTrip(q);
  if (trip.error) return trip;

  const hotelArgs = {
    city_name: trip.destination,
    check_in: trip.hotelIn,
    check_out: trip.hotelOut,
    adults: trip.adults
  };

  const [mainRes, spaRes] = await Promise.all([
    callTool('search_hotels', Object.assign({}, hotelArgs, { page_size: 15, view: 'full' })),
    callTool('search_hotels', Object.assign({}, hotelArgs, { page_size: 10, view: 'full', hotel_amenities: ['spa', 'sauna', 'jacuzzi'] }))
      .catch(function () { return null; })
  ]);

  const main = (mainRes.hotels || []).filter(function (h) {
    return h.best_offer && h.best_offer.price && h.best_offer.price.amount != null;
  });
  const spa = spaRes ? (spaRes.hotels || []) : [];

  const collections = buildCollections(main, spa);

  const allPrices = main.map(function (h) { return h.best_offer.price.amount; });
  const cheapestHotel = allPrices.length ? Math.min.apply(null, allPrices) : 0;
  const cheapestHotelUrl = main.length
    ? (main.slice().sort(byPrice)[0].best_offer.checkout_url || null)
    : null;

  return {
    trip: {
      origin: trip.origin,
      destination: trip.destination,
      headline: trip.headline,
      travelers: trip.adults + (trip.adults === 1 ? ' взрослый' : ' взрослых')
    },
    transport: {
      currency: 'RUB',
      extendSide: trip.extendSide,
      businessLeg: trip.businessLeg,
      leisureLeg: trip.leisureLeg,
      delta: trip.delta
    },
    destination: {
      weekendDays: dayDiff(trip.hotelIn, trip.hotelOut)
    },
    hotel: {
      weekendNights: dayDiff(trip.hotelIn, trip.hotelOut),
      checkIn: fmtDate(trip.hotelIn),
      checkOut: fmtDate(trip.hotelOut),
      cheapestUrl: cheapestHotelUrl
    },
    collections: collections,
    baseline: { companyTransport: trip.baseTransport },
    bleisure: { transport: trip.leisureLeg.options[0].price, hotel: cheapestHotel },
    split: buildSplit(trip.baseTransport, trip.delta, cheapestHotel),
    disclaimer: 'Цены актуальны на момент поиска и могут измениться в корзине. Оплата проходит на Tutu.'
  };
}

module.exports = { computeBleisure: computeBleisure };

'use strict';

/**
 * Вариант «Список»: рекомендованный отель + альтернативы по цене.
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

/** Рекомендация: самый дешёвый отель с завтраком и бесплатной отменой,
 *  с фолбэком на «только бесплатная отмена», затем на самый дешёвый. */
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

/** Полный расчёт виджета «Список»: транспорт + отель + сплит. */
async function computeBleisure(q) {
  const trip = await resolveTrip(q);
  if (trip.error) return trip;

  const hotelsRes = await callTool('search_hotels', {
    city_name: trip.destination,
    check_in: trip.hotelIn,
    check_out: trip.hotelOut,
    adults: trip.adults,
    page_size: 15,
    view: 'full'
  });
  const hotels = (hotelsRes.hotels || []).filter(function (h) {
    return h.best_offer && h.best_offer.price && h.best_offer.price.amount != null;
  });

  let recommended = null;
  let alternatives = [];
  if (hotels.length) {
    const rec = pickRecommended(hotels);
    recommended = hotelCard(rec);
    alternatives = hotels
      .filter(function (h) { return h.hotel_id !== rec.hotel_id; })
      .sort(byPrice)
      .map(function (h) { return hotelCard(h); });
  }

  const cheapestHotel = hotels.length
    ? Math.min.apply(null, hotels.map(function (h) { return h.best_offer.price.amount; }))
    : 0;

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
      recommended: recommended,
      alternatives: alternatives,
      hasMore: !!(hotelsRes.meta && hotelsRes.meta.has_more)
    },
    baseline: { companyTransport: trip.baseTransport },
    bleisure: { transport: trip.leisureLeg.options[0].price, hotel: cheapestHotel },
    split: buildSplit(trip.baseTransport, trip.delta, cheapestHotel),
    disclaimer: 'Цены актуальны на момент поиска и могут измениться в корзине. Оплата проходит на Tutu.'
  };
}

module.exports = { computeBleisure: computeBleisure };

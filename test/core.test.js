'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  round2,
  toIso,
  parseIso,
  fmtDate,
  nextSundayAfter,
  previousSaturday,
  dayDiff,
  timeOf,
  hotelFeatures,
  mealTypeOf,
  hotelCard,
  byPrice,
  buildSplit
} = require('../shared/core.js');

test('round2 округляет до двух знаков и зануляет мусор', function () {
  assert.equal(round2(1.005), 1);
  assert.equal(round2(123.456), 123.46);
  assert.equal(round2(null), 0);
  assert.equal(round2('3.14159'), 3.14);
});

test('toIso/parseIso конвертируют дату туда-обратно', function () {
  assert.equal(toIso(new Date(2026, 7, 26)), '2026-08-26');
  assert.equal(toIso(parseIso('2026-01-05')), '2026-01-05');
});

test('fmtDate выдаёт русский короткий формат с днём недели', function () {
  assert.equal(fmtDate('2026-08-26'), '26 авг · ср');
  assert.equal(fmtDate('2026-08-30'), '30 авг · вс');
});

test('nextSundayAfter/previousSaturday находят выходные', function () {
  assert.equal(nextSundayAfter('2026-08-28'), '2026-08-30'); // пт -> вс
  assert.equal(previousSaturday('2026-08-31'), '2026-08-29'); // пн -> сб
});

test('dayDiff считает целые дни', function () {
  assert.equal(dayDiff('2026-08-28', '2026-08-30'), 2);
  assert.equal(dayDiff('2026-08-30', '2026-08-28'), -2);
});

test('timeOf вырезает HH:MM из ISO', function () {
  assert.equal(timeOf('2026-08-26T13:30:00+03:00'), '13:30');
});

test('hotelFeatures собирает фишки из best_offer', function () {
  const h = { best_offer: { free_cancellation: true, pay_at_hotel: true, pay_online: false } };
  assert.deepEqual(hotelFeatures(h), ['cancel', 'pay_hotel']);
  assert.deepEqual(hotelFeatures({}), []);
});

test('mealTypeOf нормализует тип питания', function () {
  assert.equal(mealTypeOf({ best_offer: { breakfast_included: true } }), 'breakfast');
  assert.equal(mealTypeOf({ best_offer: { meal_name: 'Всё включено' } }), 'allinclusive');
  assert.equal(mealTypeOf({ best_offer: { meal_name: 'Завтрак и ужин' } }), 'other');
  assert.equal(mealTypeOf({}), 'nomeal');
});

test('hotelCard мапит отель в карточку виджета', function () {
  const card = hotelCard({
    name: 'Отель', stars: 4, photos: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], photos_total: 9,
    review_summary: { rating: 8.7, review_count: 12 },
    best_offer: { price: { amount: 7800, currency: 'RUB' }, meal_name: 'Завтрак', breakfast_included: true, checkout_url: 'https://x' }
  });
  assert.equal(card.name, 'Отель');
  assert.equal(card.stars, 4);
  assert.equal(card.rating, 8.7);
  assert.equal(card.reviewCount, 12);
  assert.equal(card.price, 7800);
  assert.equal(card.mealType, 'breakfast');
  assert.equal(card.freeCancellation, false);
  assert.equal(card.photos.length, 6);
  assert.equal(card.photosTotal, 9);
});

test('byPrice сортирует отели по цене, без цены — в конец', function () {
  const a = { best_offer: { price: { amount: 500 } } };
  const b = { best_offer: { price: { amount: 300 } } };
  const c = {};
  assert.deepEqual([a, b, c].sort(byPrice), [b, a, c]);
});

test('buildSplit: bleisure-билет дешевле → компания экономит', function () {
  const s = buildSplit(654, -154, 7800);
  assert.deepEqual(s, {
    companyPays: 500,
    employeeTransport: 0,
    employeeHotel: 7800,
    employeePays: 7800,
    companySavings: 154,
    currency: 'RUB'
  });
});

test('buildSplit: bleisure-билет дороже → сотрудник доплачивает', function () {
  const s = buildSplit(654, 200, 7800);
  assert.equal(s.companyPays, 654);
  assert.equal(s.employeeTransport, 200);
  assert.equal(s.employeePays, 8000);
  assert.equal(s.companySavings, 0);
});

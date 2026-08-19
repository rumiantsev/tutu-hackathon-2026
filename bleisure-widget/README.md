# Bleisure-калькулятор (встраиваемый виджет)

Виджет для B2B: считает стоимость командировки **«компания vs сотрудник»**, когда
сотрудник продлевает поездку на выходные (bleisure = business + leisure).

Данные и checkout-ссылки — из MCP Tutu (read-only поиск + deeplink-ссылки).
Оплата проходит на Tutu в браузере пользователя; виджет ничего не бронирует серверно.

## Демо

Открой `demo.html` в браузере. Кейс: **Москва → Тверь, 26–28.08.2026**, продление до 30.08.

- Рабочий билет (туда 026А + обратно 749У) — **1 634,78 ₽** (компания).
- Bleisure-возврат (151А, вс) — разница **+61,70 ₽**.
- Отель на выходные (2 ночи, «Отель Премьер») — **8 715 ₽** (личное).
- Итого личное: **~8 777 ₽**.

## Файлы

- `widget.js` — логика рендера, без зависимостей.
- `widget.css` — стили (все классы с префиксом `.bls-`).
- `demo.html` — демо с реальными данными (два режима встраивания).
- `sample-data.json` — эталонный payload (что принимает виджет).

## Как встраивать

### Режим 1 · через data-атрибут (передал параметры — виджет подхватился)

```html
<link rel="stylesheet" href="widget.css" />
<div data-bleisure-widget='{ "trip": { "origin": "Москва", "destination": "Тверь", "departureDate": "26 авг · ср", "businessReturnDate": "28 авг · пт", "leisureReturnDate": "30 авг · вс" }, "transport": { ... }, "hotel": { ... }, "split": { ... } }'></div>
<script src="widget.js"></script>
```

### Режим 2 · программно

```js
BleisureWidget.init(document.getElementById('root'), data);
```

### Режим 3 · подгрузка с бэкенда

```html
<div data-bleisure-widget data-bleisure-src="/api/bleisure?origin=Москва&destination=Тверь&departure=2026-08-26&return=2026-08-28"></div>
```

Виджет делает `fetch(data-bleisure-src)` и рендерит JSON. Так виджет остаётся
«тупым фронтом», а расчёт (два поиска + дельта + ссылки через `create_checkout_link`)
живёт на бэкенде, который оборачивает MCP Tutu.

## Схема payload

```jsonc
{
  "trip": {           // origin, destination, departureDate, businessReturnDate, leisureReturnDate, travelers
    "origin": "Москва", "destination": "Тверь",
    "departureDate": "26 авг · ср", "businessReturnDate": "28 авг · пт", "leisureReturnDate": "30 авг · вс"
  },
  "transport": {      // mode, modeLabel, note, cashbackPct, currency
    "business": { "total": 1634.78, "legs": [ { "label", "time", "price", "url" } ] },
    "bleisure": { "total": 1696.48, "returnLeg": { "label", "time", "price", "url" } },
    "delta": 61.70    // bleisure.total - business.total = личная часть билета
  },
  "hotel": {          // weekendNights, checkIn, checkOut
    "recommended": { "name", "stars", "rating", "reviewCount", "meal", "freeCancellation", "price", "currency", "url" },
    "alternatives": [ { ... } ]
  },
  "split": {          // company, personalTransport, personalHotel, personalTotal, currency
    "company": 1634.78, "personalTransport": 61.70,
    "personalHotel": 8715.0, "personalTotal": 8776.70
  },
  "disclaimer": "Цены актуальны на момент поиска и могут измениться в корзине."
}
```

## Откуда берётся расчёт (MCP-флоу)

1. `search_rail(Москва → Тверь, 2026-08-26)` — туда.
2. `search_rail(Тверь → Москва, 2026-08-28)` — рабочий возврат.
3. `search_rail(Тверь → Москва, 2026-08-30)` — bleisure-возврат.
4. `search_hotels(Тверь, 28→30)` — отель на выходные.
5. `create_checkout_link(...)` — по каждой ноге + отелю.

`delta = bleisure.total - business.total`; отель на выходные — личная часть целиком.

## Примечания

- Авиа на этом направлении нет — виджет показывает только ж/д (мультимодальность — отдельный режим через `search_multitransport`).
- Кэшбэк Tutu (3% на поезда) — бонусные баллы после оплаты, не скидка; в виджете не вычитается из цены.
- Цены — живые, «от» (самый дешёвый тариф). В корзине могут отличаться (сбор Tutu).

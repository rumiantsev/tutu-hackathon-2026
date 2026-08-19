# Bleisure-калькулятор (встраиваемый виджет)

Виджет для B2B: считает стоимость командировки **«компания vs сотрудник»**, когда
сотрудник продлевает поездку на выходные (bleisure = business + leisure).

Данные и checkout-ссылки — из MCP Tutu (read-only поиск + deeplink-ссылки).
Оплата проходит на Tutu в браузере пользователя; виджет ничего не бронирует серверно.

## Запуск

```bash
node server.js
```

Открой http://localhost:8080 — там форма «куда еду + даты», по кнопке «Рассчитать»
бэкенд сам ходит в MCP Tutu (`https://mcp.tutu.ru/mcp`) и пересчитывает виджет.

Переменные окружения:

- `TUTU_MCP_URL` — адрес MCP-сервера (по умолчанию `https://mcp.tutu.ru/mcp`).
- `PORT` — порт (по умолчанию `8080`).

Бэкенд не имеет внешних зависимостей (только `http`, `fs`, `fetch` Node 18+).

## Демо

Кейс по умолчанию: **Москва → Тверь, 26–28.08.2026**, продление до 30.08.

Виджет сравнивает **все типы транспорта** (самолёт / поезд / электричка / автобус).
Пример на живых данных: туда дешевле всего электричка (668 ₽), обратно — автобус
(654 ₽, в пт и в вс одинаково), поэтому дельта билета **0 ₽** — продление бесплатно,
а главная личная часть — отель на выходные (~8 000 ₽ за 2 ночи). Цены меняются от
запроса к запросу — это живые данные Tutu.

## Файлы

- `server.js` — бэкенд: статика + `/api/bleisure` (ходит в MCP Tutu, считает сплит).
- `widget.js` — логика рендера, без зависимостей.
- `widget.css` — стили (все классы с префиксом `.bls-`).
- `demo.html` — форма + виджет (по кнопке дёргает `/api/bleisure`).
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
«тупым фронтом», а расчёт (мультимодальный поиск + дельта + ссылки) живёт на
бэкенде, который оборачивает MCP Tutu.

## Схема payload

```jsonc
{
  "trip": {           // origin, destination, departureDate, businessReturnDate, leisureReturnDate, travelers
    "origin": "Москва", "destination": "Тверь",
    "departureDate": "26 авг · ср", "businessReturnDate": "28 авг · пт", "leisureReturnDate": "30 авг · вс"
  },
  "transport": {      // currency + три ноги, в каждой — лучший вариант по каждому типу транспорта
    "currency": "RUB",
    "outbound":        { "label": "Туда",            "date": "26 авг · ср", "options": [ { "mode", "modeLabel", "title", "time", "price", "url" } ] },
    "businessReturn":  { "label": "Рабочий возврат",  "date": "28 авг · пт", "options": [ ... ] },
    "leisureReturn":   { "label": "Bleisure возврат", "date": "30 авг · вс", "options": [ ... ] },
    "businessTotal": 1322,
    "bleisureTotal": 1322,
    "delta": 0         // bleisureTotal - businessTotal (по самому дешёвому варианту каждой ноги)
  },
  "hotel": {          // weekendNights, checkIn, checkOut
    "recommended": { "name", "stars", "rating", "reviewCount", "meal", "freeCancellation", "price", "currency", "url" },
    "alternatives": [ { ... } ]
  },
  "split": {          // company, personalTransport, personalHotel, personalTotal, currency
    "company": 1322, "personalTransport": 0,
    "personalHotel": 7800, "personalTotal": 7800
  },
  "disclaimer": "Цены актуальны на момент поиска и могут измениться в корзине."
}
```

`mode` ∈ `railway` (Поезд) / `etrain` (Электричка) / `bus` (Автобус) / `avia` (Самолёт).

## Откуда берётся расчёт (MCP-флоу)

Для каждой ноги (туда / рабочий возврат / bleisure-возврат):

1. `search_multitransport` — какие типы транспорта вообще есть на маршруте и почём (`meta.modes_summary`).
2. По каждому доступному типу — `search_rail` / `search_etrain` / `search_bus` / `search_avia` (`page_size=1`) — самый дешёвый вариант с деталями и ссылкой.
3. `search_hotels(назначение, ret→leisure)` — отель на выходные (рекомендация = самый дешёвый с завтраком + бесплатной отменой).

Ссылки берутся из `checkout_url` / `search_results_url` оффера (у отелей — `best_offer.checkout_url`).

`businessTotal` / `bleisureTotal` считаются по самому дешёвому варианту каждой ноги (любой тип);
`delta = bleisureTotal − businessTotal`; отель на выходные — личная часть целиком.

## Примечания

- Сравниваются все типы транспорта: если на маршруте нет аэропорта (как в Твери), виджет просто не покажет «Самолёт» и предложит поезд/электричку/автобус.
- Ссылки — `checkout_url`/`search_results_url` из оффера (у авиа это страница поиска, у поездов/автобусов — страница выбора мест).
- Кэшбэк Tutu — бонусные баллы после оплаты, не скидка; в виджете из цены не вычитается.
- Цены — живые, «от» (самый дешёвый тариф). В корзине могут отличаться (сбор Tutu).

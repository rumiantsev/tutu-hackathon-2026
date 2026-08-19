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

В форме есть переключатель **«Список / Квиз»**: «Список» — плоский список отелей
(`/api/bleisure`), «Квиз» — подбор по вайбу-коллекциям (`/api/bleisure-quiz`,
вариант из `bleisure-quiz/`). Сервер отдаёт оба эндпоинта и статику обоих вариантов.

Переменные окружения:

- `TUTU_MCP_URL` — адрес MCP-сервера (по умолчанию `https://mcp.tutu.ru/mcp`).
- `PORT` — порт (по умолчанию `8080`).

Бэкенд не имеет внешних зависимостей (только `http`, `fs`, `fetch` Node 18+).

## Деплой на Vercel

Расчёт вынесен в `bleisure.js`, его используют оба входа:

- `server.js` — локальный dev-сервер (статика + `/api/bleisure`).
- `../api/bleisure.js` — serverless-функция Vercel (та же логика).

Vercel отдаёт `bleisure-widget/*` как статику, `/` редиректит на
`demo.html` (см. `vercel.json` в корне `tutu`), `/api/bleisure` бьётся в функцию.

## Демо

Кейс по умолчанию: **Москва → Тверь, 26–28.08.2026**, продление до 30.08.

Виджет сравнивает **все типы транспорта** (самолёт / поезд / автобус)
только по той ноге, которая меняется для bleisure, и показывает фото отелей.

- Поездка заканчивается в ср/чт/пт → предлагает **вернуться в воскресенье** (bleisure после).
- Поездка начинается в **понедельник** → предлагает **приехать в субботу** (bleisure до).

Цены меняются от запроса к запросу — это живые данные Tutu.

## Файлы

- `bleisure.js` — расчёт: MCP-клиент + логика сплита (общий для dev и Vercel).
- `server.js` — локальный dev-сервер: статика + `/api/bleisure`.
- `widget.js` — логика рендера, без зависимостей.
- `widget.css` — стили (все классы с префиксом `.bls-`).
- `demo.html` — форма + виджет (по кнопке дёргает `/api/bleisure`).
- `sample-data.json` — эталонный payload (что принимает виджет).

## Как встраивать

### Режим 1 · через data-атрибут (передал параметры — виджет подхватился)

```html
<link rel="stylesheet" href="widget.css" />
<div data-bleisure-widget='{ "trip": { "origin": "Москва", "destination": "Тверь", "headline": "Командировка 26 авг · ср — 28 авг · пт · вернись 30 авг · вс" }, "transport": { ... }, "hotel": { ... }, "split": { ... } }'></div>
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
  "trip": {           // origin, destination, headline (готовый текст), travelers
    "origin": "Москва", "destination": "Тверь",
    "headline": "Командировка 26 авг · ср — 28 авг · пт · вернись 30 авг · вс"
  },
  "transport": {      // currency, extendSide, две ноги (рабочая vs bleisure) + дельта
    "currency": "RUB",
    "extendSide": "return",   // "return" | "departure"
    "businessLeg": { "label": "Рабочий возврат",  "date": "28 авг · пт", "options": [ { "mode", "modeLabel", "title", "time", "price", "url" } ] },
    "leisureLeg":  { "label": "Bleisure возврат", "date": "30 авг · вс", "options": [ ... ] },
    "delta": 0               // leisureLeg.cheapest - businessLeg.cheapest
  },
  "hotel": {          // weekendNights, checkIn, checkOut
    "recommended": { "name", "stars", "rating", "reviewCount", "meal", "freeCancellation", "price", "currency", "url", "photos": [] },
    "alternatives": [ { ... } ]
  },
  "destination": {    // weekendDays, city, note, points[] (курируемые), spa {name, price, url}
    "weekendDays": 2, "city": "Тверь",
    "points": ["Набережная Афанасия Никитина", "…"],
    "spa": { "name": "Отель …", "price": 5627, "url": "…" }
  },
  "baseline": { "companyTransport": 654 },                 // рабочий билет (что платила бы компания)
  "bleisure": { "transport": 500, "hotel": 7800 },         // фактический билет + отель
  "split": {
    "companyPays": 500,          // компания платит (min рабочего и bleisure билета)
    "employeeTransport": 0,      // доплата за билет сверх рабочего
    "employeeHotel": 7800,       // отель на выходные
    "employeePays": 7800,        // employeeTransport + employeeHotel
    "companySavings": 154        // экономия компании, если bleisure-билет дешевле рабочего
  },
  "disclaimer": "Цены актуальны на момент поиска и могут измениться в корзине."
}
```

- `mode` ∈ `railway` (Поезд) / `bus` (Автобус) / `avia` (Самолёт).
- `hotel.recommended.photos` — массив URL фото (виджет листает стрелками / свайпом).
- `split.company` — цена только рабочей ноги (нога «туда»/фиксированная не показывается).

## Откуда берётся расчёт (MCP-флоу)

1. Определяем сторону продления: выезд в **понедельник** → `extendSide="departure"` (выезд в субботу), иначе `"return"` (возврат в ближайшее воскресенье).
2. Для меняющейся ноги (рабочая и bleisure-даты) — `search_multitransport` (`meta.modes_summary`), затем по каждому доступному типу `search_rail` / `search_bus` / `search_avia` (`page_size=1`).
3. `search_hotels(назначение, уикенд, view="full")` — отель на выходные + фото (рекомендация = самый дешёвый с завтраком + бесплатной отменой).

Ссылки — из `checkout_url` / `search_results_url` оффера (у отелей — `best_offer.checkout_url`).

`delta = leisureLeg.cheapest − businessLeg.cheapest`; отель на выходные — личная часть целиком.

## Примечания

- Сравниваются самолёт / поезд / автобус. Автобус показываем только если на маршруте нет ни авиа, ни ж/д (фолбэк). Нет аэропорта (как в Твери) — виджет просто не покажет «Самолёт».
- Ссылки — `checkout_url`/`search_results_url` из оффера (у авиа это страница поиска, у поездов/автобусов — страница выбора мест).
- Кэшбэк Tutu — бонусные баллы после оплаты, не скидка; в виджете из цены не вычитается.
- Цены — живые, «от» (самый дешёвый тариф). В корзине могут отличаться (сбор Tutu).

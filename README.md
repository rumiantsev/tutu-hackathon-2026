# tutu-hackathon-2026

Bleisure-калькулятор — встраиваемый B2B-виджет: командировка + выходные.
Считает «компания vs сотрудник» на живых данных MCP Tutu (`https://mcp.tutu.ru/mcp`),
сравнивая все типы транспорта (самолёт / поезд / электричка / автобус).

## Структура

- `bleisure-widget/` — сам виджет (фронт) + локальный dev-сервер.
  - `demo.html`, `widget.js`, `widget.css` — UI (без зависимостей).
  - `bleisure.js` — расчёт (MCP-клиент + логика сплита), общий для dev и Vercel.
  - `server.js` — локальный статик-сервер + `/api/bleisure` (для разработки).
- `api/bleisure.js` — serverless-функция Vercel (тот же расчёт через `bleisure.js`).
- `vercel.json` — редирект `/` на виджет + runtime для функции.

## Запуск локально

```bash
cd bleisure-widget
node server.js
# http://localhost:8080
```

## Деплой на Vercel

Корень проекта — папка `tutu` (здесь `.git` и `vercel.json`). Vercel:

- отдаёт `bleisure-widget/*` как статику;
- `/` редиректит на `/bleisure-widget/demo.html`;
- `/api/bleisure` → `api/bleisure.js` (serverless, ходит в MCP Tutu).

Подробности виджета и схемы данных — в `bleisure-widget/README.md`.

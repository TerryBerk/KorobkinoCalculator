<p align="center">
  <img src="public/icons/favicon.svg" alt="Korobkino Calculator logo" width="96" height="96">
</p>

# Korobkino Calculator

Лёгкий React-виджет для расчёта сметы по CSV-прайсу из Google Sheets.

## Возможности
- Загрузка прайс-листа, логистики и параметров напрямую из опубликованных Google Sheets (CSV).
- Локальный кеш с TTL 60 секунд и офлайн-режим с баннером.
- Поддержка тарифных порогов, фиксированных услуг, скидок на палеты и доплаты за объём при заборе.
- Экспорт сметы в CSV и генерация шеринговой ссылки.
- UMD-бандл с `window.KorobkinoCalculator.mount(el, options)` и ESM-экспорт компонента.
- UI на Headless UI + Tailwind, адаптив под мобильные устройства.

## Быстрый старт

```bash
npm install
npm run dev
```

По умолчанию дев-сервер использует моковые CSV из `public/mock`. Для подключения Google Sheets задайте переменные:

```bash
VITE_SERVICES_URL=https://docs.google.com/.../output=csv
VITE_LOGISTICS_URL=https://docs.google.com/.../output=csv
VITE_PARAMS_URL=https://docs.google.com/.../output=csv
```

## Сборка

```bash
npm run build
```

Команда создаёт `dist/` со следующими артефактами:
- `korobkino-calculator.es.js` — ESM-бандл
- `korobkino-calculator.umd.js` — UMD-бандл (`window.KorobkinoCalculator.mount`)
- `style.css` — стили Tailwind
- `index.d.ts` — типы (генерируются `postbuild`)

### Брендинг

- Исходный логотип: `public/KorobkinoCalculator-logo.png`
- Фавиконки и манифест: `public/icons/*`, `public/site.webmanifest`, `public/apple-touch-icon.png`

При замене логотипа пересоздайте фавиконки (см. `public/icons/README` при необходимости) либо обновите assets вручную тем же названием.

### Vercel

1. Import Git репозиторий.
2. Framework preset: **Vite**
3. Build Command: `npm run build`
4. Output Directory: `dist`

`public/index.html` подключает UMD-бандл `./korobkino-calculator.umd.js` и может работать как демо-страница (`/` или `/demo`).

## API

```ts
type Urls = {
  servicesCsvUrl: string;
  logisticsCsvUrl: string;
  paramsCsvUrl: string;
};

type MountOptions = {
  urls: Urls;
  locale?: "ru" | "en";
  onQuoteChange?: (quote: Quote) => void;
  theme?: Partial<ThemeTokens>;
};

window.KorobkinoCalculator.mount(el: HTMLElement, options: MountOptions): () => void;
```

См. `src/lib/models.ts` для всех типов (`ServiceRow`, `LogisticsRow`, `Quote`, `ThemeTokens` и др.).

## Тесты и качество

```bash
npm run typecheck
npm run lint
npm run test
```

## Git-flow

- Основные ветки: `main`, `develop`
- Фичи: `feature/<name>`, фиксы: `fix/<name>`
- Коммиты и PR c префиксом `feature:` или `fix:`
- Пул-реквесты направляются в `develop`
- Шаблон PR: `.github/pull_request_template.md`
- CI: `.github/workflows/ci.yml` (lint + typecheck + test + build)

## Настройка темы

Можно переопределить частично:

```ts
window.KorobkinoCalculator.mount(root, {
  urls,
  theme: {
    surface: "#111827",
    primary: "#6366f1"
  }
});
```

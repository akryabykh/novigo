# 👋 START HERE — читать первым в новом чате

Хендовер-документы проекта **Novigo**. Порядок чтения:

1. **README_NEW_CHAT.md** (этот файл) — вход в контекст + критические правила.
2. **HANDOVER.md** — где стоим, что только что сделали, ближайшие шаги.
3. **CURRENT_STATE.md** — что задеплоено, что работает/сломано.
4. **ARCHITECTURE.md** — стек, модель данных, математика колец (суть продукта).
5. **PROJECT_MAP.md** — карта файлов.
6. **DECISIONS.md** — принятые решения и почему.
7. **TODO.md** — что осталось, открытые вопросы, баги.

## Что такое Novigo (в двух строках)
Кросс-платформенный трекер целей (Expo Universal web/iOS/Android + Supabase). Всё привязано к
**календарю**: сверху лента дней с числами, три вложенных кольца (**день/неделя/месяц**) показывают
заполнение. Две сущности — **Цели** (долгие, с весами, «навсегда» или до даты) и **Задачи**
(простые галочки в конкретном периоде, как в Напоминаниях). Веб живёт на Vercel.

> ⚠️ Модель СИЛЬНО поменялась летом 2026: **больше нет «сессий» на 28 дней и нет админки**. Если
> где-то встретишь упоминание `goal_sessions` / `/admin` / вкладки «Прогресс» — это устаревший
> контекст, игнорируй.

## 🔴 КРИТИЧЕСКИЕ ПРАВИЛА РАБОТЫ (не нарушать)
1. **Работать ТОЛЬКО в ветке `dev`.** Никогда не коммитить в `main` напрямую.
2. **НИКОГДА не пушить самому** (`git push` запрещён). Коммит — локально; пуш и merge в `main`
   делает пользователь через GitHub Desktop. Говорить «готово», а не пушить.
3. **В начале сессии сначала сориентироваться**: `git checkout dev`, `git status`, перечитать
   актуальный код, и только потом менять.
4. **Перед «готово»**: прогнать `npx tsc --noEmit`, `npx expo lint`, `npx expo export --platform web`
   — всё зелёное.
5. **Схема БД поменялась → миграцию применяет пользователь** в Supabase SQL Editor
   (`pbcopy < supabase/migrations/000X.sql` — файл в буфере, юзер вставляет и жмёт Run). Миграции
   применяются строго по порядку номеров.
6. **Expo SDK 56 — читать версионные доки** https://docs.expo.dev/versions/v56.0.0/ перед кодом
   (см. `AGENTS.md`).

## Ключевые координаты
- Репо: `github.com/akryabykh/novigo` · локально `~/Documents/Claude/Projects/Novigo`
- Прод (веб): **https://novigo-orpin.vercel.app** (ветка `main`)
- Supabase проект `novigo`, ref `tiskzzothxpunkxkogmx`, URL `https://tiskzzothxpunkxkogmx.supabase.co`
- Стек: Expo SDK **56** (RN 0.85 + React 19 + Expo Router + react-native-web), NativeWind, Supabase,
  zod, @tanstack/react-query. Node 26 локально.
- Язык общения с пользователем: **русский**.
- Подпись коммитов: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## ⚡️ Важный инфра-факт: throttling в РФ → Vercel-прокси
Supabase спрятан за Cloudflare; российские провайдеры троттлят Cloudflare → «висит/не грузится/вчера
работало». Это **не баг кода**. Решение уже в проде: на вебе клиент ходит НЕ напрямую в Supabase, а
через **same-origin прокси** `${origin}/supabase-api/*` (rewrite в `vercel.json` → Supabase). См.
`src/core/data/supabase.ts` (`resolveClientUrl`) и память `novigo-ru-cloudflare-throttling`.

## Как проверять вживую
У ассистента есть доступ к браузеру пользователя (MCP `claude-in-chrome`): грузить
`novigo-orpin.vercel.app`, логиниться, читать консоль/сеть, выполнять JS. Это надёжнее локального
headless (песочница искажает сеть к Supabase).

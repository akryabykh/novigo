# ARCHITECTURE — стек, модель, математика

## Стек
- **Expo SDK 56** (RN 0.85 + React 19) + **Expo Router**, веб через **react-native-web** — один код
  на web/iOS/Android. Веб-вывод `app.json`: `web.output: "single"` (SPA). `typedRoutes` выключен.
- **NativeWind** (стили) + дизайн-токены в `src/ui/theme.ts` (единый источник).
- **Supabase** (Postgres + Auth + RLS).
- **zod** (валидация), **@tanstack/react-query** (серверное состояние/кэш).
- Бизнес-логика — чистые функции в `src/core/logic`.

## Модель данных: КАЛЕНДАРЬ (не «сессии»!)
Никаких сессий и отсчёта «от создания». Всё привязано к календарю; **неделя — с понедельника**
(UTC-хелперы в `src/core/logic`: `startOfWeek/endOfWeek`, `startOfMonth/endOfMonth`, `weeksOfMonth`,
`periodRange`, `enumerateDates`).

- **Goal** (`src/core/logic/index.ts`):
  `{ id, kind, userId, title, timeframe: day|week|month, target, weight, startDate, endDate }`.
  - `kind: 'goal' | 'task'` — дискриминатор двух сущностей (ниже).
  - `startDate` — день создания (задним числом ставить нельзя).
  - `endDate` — `null` = **навсегда**, либо дата = **до этой даты**.
  - `target` — число (у целей «кол-во» 1–9; у задач всегда 1).
  - `weight` — доля в % внутри своего горизонта, суммируются до 100%.
  - `isActiveOn(goal, date)` / `overlaps(goal, start, end)` — активна ли цель в дате/диапазоне.
- **Цель (`kind='goal'`)**: долгая, с ручными весами, «кол-во» 1–9, период — только **навсегда** или
  **до даты**. Экран «Цели».
- **Задача (`kind='task'`)**: простая галочка (как в Напоминаниях), **всегда привязана к периоду**
  (нельзя «навсегда»), `target=1`, веса авто-равные. Экран «Задачи».
- **DailyLog**: `{ goalId, date, value }` — факт за день (unique goal_id+date).
- Таблицы: `goals` (с `user_id`, `kind`, `start_date`, `end_date`), `daily_logs`, `profiles`
  (имя + gamification-статы), `achievements`. **`goal_sessions` УДАЛЕНА** (миграция 0003). RLS:
  каждый видит только своё (goal.user_id = auth.uid()).

## Математика колец (СЕРДЦЕ ПРОДУКТА — не сломать)
Кольца **вложенные, с фиксированными долями 60/40 и 80/20**. Формулы неизменны с самого начала —
поменялись только **знаменатели: теперь динамические** (усредняем лишь по дням/неделям, где ЕСТЬ
активные цели, а не по фиксированным 7 и 4). Всё в `src/core/logic/index.ts`:

- **День** = взвешенный прогресс активных дневных целей за этот день (100% — дневные цели).
- **Неделя** = `0.6 × (дневная часть) + 0.4 × (недельные цели)`, где
  **дневная часть = среднее дневного кольца по дням недели, где были активные дневные цели**
  (`enumerateDates(week).map(dayGoalsOn).filter(≠null)` → avg). Нет активных дней → дневной части
  нет. `weekRingFor`.
- **Месяц** = `0.8 × (недельная часть) + 0.2 × (месячные цели)`, где
  **недельная часть = среднее кольца по неделям месяца, где были активные цели** (динамический
  знаменатель по не-null неделям). Месяц завязан на НЕДЕЛИ, не на дни напрямую.
- **Отсутствующая половина = 0 (без перенормировки).** Без целей на всех уровнях кольца
  недели/месяца не дойдут до 100%. Константы: `WEEK_DAY_WEIGHT=0.6`, `WEEK_OWN_WEIGHT=0.4`,
  `MONTH_WEEKS_WEIGHT=0.8`, `MONTH_OWN_WEIGHT=0.2`. `blend()` — обрабатывает отсутствующую половину.
- **Перевыполнение запрещено**: дневная ≤ target/день; недельная ≤ остаток до недельного target;
  месячная ≤ остаток. Ключевые функции: `computeRings`, `weekRingFor`, `goalsForScope`, `dayGoalsOn`,
  `goalCardProgress`, `goalCurrent`, `goalOnDate`, `goalMaxOnDate`, `validateWeights`.

## Цвета горизонтов
День = индиго `#6366F1`, Неделя = голубой `#0EA5E9`, Месяц = фиолетовый `#A855F7`
(в `theme.ts`: `timeframeColor` / `timeframeSoft`).

## Геймификация (`src/features/gamification`) — считается, но БЕЗ UI
Движок жив (`engine.ts` + `sync.ts`, вызывается из `queries.ts` после каждого лога), но
**вкладка «Прогресс» удалена** — визуально XP/стрики/heatmap сейчас не показываются. Компоненты
`LevelBar`/`StreakPill`/`Heatmap` на месте, ждут решения «что делать с ачивками».
- **Стрик**: день активен, если дневное кольцо ≥ 80% (`STREAK_ACTIVE_THRESHOLD`).
- **XP/уровни**: +10 за закрытую за период цель, +5 за идеальный день; кривая `levelFromXp`.
- Всё пересчитывается идемпотентно из данных (календарно, не по сессии).

## Auth (`src/features/auth/auth-provider.tsx`)
- Email+пароль, без подтверждения email. `signUpWithPassword` → `completeProfile` (создаёт profile,
  кладётся в query-кэш до навигации). Гейт в `src/app/_layout.tsx` роутит по session/profile.
  **Админ-режима больше нет** (удалён).
- Supabase-клиент (`src/core/data/supabase.ts`): **no-op lock** обязателен (иначе дедлок
  navigator.locks на вебе); `storageKey: 'sb-novigo-auth'`; `fetchWithTimeout` (AbortController, 8с);
  `resolveClientUrl()` — на вебе (не localhost) шлёт через `${origin}/supabase-api` (обход
  Cloudflare-throttling в РФ). `detectSessionInUrl` на вебе, `flowType: pkce`.

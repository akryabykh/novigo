# PROJECT MAP — карта файлов

```
Novigo/
├── app.json                 # Expo config: web.output="single", typedRoutes=false, scheme novigo
├── vercel.json              # Vercel: expo export → dist + /supabase-api прокси + SPA rewrites
├── AGENTS.md / CLAUDE.md    # «Expo SDK 56 изменился — читай версионные доки перед кодом»
├── babel/metro/tailwind.config.js, nativewind-env.d.ts
├── .env / .env.example      # EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY (.env в .gitignore)
├── supabase/migrations/     # применяются пользователем по порядку (см. CURRENT_STATE)
│   ├── 0001_init.sql / 0002_goal_sessions.sql   # СТАРЫЕ модели — вытеснены
│   ├── 0003_calendar_goals.sql   # дроп goal_sessions, goals→user_id, ОБНУЛЕНИЕ данных
│   ├── 0004_goal_date_range.sql  # start_date / end_date + check
│   ├── 0005_goal_kind.sql        # kind ('goal'|'task') + индекс
│   ├── 0006_goals_forever.sql    # старые «разовые» цели → «навсегда»
│   └── 0007_save_horizon_and_integrity.sql  # ⭐ атомарный RPC save_horizon + CHECK + триггер лог-в-периоде
├── jest.config.js           # babel-jest, node-env, только *.test.ts (без jest-expo)
├── docs/                    # ← эти хендовер-доки
└── src/
    ├── core/                # платформо-независимое ядро
    │   ├── logic/index.ts   # ⭐ ВСЯ математика: кольца, календарь, kind, прогресс, стрики, XP,
    │   │                    #   equalWeights/redistributeWeights, canLogOn/isPeriodEditable (24ч лаг)
    │   ├── domain/index.ts  # типы: Timeframe, DailyLog, Profile, Achievement
    │   ├── data/            # Supabase-слой
    │   │   ├── supabase.ts  # ⭐ клиент (no-op lock!, resolveClientUrl→/supabase-api, fetchWithTimeout 8с)
    │   │   ├── mappers.ts   # row(snake) ↔ domain(camel); GoalRow: kind, start_date, end_date
    │   │   ├── goals-repo.ts / logs-repo.ts / profiles-repo.ts / achievements-repo.ts
    │   │   └── index.ts     # баррель  (⚠️ sessions-repo УДАЛЁН)
    │   ├── validation/index.ts  # zod: email, password, name, goalDraft
    │   └── query.ts         # react-query client + ключи (qk: profile/workspace/achievements)
    ├── ui/
    │   ├── theme.ts         # ⭐ токены: цвета, timeframeColor, spacing, radius, typography, STREAK_ACTIVE_THRESHOLD
    │   ├── theme-provider.tsx  # light/dark + useColors/useTheme
    │   ├── SetupNotice.tsx  # экран если Supabase не сконфигурен
    │   └── components/      # Text, Button, Card, Input, ProgressRing, ProgressBar, Stepper,
    │                        #   SegmentedControl, Badge, Skeleton, EmptyState, Confetti, Logo,
    │                        #   icons (Target/List/Gear/Trash/Check/Plus/Flame/ChevronLeft/…)
    ├── features/
    │   ├── auth/auth-provider.tsx  # сессия + signIn/signUp/completeProfile/signOut (без админки)
    │   ├── queries.ts       # ⭐ хуки: useProfile, useWorkspace, useSaveGoals (RPC), useUpdateNames;
    │   │                    #   syncGamificationSafe (геймификация отдельно, не роняет сохранение)
    │   ├── calendar/        # ⭐ общая обвязка Цели/Задачи (без over-abstraction):
    │   │                    #   format.ts, useCalendar, useOptimisticLog, log-cache (pure),
    │   │                    #   CalendarScaffold (day strip + навигатор + кольца + shell)
    │   ├── goals/           # GoalRow (цель +/−, readOnly), TaskRow (галочка, readOnly, stopPropagation),
    │   │                    #   task-row-logic.ts (pure), HorizonEditor (общий редактор целей/задач)
    │   └── gamification/    # engine.ts, sync.ts (считается, БЕЗ UI — «Прогресс» удалён)
    ├── __tests__/           # jest-спеки: календарь, кольца, веса, лаг, rollback, gamification…
    └── app/                 # Expo Router (роуты)
        ├── _layout.tsx      # ⭐ провайдеры + ГЕЙТ (loading / not-found / ERROR-с-retry) + шрифты/splash (fallback на ошибке шрифтов)
        ├── (auth)/          # login, register, forgot-password, complete-profile
        └── (app)/
            ├── _layout.tsx  # Stack → (tabs)
            └── (tabs)/      # _layout (3 вкладки), index («Цели»), tasks («Задачи»), profile
```
⚠️ **Удалено при редизайне:** `app/admin.tsx`, `(tabs)/progress.tsx`, `(app)/goals/new.tsx`+`edit.tsx`,
`features/goals/GoalEditForm.tsx`, `core/data/sessions-repo.ts`.
⚠️ **Удалено в safe-refactor:** `features/goals/select.ts`, `gamification/{LevelBar,StreakPill,Heatmap}.tsx`,
мёртвые схемы `core/validation` (goalDraft/firstError/timeframeSchema), per-row `create/update/deleteGoal`
(заменены RPC `save_horizon`), `useUpsertLog`/`useAchievements` (заменены `useOptimisticLog`).

## Куда смотреть по задаче
- **Логика колец/прогресса/календаря/весов** → `src/core/logic/index.ts`.
- **Экран «Цели»** → `src/app/(app)/(tabs)/index.tsx` + `src/features/goals/GoalRow.tsx`.
- **Экран «Задачи»** → `src/app/(app)/(tabs)/tasks.tsx` + `src/features/goals/TaskRow.tsx`.
- **Редактор целей/задач** → `src/features/goals/HorizonEditor.tsx` (общий, режим по `kind`).
- **Авторизация/гейт** → `src/features/auth/auth-provider.tsx` + `src/app/_layout.tsx`.
- **Запросы к БД / прокси** → `src/features/queries.ts` → `src/core/data/*-repo.ts` + `supabase.ts`.
- **Цвета/токены** → `src/ui/theme.ts`.
```

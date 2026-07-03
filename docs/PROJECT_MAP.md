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
│   └── 0006_goals_forever.sql    # старые «разовые» цели → «навсегда»
├── docs/                    # ← эти хендовер-доки
└── src/
    ├── core/                # платформо-независимое ядро
    │   ├── logic/index.ts   # ⭐ ВСЯ математика: кольца, календарь-хелперы, kind, прогресс, стрики, XP, валидация весов
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
    │   ├── queries.ts       # ⭐ хуки: useProfile, useWorkspace, useUpsertLog, useSaveGoals; loadWorkspace
    │   ├── goals/           # GoalRow (цель +/−), TaskRow (задача-галочка),
    │   │                    #   HorizonEditor (общий редактор целей/задач), select.ts (goalsForScope)
    │   └── gamification/    # engine.ts, sync.ts, LevelBar, StreakPill, Heatmap (считается, БЕЗ UI)
    └── app/                 # Expo Router (роуты)
        ├── _layout.tsx      # ⭐ провайдеры (query/theme/auth) + ГЕЙТ (session/profile) + шрифты/splash
        ├── (auth)/          # login, register, forgot-password, complete-profile
        └── (app)/
            ├── _layout.tsx  # Stack → (tabs)
            └── (tabs)/      # _layout (3 вкладки), index («Цели»), tasks («Задачи»), profile
```
⚠️ **Удалено при редизайне:** `app/admin.tsx`, `(tabs)/progress.tsx`, `(app)/goals/new.tsx`+`edit.tsx`,
`features/goals/GoalEditForm.tsx`, `core/data/sessions-repo.ts`.

## Куда смотреть по задаче
- **Логика колец/прогресса/календаря/весов** → `src/core/logic/index.ts`.
- **Экран «Цели»** → `src/app/(app)/(tabs)/index.tsx` + `src/features/goals/GoalRow.tsx`.
- **Экран «Задачи»** → `src/app/(app)/(tabs)/tasks.tsx` + `src/features/goals/TaskRow.tsx`.
- **Редактор целей/задач** → `src/features/goals/HorizonEditor.tsx` (общий, режим по `kind`).
- **Авторизация/гейт** → `src/features/auth/auth-provider.tsx` + `src/app/_layout.tsx`.
- **Запросы к БД / прокси** → `src/features/queries.ts` → `src/core/data/*-repo.ts` + `supabase.ts`.
- **Цвета/токены** → `src/ui/theme.ts`.
```

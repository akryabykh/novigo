# PROJECT MAP — карта файлов

```
Novigo/
├── app.json                 # Expo config: web.output="single", typedRoutes=false, scheme novigo
├── vercel.json              # Vercel: expo export → dist + SPA rewrites
├── babel/metro/tailwind.config.js, nativewind-env.d.ts
├── .env / .env.example      # EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY (.env в .gitignore)
├── supabase/migrations/
│   ├── 0001_init.sql        # СТАРАЯ модель (programs/tasks) — вытеснена
│   └── 0002_goal_sessions.sql  # ТЕКУЩАЯ: goal_sessions + goals + daily_logs + RLS
├── docs/                    # ← эти хендовер-доки
└── src/
    ├── core/                # платформо-независимое ядро
    │   ├── logic/index.ts   # ⭐ ВСЯ математика: кольца, прогресс, стрики, XP, даты, валидация весов
    │   ├── domain/index.ts  # типы: Timeframe, Goal, GoalSession, DailyLog, Profile, Achievement
    │   ├── data/            # Supabase-слой
    │   │   ├── supabase.ts  # ⭐ клиент (no-op lock!, isSupabaseConfigured)
    │   │   ├── mappers.ts   # row(snake) ↔ domain(camel)
    │   │   ├── sessions-repo.ts / goals-repo.ts / logs-repo.ts / profiles-repo.ts / achievements-repo.ts
    │   │   └── index.ts     # баррель
    │   ├── validation/index.ts  # zod: email, password, name, goalDraft
    │   └── query.ts         # react-query client + ключи (qk: profile/workspace/achievements)
    ├── ui/
    │   ├── theme.ts         # ⭐ токены: цвета, timeframeColor, spacing, radius, typography, STREAK_ACTIVE_THRESHOLD
    │   ├── theme-provider.tsx  # light/dark + useColors/useTheme
    │   ├── SetupNotice.tsx  # экран если Supabase не сконфигурен
    │   └── components/      # Text, Button, Card, Input, ProgressRing, ProgressBar, Stepper,
    │                        #   SegmentedControl, Badge, Skeleton, EmptyState, Confetti, Logo, icons
    ├── features/
    │   ├── auth/auth-provider.tsx  # сессия + signIn/signUp/completeProfile/signOut + admin-флаг
    │   ├── queries.ts       # ⭐ хуки: useProfile, useWorkspace, useCreateSession, useUpsertLog,
    │   │                    #   useSaveGoals, useDeleteSession, useUpdateNames
    │   ├── goals/           # GoalRow (плашка +/−), select.ts (goalsByTimeframe)
    │   └── gamification/    # engine.ts, sync.ts, LevelBar, StreakPill, Heatmap
    └── app/                 # Expo Router (роуты)
        ├── _layout.tsx      # ⭐ провайдеры (query/theme/auth) + ГЕЙТ (session/profile/admin) + шрифты/splash
        ├── admin.tsx        # /admin — локальный демо-апп + скруббер дней (НЕ в группе, иначе коллизия с /)
        ├── (auth)/          # login, register, forgot-password, complete-profile
        └── (app)/
            ├── _layout.tsx  # Stack: (tabs) + модалки goals/new, goals/edit
            ├── (tabs)/      # index (главная: кольца-селектор + список целей +/−), progress, profile
            └── goals/       # new.tsx (создать сессию + онбординг), edit.tsx (редактировать/удалить, с подтв.)
```

## Куда смотреть по задаче
- **Логика колец/прогресса** → `src/core/logic/index.ts`.
- **Главный экран** → `src/app/(app)/(tabs)/index.tsx` + `src/features/goals/GoalRow.tsx`.
- **Создание/редактирование целей** → `src/app/(app)/goals/new.tsx` / `edit.tsx`.
- **Авторизация/гейт** → `src/features/auth/auth-provider.tsx` + `src/app/_layout.tsx`.
- **Запросы к БД** → `src/features/queries.ts` → `src/core/data/*-repo.ts`.
- **Цвета/токены** → `src/ui/theme.ts`.
- **Админ** → `src/app/admin.tsx`.
```

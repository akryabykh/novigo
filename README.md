# Novigo

Кросс-платформенный трекер целей: вы создаёте **программу** на период (неделя / 2 недели / месяц), разбиваете её на **задачи** с весами (в сумме 100%), каждый день отмечаете прогресс — а приложение считает взвешенный прогресс, серии (streak), XP и уровни.

Один кодбейс на **web / iOS / Android** (Expo + react-native-web). Сейчас собран и проверен веб; мобильные сборки — через EAS позже, код к этому готов.

## Стек

- **Expo SDK 56** + React Native + **Expo Router** (web через react-native-web)
- **NativeWind** (Tailwind для RN) + дизайн-токены в одном месте (`src/ui/theme.ts`)
- **Supabase** — Postgres + Auth + RLS
- **zod** (валидация) + **@tanstack/react-query** (серверное состояние)
- Бизнес-логика (прогресс / стрики / XP) — чистые функции в `src/core/logic`

## Архитектура

```
src/
  app/                 # экраны (Expo Router): (auth) и (app)/(tabs)
  core/
    domain/            # типы сущностей
    logic/             # ЧИСТАЯ бизнес-логика (прогресс, стрики, XP) — юнит-тестируемо
    data/              # Supabase-клиент + репозитории (CRUD) + мапперы
    validation/        # zod-схемы
  ui/                  # дизайн-токены (theme.ts) + компоненты (NativeWind)
  features/            # auth, programs, gamification, profile (хуки react-query, движок геймификации)
supabase/migrations/   # 0001_init.sql — схема + RLS
```

UI один на все платформы и тонкий: расчёты живут в `core/logic`, экраны их только вызывают.

## Setup

### 1. Зависимости
```bash
npm install
```

### 2. Проект Supabase
1. Создайте проект на https://supabase.com (отдельный, изолированный).
2. **SQL Editor** → вставьте и выполните `supabase/migrations/0001_init.sql`.
3. **Authentication → Providers → Email**: включите вход по email+паролю и подтверждение email (OTP-код).
4. (Опц.) **Authentication → URL Configuration** добавьте URL вашего веб-деплоя в Redirect URLs — для ссылок сброса пароля.

### 3. Переменные окружения
```bash
cp .env.example .env
```
Заполните из **Project Settings → API**:
```
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
```
> Пока ключи — заглушки, приложение показывает экран настройки вместо входа.

### 4. Запуск (web)
```bash
npx expo start --web
```

## Скрипты

| Команда | Действие |
|---|---|
| `npx expo start --web` | дев-сервер (веб) |
| `npx expo export --platform web` | production-сборка в `dist/` |
| `npx tsc --noEmit` | проверка типов |
| `npx expo lint` | ESLint |

## Деплой веба на Vercel

Сборка — статический SPA (`web.output: "single"` в `app.json`).

1. `npx expo export --platform web` → артефакт в `dist/`.
2. На Vercel: **Build Command** `npx expo export --platform web`, **Output Directory** `dist`.
3. Добавьте переменные `EXPO_PUBLIC_SUPABASE_URL` и `EXPO_PUBLIC_SUPABASE_ANON_KEY` в Project → Settings → Environment Variables.
4. SPA-роутинг: все пути отдаются на `index.html` (Expo export это уже учитывает).

## iOS / Android (позже)

Код platform-agnostic. Для мобильных сборок:
```bash
npm i -g eas-cli
eas build:configure
eas build --platform ios     # / android
```
Push, виджеты, Apple Health / Google Fit, друзья и челленджи заложены модульно, но в MVP не реализованы.

## Геймификация (правила)

- **Активный день** для стрика — дневной прогресс ≥ 80% (`STREAK_ACTIVE_THRESHOLD` в `src/ui/theme.ts`).
- **XP:** +10 за выполненную задачу, +5 за 100% дня, +100 за завершённую программу. Кривая уровней — `levelFromXp` в `core/logic`.
- XP/уровни/стрики **пересчитываются из данных** (идемпотентно) при каждом изменении — без двойного начисления.

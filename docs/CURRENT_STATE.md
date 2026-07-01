# CURRENT STATE — что задеплоено и что работает

## Ветки / деплой
| Что | Значение |
|---|---|
| Прод (веб) | https://novigo-orpin.vercel.app — ветка `main` |
| `main` (прод) | коммит `eb1f9c1` (Merge PR #5) — **работает** |
| `dev` (рабочая) | впереди `main` на несколько коммитов; последний `4d66dcb` (фикс гейта) — **не влит** |
| dev-preview | `novigo-git-dev-…vercel.app` — был недоступен (000); тестировать на проде |
| Vercel проект | `novigo` (Hobby), owner akryabykh |

## Vercel-конфиг (важно)
- `vercel.json`: `buildCommand: npx expo export --platform web`, `outputDirectory: dist`,
  `framework: null`, SPA-rewrites всё → `/index.html`. Без него — 404.
- Env-переменные в Vercel (Production + Preview): `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Они **вшиваются при сборке** → после изменения нужен
  **Redeploy без Build Cache**.

## Supabase
- Проект `novigo`, ref `tiskzzothxpunkxkogmx`, URL `https://tiskzzothxpunkxkogmx.supabase.co`.
- Клиентский ключ (новый формат): `sb_publishable_wYbUE7gG21HdScPD_WwA8g_R1UItyNF` (публичный,
  защита через RLS).
- Auth: **email + пароль, подтверждение email ВЫКЛЮЧЕНО** (регистрация сразу логинит).
  Кастомные email-шаблоны недоступны без своего SMTP — поэтому OTP/письма не используем.
- Применённые миграции: `0001_init.sql` (СТАРАЯ модель, вытеснена), `0002_goal_sessions.sql`
  (текущая: `goal_sessions` + `goals` + `daily_logs` + RLS).
- ⚠️ Free tier: compute «засыпает» при простое → первый запрос ~3с (cold start). Не баг.

## Что работает (проверено вживую)
- ✅ Регистрация (email+пароль+имя, один экран) → сразу в приложение.
- ✅ Логин → главная (с данными: кольца + цели + степперы; без данных: empty state «Поставить цели»).
- ✅ Логаут (Профиль → «Выйти»): чистит токен, возвращает на `/login`.
- ✅ Создание сессии целей, инлайн +/− на плашках, кольца считаются.
- ✅ Админ-режим `admin` / `1111` → `/admin` (локальное демо-приложение + скруббер дней).

## Известные нюансы
- Кэш браузера может держать старый бандл → нужен `Cmd+Shift+R` после деплоя.
- Одна сессия целей за раз (кнопки «+ новая сессия» намеренно нет; только редактировать/удалить).
- Гейт-фикс для «логин в аккаунт без профиля» — только в `dev`, не в проде.

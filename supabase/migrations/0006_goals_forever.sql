-- ============================================================
-- Novigo — у ЦЕЛЕЙ убрали «разовый» период (только навсегда или до даты).
-- Существующие цели, чей end_date совпадает с концом их периода (были поставлены
-- «только на этот день/неделю/месяц»), переводим в «навсегда» (end_date = null).
-- Задачи (kind='task') не трогаем — они по определению привязаны к периоду.
-- Неделя считается с понедельника (date_trunc('week') в Postgres = понедельник).
-- ============================================================

update public.goals
set end_date = null
where kind = 'goal'
  and end_date is not null
  and (
    (timeframe = 'day'   and end_date = start_date)
    or (timeframe = 'week'  and end_date = (date_trunc('week', start_date)::date + 6))
    or (timeframe = 'month' and end_date = ((date_trunc('month', start_date) + interval '1 month')::date - 1))
  );

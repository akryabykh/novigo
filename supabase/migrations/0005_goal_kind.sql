-- ============================================================
-- Novigo — разделение на «цели» и «задачи».
-- kind = 'goal' (полноценная цель: кол-во 1–9, ручные веса) либо
--        'task'  (задача-галочка: кол-во всегда 1, веса поровну).
-- Обе сущности живут в таблице goals и считаются в кольца одинаково.
-- Аддитивная миграция — данные не сбрасываются (всё старое = 'goal').
-- ============================================================

alter table public.goals
  add column if not exists kind text not null default 'goal'
  check (kind in ('goal', 'task'));

create index if not exists goals_user_kind_idx on public.goals(user_id, kind);

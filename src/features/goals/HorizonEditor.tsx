// Inline editor for ALL goals of one horizon (day / week / month) at once.
// Enforces that the horizon's weights sum to 100%. Each goal has a period
// (starts today, forever or until a date). Add several goals in one flow.
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { NewGoal } from '../../core/data';
import type { Goal, GoalKind, Timeframe } from '../../core/domain';
import { addDays, endOfMonth, endOfWeek, validateWeights } from '../../core/logic';
import type { GoalUpdate } from '../queries';
import { Button, Card, Input, ProgressBar, Text, TrashIcon } from '../../ui/components';
import { radius, spacing, timeframeColor, timeframeLabel } from '../../ui/theme';
import { useColors } from '../../ui/theme-provider';

interface Row {
  key: string;
  id?: string;
  title: string;
  target: string;
  weight: string;
  startDate: string;
  endDate: string | null;
}

const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const fmtDay = (d: string) => `${Number(d.split('-')[2])} ${MONTHS_GEN[Number(d.split('-')[1]) - 1]}`;

const pad = (n: number) => String(n).padStart(2, '0');
function addMonths(d: string, n: number): string {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  const y2 = dt.getUTCFullYear();
  const m2 = dt.getUTCMonth() + 1;
  const last = new Date(Date.UTC(y2, m2, 0)).getUTCDate();
  return `${y2}-${pad(m2)}-${pad(Math.min(day, last))}`;
}

let counter = 0;
const blankRow = (start: string): Row => ({
  key: `n${counter++}`,
  title: '',
  target: '1', // по умолчанию 1
  weight: '',
  startDate: start,
  endDate: null,
});
// Кол-во ограничено 1–9; всё вне диапазона (старые данные) приводим к 1.
const clampCount = (n: number): number => (Number.isInteger(n) && n >= 1 && n <= 9 ? n : 1);

// Разложить веса поровну по строкам (сумма = 100).
function equalizeRows(list: Row[]): Row[] {
  const n = list.length;
  if (n === 0) return list;
  const each = Math.floor((100 / n) * 10) / 10;
  return list.map((x, i) => ({
    ...x,
    weight: String(i === 0 ? Math.round((100 - each * (n - 1)) * 10) / 10 : each),
  }));
}
// Убрать строку и разложить её вес поровну между оставшимися.
function removeAndRedistribute(list: Row[], key: string): Row[] {
  const removed = list.find((x) => x.key === key);
  const rest = list.filter((x) => x.key !== key);
  if (!removed || rest.length === 0) return rest;
  const share = (parseFloat(removed.weight) || 0) / rest.length;
  const w = rest.map((x) => Math.round(((parseFloat(x.weight) || 0) + share) * 10) / 10);
  const diff = Math.round((100 - w.reduce((a, b) => a + b, 0)) * 10) / 10;
  w[0] = Math.round((w[0] + diff) * 10) / 10;
  return rest.map((x, i) => ({ ...x, weight: String(w[i]) }));
}
const fromGoal = (g: Goal): Row => ({
  key: g.id,
  id: g.id,
  title: g.title,
  target: String(clampCount(g.target)),
  weight: String(g.weight),
  startDate: g.startDate,
  endDate: g.endDate,
});

export interface SavePayload {
  updates: GoalUpdate[];
  creates: NewGoal[];
  deletes: string[];
}

export function HorizonEditor({
  scope,
  kind = 'goal',
  existing,
  defaultStart,
  addNew,
  saving,
  onSave,
  onCancel,
}: {
  scope: Timeframe;
  /** 'goal' — count + manual weights; 'task' — checkbox item, weights auto-equal */
  kind?: GoalKind;
  existing: Goal[];
  /** start date for newly-added goals (the day you're creating them on, never in the past) */
  defaultStart: string;
  /** open with a fresh blank goal already prepended, ready to fill */
  addNew?: boolean;
  saving?: boolean;
  onSave: (payload: SavePayload) => void;
  onCancel: () => void;
}) {
  const c = useColors();
  const color = timeframeColor[scope];
  const isTask = kind === 'task';

  const [rows, setRows] = useState<Row[]>(() => {
    const base = existing.map(fromGoal);
    return addNew || base.length === 0 ? equalizeRows([blankRow(defaultStart), ...base]) : base;
  });
  const [error, setError] = useState<string | null>(null);

  // period end for a "one-time" goal: just this day / this week / this month
  const oneTimeEnd = (start: string): string =>
    scope === 'day' ? start : scope === 'week' ? endOfWeek(start) : endOfMonth(start);

  const update = (key: string, patch: Partial<Row>) =>
    setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  // adding a goal re-splits weights equally across all goals (user can tweak after)
  const add = () => setRows((r) => equalizeRows([blankRow(defaultStart), ...r]));
  const remove = (key: string) => setRows((r) => removeAndRedistribute(r, key));
  const distribute = () => setRows((r) => equalizeRows(r));

  const sum = rows.reduce((s, r) => s + (parseFloat(r.weight) || 0), 0);
  const remaining = Math.round((100 - sum) * 10) / 10;

  const save = () => {
    setError(null);
    if (rows.length === 0) return setError('Добавь хотя бы одну цель');
    const parsed = rows.map((r) => ({
      row: r,
      title: r.title.trim(),
      target: parseFloat(r.target),
      weight: parseFloat(r.weight) || 0,
    }));
    for (const p of parsed) {
      if (!p.title) return setError(isTask ? 'У каждой задачи должно быть название' : 'У каждой цели должно быть название');
      if (!isTask && (!Number.isFinite(p.target) || p.target <= 0))
        return setError(`Кол-во (> 0) для «${p.title || '—'}»`);
      if (p.row.endDate) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(p.row.endDate)) return setError('Дата в формате ГГГГ-ММ-ДД');
        if (p.row.endDate < p.row.startDate) return setError('Дата окончания не раньше начала');
      }
    }
    if (!isTask && !validateWeights(parsed).ok)
      return setError(`Сумма весов «${timeframeLabel[scope].toLowerCase()}» должна быть 100% (сейчас ${Math.round(sum)}%)`);

    // tasks: count is always 1 and weights split equally
    const eachW = Math.round((100 / parsed.length) * 10) / 10;
    const updates: GoalUpdate[] = [];
    const creates: NewGoal[] = [];
    for (const p of parsed) {
      const target = isTask ? 1 : p.target;
      const weight = isTask ? eachW : p.weight;
      // tasks are always bound to their period (this day / week / month)
      const endDate = isTask ? oneTimeEnd(p.row.startDate) : p.row.endDate;
      if (p.row.id) updates.push({ id: p.row.id, title: p.title, target, weight, endDate });
      else
        creates.push({ kind, title: p.title, timeframe: scope, target, weight, startDate: p.row.startDate, endDate });
    }
    const keptIds = new Set(rows.map((r) => r.id).filter(Boolean) as string[]);
    const deletes = existing.map((g) => g.id).filter((id) => !keptIds.has(id));

    onSave({ updates, creates, deletes });
  };

  return (
    <View style={{ gap: spacing.md }}>
      {/* compact action bar on top */}
      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button title="Сохранить" size="md" onPress={save} loading={saving} />
          </View>
          <Button title="Отмена" size="md" variant="secondary" fullWidth={false} onPress={onCancel} />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Pressable
            onPress={add}
            style={{
              flex: 1,
              height: 38,
              borderRadius: radius.md,
              borderWidth: 1.5,
              borderColor: c.border,
              borderStyle: 'dashed',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Text variant="label" style={{ color }}>
              ＋ Ещё {isTask ? 'задача' : 'цель'}
            </Text>
          </Pressable>
          {!isTask && rows.length > 1 ? (
            <Pressable
              onPress={distribute}
              style={{
                height: 38,
                paddingHorizontal: spacing.lg,
                borderRadius: radius.md,
                backgroundColor: c.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Text variant="label" tone="muted">
                Поровну
              </Text>
            </Pressable>
          ) : null}
        </View>
        {error ? (
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
        <Text variant="heading" style={{ flex: 1 }}>
          {isTask ? 'Задачи' : 'Цели'} · {timeframeLabel[scope].toLowerCase()}
        </Text>
        {!isTask ? (
          <Text
            variant="caption"
            style={{ color: remaining === 0 ? c.success : remaining < 0 ? c.danger : c.textMuted }}>
            {remaining === 0 ? '100% ✓' : remaining > 0 ? `ост. ${remaining}%` : `+${Math.abs(remaining)}%`}
          </Text>
        ) : null}
      </View>
      {!isTask ? (
        <ProgressBar
          progress={Math.min(1, sum / 100)}
          color={remaining < 0 ? c.danger : sum === 100 ? c.success : color}
        />
      ) : null}
      <Text variant="caption" tone="faint">
        {isTask
          ? `Задачи — только на ${scope === 'day' ? 'этот день' : scope === 'week' ? 'эту неделю' : 'этот месяц'} (с ${fmtDay(defaultStart)}).`
          : `Новые цели начнутся с ${fmtDay(defaultStart)} — навсегда или до выбранной даты.`}
      </Text>

      {rows.map((r) => (
        <Card key={r.key}>
          <View style={{ gap: spacing.sm }}>
            {/* row 1: title + delete */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Input
                  value={r.title}
                  onChangeText={(t) => update(r.key, { title: t })}
                  placeholder={isTask ? 'Название задачи' : 'Название цели'}
                />
              </View>
              <Pressable
                onPress={() => remove(r.key)}
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}>
                <TrashIcon size={20} color={c.danger} strokeWidth={1.8} />
              </Pressable>
            </View>

            {/* row 2 (goals only): кол-во + вес % + период. tasks are checkbox-only. */}
            {!isTask ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: spacing.sm }}>
                <NumberPicker
                  value={parseInt(r.target, 10) || 1}
                  color={color}
                  onChange={(n) => update(r.key, { target: String(n) })}
                />
                <View style={{ width: 92 }}>
                  <Input
                    value={r.weight}
                    onChangeText={(t) => update(r.key, { weight: t })}
                    keyboardType="numeric"
                    placeholder="вес %"
                  />
                </View>
                <Chip label="Навсегда" active={!r.endDate} color={color} onPress={() => update(r.key, { endDate: null })} />
                <Chip
                  label="До даты"
                  active={!!r.endDate}
                  color={color}
                  onPress={() => update(r.key, { endDate: r.endDate ?? addMonths(r.startDate, 1) })}
                />
              </View>
            ) : null}

            {!isTask && r.endDate ? (
              <View style={{ gap: spacing.sm }}>
                <Input
                  value={r.endDate}
                  onChangeText={(t) => update(r.key, { endDate: t })}
                  placeholder="2026-12-31"
                  autoCapitalize="none"
                />
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Chip label="+1 нед" color={color} onPress={() => update(r.key, { endDate: addDays(r.startDate, 7) })} />
                  <Chip label="+1 мес" color={color} onPress={() => update(r.key, { endDate: addMonths(r.startDate, 1) })} />
                  <Chip label="+3 мес" color={color} onPress={() => update(r.key, { endDate: addMonths(r.startDate, 3) })} />
                </View>
              </View>
            ) : null}
          </View>
        </Card>
      ))}

    </View>
  );
}

function NumberPicker({
  value,
  color,
  onChange,
}: {
  value: number;
  color: string;
  onChange: (n: number) => void;
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const shown = nums.includes(value) ? value : 1;
  return (
    <View>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={{
          height: 44,
          paddingHorizontal: spacing.md,
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor: open ? color : c.border,
          backgroundColor: c.surface,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}>
        <Text variant="label" tone="muted">
          Кол-во
        </Text>
        <Text variant="label" style={{ color: c.text }}>
          {shown}
        </Text>
        <Text variant="caption" tone="faint">
          ▾
        </Text>
      </Pressable>
      {open ? (
        <View
          style={{
            marginTop: 6,
            width: 120,
            borderWidth: 1.5,
            borderColor: c.border,
            borderRadius: radius.md,
            backgroundColor: c.surface,
            overflow: 'hidden',
          }}>
          {nums.map((n, idx) => {
            const active = n === shown;
            return (
              <Pressable
                key={n}
                onPress={() => {
                  onChange(n);
                  setOpen(false);
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: spacing.md,
                  backgroundColor: active ? c.surfaceAlt : 'transparent',
                  borderTopWidth: idx ? 1 : 0,
                  borderTopColor: c.border,
                }}>
                <Text variant="label" style={{ color: active ? color : c.text }}>
                  {n}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function Chip({
  label,
  active,
  color,
  onPress,
}: {
  label: string;
  active?: boolean;
  color: string;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: spacing.md,
        height: 36,
        borderRadius: radius.md,
        borderWidth: 1.5,
        borderColor: active ? color : c.border,
        backgroundColor: active ? c.surface : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text variant="label" style={{ color: active ? color : c.textMuted }}>
        {label}
      </Text>
    </Pressable>
  );
}

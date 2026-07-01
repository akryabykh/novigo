// Inline editor for ALL goals of one horizon (day / week / month) at once.
// Enforces that the horizon's weights sum to 100%. Each goal has a period
// (starts today, forever or until a date). Add several goals in one flow.
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { NewGoal } from '../../core/data';
import type { Goal, Timeframe } from '../../core/domain';
import { addDays, validateWeights } from '../../core/logic';
import type { GoalUpdate } from '../queries';
import { Button, Card, Input, ProgressBar, Text } from '../../ui/components';
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
const fromGoal = (g: Goal): Row => ({
  key: g.id,
  id: g.id,
  title: g.title,
  target: String(g.target),
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
  existing,
  defaultStart,
  saving,
  onSave,
  onCancel,
}: {
  scope: Timeframe;
  existing: Goal[];
  /** start date for newly-added goals (the day you're creating them on, never in the past) */
  defaultStart: string;
  saving?: boolean;
  onSave: (payload: SavePayload) => void;
  onCancel: () => void;
}) {
  const c = useColors();
  const color = timeframeColor[scope];

  const [rows, setRows] = useState<Row[]>(() =>
    existing.length ? existing.map(fromGoal) : [blankRow(defaultStart)],
  );
  const [error, setError] = useState<string | null>(null);

  const update = (key: string, patch: Partial<Row>) =>
    setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const add = () => setRows((r) => [...r, blankRow(defaultStart)]);
  const remove = (key: string) => setRows((r) => r.filter((x) => x.key !== key));
  const distribute = () =>
    setRows((r) => {
      const n = r.length;
      if (n === 0) return r;
      const each = Math.floor((100 / n) * 10) / 10;
      return r.map((x, i) => ({
        ...x,
        weight: String(i === 0 ? Math.round((100 - each * (n - 1)) * 10) / 10 : each),
      }));
    });

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
      if (!p.title) return setError('У каждой цели должно быть название');
      if (!Number.isFinite(p.target) || p.target <= 0) return setError(`Цель (> 0) для «${p.title || '—'}»`);
      if (p.row.endDate) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(p.row.endDate)) return setError('Дата в формате ГГГГ-ММ-ДД');
        if (p.row.endDate < p.row.startDate) return setError('Дата окончания не раньше начала');
      }
    }
    if (!validateWeights(parsed).ok)
      return setError(`Сумма весов «${timeframeLabel[scope].toLowerCase()}» должна быть 100% (сейчас ${Math.round(sum)}%)`);

    const updates: GoalUpdate[] = [];
    const creates: NewGoal[] = [];
    for (const p of parsed) {
      if (p.row.id)
        updates.push({ id: p.row.id, title: p.title, target: p.target, weight: p.weight, endDate: p.row.endDate });
      else
        creates.push({
          title: p.title,
          timeframe: scope,
          target: p.target,
          weight: p.weight,
          startDate: p.row.startDate,
          endDate: p.row.endDate,
        });
    }
    const keptIds = new Set(rows.map((r) => r.id).filter(Boolean) as string[]);
    const deletes = existing.map((g) => g.id).filter((id) => !keptIds.has(id));

    onSave({ updates, creates, deletes });
  };

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
        <Text variant="heading" style={{ flex: 1 }}>
          Цели · {timeframeLabel[scope].toLowerCase()}
        </Text>
        <Text
          variant="caption"
          style={{ color: remaining === 0 ? c.success : remaining < 0 ? c.danger : c.textMuted }}>
          {remaining === 0 ? '100% ✓' : remaining > 0 ? `ост. ${remaining}%` : `+${Math.abs(remaining)}%`}
        </Text>
      </View>
      <ProgressBar
        progress={Math.min(1, sum / 100)}
        color={remaining < 0 ? c.danger : sum === 100 ? c.success : color}
      />
      <Text variant="caption" tone="faint">
        Новые цели начнутся с {fmtDay(defaultStart)}, действуют «навсегда» или до выбранной даты.
      </Text>

      {rows.map((r) => (
        <Card key={r.key}>
          <View style={{ gap: spacing.sm }}>
            {/* row 1: title + delete */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Input value={r.title} onChangeText={(t) => update(r.key, { title: t })} placeholder="Название цели" />
              </View>
              <Text variant="label" tone="danger" onPress={() => remove(r.key)}>
                Удалить
              </Text>
            </View>

            {/* row 2: кол-во (1–9) + вес % + период */}
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

            {r.endDate ? (
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

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Pressable
          onPress={add}
          style={{
            flex: 1,
            height: 44,
            borderRadius: radius.md,
            borderWidth: 1.5,
            borderColor: c.border,
            borderStyle: 'dashed',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text variant="label" style={{ color }}>
            Добавить ещё цель
          </Text>
        </Pressable>
        {rows.length > 1 ? (
          <Pressable
            onPress={distribute}
            style={{
              height: 44,
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

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Button title="Сохранить" onPress={save} loading={saving} />
        </View>
        <View style={{ width: 110 }}>
          <Button title="Отмена" variant="secondary" onPress={onCancel} />
        </View>
      </View>
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
  const base = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const nums = base.includes(value) ? base : [value, ...base];
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
          {value}
        </Text>
        <Text variant="caption" tone="faint">
          ▾
        </Text>
      </Pressable>
      {open ? (
        <View style={{ marginTop: 6, flexDirection: 'row', flexWrap: 'wrap', gap: 6, maxWidth: 190 }}>
          {nums.map((n) => {
            const active = n === value;
            return (
              <Pressable
                key={n}
                onPress={() => {
                  onChange(n);
                  setOpen(false);
                }}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1.5,
                  borderColor: active ? color : c.border,
                  backgroundColor: active ? c.surfaceAlt : 'transparent',
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

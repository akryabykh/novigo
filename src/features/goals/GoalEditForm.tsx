// Inline create/edit form for a single goal — used right on the home screen.
// Period: starts today (no backdating), runs forever or until a chosen date.
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { Timeframe } from '../../core/domain';
import { addDays, todayISO } from '../../core/logic';
import { Button, Card, Input, Text } from '../../ui/components';
import { radius, spacing, timeframeColor } from '../../ui/theme';
import { useColors } from '../../ui/theme-provider';

export interface GoalDraft {
  title: string;
  target: number;
  weight: number;
  endDate: string | null;
}

function addMonths(d: string, n: number): string {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  const y2 = dt.getUTCFullYear();
  const m2 = dt.getUTCMonth() + 1;
  const last = new Date(Date.UTC(y2, m2, 0)).getUTCDate();
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${y2}-${pad(m2)}-${pad(Math.min(day, last))}`;
}

export function GoalEditForm({
  timeframe,
  initial,
  minEnd,
  onSubmit,
  onCancel,
  onDelete,
  saving,
}: {
  timeframe: Timeframe;
  initial?: { title: string; target: number; weight: number; endDate: string | null };
  /** earliest allowed end date (goal start); defaults to today */
  minEnd?: string;
  onSubmit: (draft: GoalDraft) => void;
  onCancel: () => void;
  onDelete?: () => void;
  saving?: boolean;
}) {
  const color = timeframeColor[timeframe];
  const floor = minEnd ?? todayISO();

  const [title, setTitle] = useState(initial?.title ?? '');
  const [target, setTarget] = useState(initial ? String(initial.target) : '');
  const [weight, setWeight] = useState(initial ? String(initial.weight) : '');
  const [endMode, setEndMode] = useState<'forever' | 'date'>(initial?.endDate ? 'date' : 'forever');
  const [endDate, setEndDate] = useState(initial?.endDate ?? addMonths(floor, 1));
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const t = title.trim();
    const tg = parseFloat(target);
    const w = parseFloat(weight);
    if (!t) return setError('Введи название');
    if (!Number.isFinite(tg) || tg <= 0) return setError('Цель должна быть числом больше 0');
    if (!Number.isFinite(w) || w < 0 || w > 100) return setError('Вес — от 0 до 100');
    let end: string | null = null;
    if (endMode === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return setError('Дата в формате ГГГГ-ММ-ДД');
      if (endDate < floor) return setError('Дата окончания не раньше начала');
      end = endDate;
    }
    onSubmit({ title: t, target: tg, weight: Number.isFinite(w) ? w : 0, endDate: end });
  };

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <Input value={title} onChangeText={setTitle} placeholder="Название цели" />
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Input label="Цель" value={target} onChangeText={setTarget} keyboardType="numeric" placeholder="30" />
          </View>
          <View style={{ width: 96 }}>
            <Input label="Вес %" value={weight} onChangeText={setWeight} keyboardType="numeric" placeholder="50" />
          </View>
        </View>

        {/* period */}
        <View style={{ gap: spacing.sm }}>
          <Text variant="label" tone="muted">
            Период (с сегодня)
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Chip label="Навсегда" active={endMode === 'forever'} color={color} onPress={() => setEndMode('forever')} />
            <Chip label="До даты" active={endMode === 'date'} color={color} onPress={() => setEndMode('date')} />
          </View>
          {endMode === 'date' ? (
            <View style={{ gap: spacing.sm }}>
              <Input value={endDate} onChangeText={setEndDate} placeholder="2026-12-31" autoCapitalize="none" />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Chip label="+1 нед" color={color} onPress={() => setEndDate(addDays(floor, 7))} />
                <Chip label="+1 мес" color={color} onPress={() => setEndDate(addMonths(floor, 1))} />
                <Chip label="+3 мес" color={color} onPress={() => setEndDate(addMonths(floor, 3))} />
              </View>
            </View>
          ) : null}
        </View>

        {error ? (
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        ) : null}

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Button title="Сохранить" onPress={submit} loading={saving} />
          </View>
          <View style={{ width: 110 }}>
            <Button title="Отмена" variant="secondary" onPress={onCancel} />
          </View>
        </View>
        {onDelete ? (
          <Text variant="label" tone="danger" style={{ textAlign: 'center' }} onPress={onDelete}>
            Удалить цель
          </Text>
        ) : null}
      </View>
    </Card>
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

import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { GoalType, Period } from '../../../core/domain';
import { validateWeights } from '../../../core/logic';
import { useAuth } from '../../../features/auth/auth-provider';
import { useCreateProgram } from '../../../features/queries';
import {
  Button,
  Card,
  Input,
  ProgressBar,
  SegmentedControl,
  Text,
} from '../../../ui/components';
import { radius, spacing } from '../../../ui/theme';
import { useColors } from '../../../ui/theme-provider';

interface Row {
  key: string;
  title: string;
  goalType: GoalType;
  target: string;
  unit: string;
  weight: string;
}

let counter = 0;
const newRow = (): Row => ({
  key: `r${counter++}`,
  title: '',
  goalType: 'daily',
  target: '',
  unit: '',
  weight: '',
});

const PERIODS: { value: Period; label: string }[] = [
  { value: '1w', label: 'Неделя' },
  { value: '2w', label: '2 недели' },
  { value: '1m', label: 'Месяц' },
];

const GOAL_TYPES: { value: GoalType; label: string }[] = [
  { value: 'daily', label: 'Каждый день' },
  { value: 'period', label: 'За период' },
];

export default function NewProgramScreen() {
  const c = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const createProgram = useCreateProgram(user?.id);

  const [title, setTitle] = useState('');
  const [period, setPeriod] = useState<Period>('1w');
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [error, setError] = useState<string | null>(null);

  const weightSum = useMemo(
    () => rows.reduce((s, r) => s + (parseFloat(r.weight) || 0), 0),
    [rows],
  );
  const remaining = Math.round((100 - weightSum) * 10) / 10;

  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));

  const distribute = () => {
    const n = rows.length;
    if (n === 0) return;
    const each = Math.floor((100 / n) * 10) / 10;
    setRows((rs) =>
      rs.map((r, i) => ({
        ...r,
        weight: String(i === 0 ? Math.round((100 - each * (n - 1)) * 10) / 10 : each),
      })),
    );
  };

  const submit = () => {
    setError(null);
    if (!title.trim()) return setError('Введите название программы');
    if (rows.length === 0) return setError('Добавьте хотя бы одну задачу');

    const tasks = rows.map((r) => ({
      title: r.title.trim(),
      goalType: r.goalType,
      target: parseFloat(r.target),
      unit: r.unit.trim() || null,
      weight: parseFloat(r.weight) || 0,
    }));

    for (const t of tasks) {
      if (!t.title) return setError('У каждой задачи должно быть название');
      if (!Number.isFinite(t.target) || t.target <= 0)
        return setError(`Укажите цель (> 0) для «${t.title || 'задачи'}»`);
    }
    if (!validateWeights(tasks).ok)
      return setError(`Сумма весов должна быть 100% (сейчас ${Math.round(weightSum)}%)`);

    createProgram.mutate(
      { title: title.trim(), period, tasks },
      {
        onSuccess: () => router.replace('/(app)'),
        onError: (e: any) => setError(e?.message ?? 'Не удалось создать программу'),
      },
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      {/* header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing.md,
        }}>
        <Text variant="heading">Новая программа</Text>
        <Text variant="label" tone="muted" onPress={() => router.back()}>
          Отмена
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ alignItems: 'center', paddingBottom: spacing['3xl'] }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={{ width: '100%', maxWidth: 560, paddingHorizontal: spacing.xl, gap: spacing.xl }}>
          <Input
            label="Название"
            value={title}
            onChangeText={setTitle}
            placeholder="Например: Спортивная неделя"
          />

          <View style={{ gap: spacing.sm }}>
            <Text variant="label" tone="muted">
              Период
            </Text>
            <SegmentedControl segments={PERIODS} value={period} onChange={setPeriod} />
          </View>

          {/* weights summary */}
          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="label" tone="muted">
                Задачи и веса
              </Text>
              <Text
                variant="label"
                tone={remaining === 0 ? 'success' : remaining < 0 ? 'danger' : 'muted'}>
                {remaining === 0
                  ? '100% ✓'
                  : remaining > 0
                    ? `осталось ${remaining}%`
                    : `перебор ${Math.abs(remaining)}%`}
              </Text>
            </View>
            <ProgressBar
              progress={Math.min(1, weightSum / 100)}
              color={remaining < 0 ? c.danger : weightSum === 100 ? c.success : c.accent}
            />
          </View>

          {/* task rows */}
          <View style={{ gap: spacing.lg }}>
            {rows.map((r, i) => (
              <Card key={r.key}>
                <View style={{ gap: spacing.md }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text variant="label" tone="faint">
                      Задача {i + 1}
                    </Text>
                    {rows.length > 1 ? (
                      <Text variant="label" tone="danger" onPress={() => remove(r.key)}>
                        Удалить
                      </Text>
                    ) : null}
                  </View>
                  <Input
                    value={r.title}
                    onChangeText={(t) => update(r.key, { title: t })}
                    placeholder="Название задачи"
                  />
                  <SegmentedControl
                    segments={GOAL_TYPES}
                    value={r.goalType}
                    onChange={(v) => update(r.key, { goalType: v })}
                  />
                  <View style={{ flexDirection: 'row', gap: spacing.md }}>
                    <View style={{ flex: 1 }}>
                      <Input
                        label={r.goalType === 'daily' ? 'Цель/день' : 'Цель/период'}
                        value={r.target}
                        onChangeText={(t) => update(r.key, { target: t })}
                        keyboardType="numeric"
                        placeholder="30"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Input
                        label="Единицы"
                        value={r.unit}
                        onChangeText={(t) => update(r.key, { unit: t })}
                        placeholder="мин / стр"
                      />
                    </View>
                    <View style={{ width: 88 }}>
                      <Input
                        label="Вес %"
                        value={r.weight}
                        onChangeText={(t) => update(r.key, { weight: t })}
                        keyboardType="numeric"
                        placeholder="50"
                      />
                    </View>
                  </View>
                </View>
              </Card>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Pressable
              onPress={() => setRows((rs) => [...rs, newRow()])}
              style={{
                flex: 1,
                height: 48,
                borderRadius: radius.md,
                borderWidth: 1.5,
                borderColor: c.border,
                borderStyle: 'dashed',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Text variant="label" tone="accent">
                + Добавить задачу
              </Text>
            </Pressable>
            <Pressable
              onPress={distribute}
              style={{
                height: 48,
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
          </View>

          {error ? (
            <Text variant="caption" tone="danger">
              {error}
            </Text>
          ) : null}

          <Button title="Создать программу" onPress={submit} loading={createProgram.isPending} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

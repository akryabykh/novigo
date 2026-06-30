import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Timeframe } from '../../../core/domain';
import { validateWeights } from '../../../core/logic';
import { useAuth } from '../../../features/auth/auth-provider';
import { useCreateSession } from '../../../features/queries';
import type { NewGoal } from '../../../core/data';
import { Button, Card, Input, ProgressBar, Text } from '../../../ui/components';
import { radius, spacing, timeframeColor, timeframeLabel } from '../../../ui/theme';
import { useColors } from '../../../ui/theme-provider';

interface Row {
  key: string;
  title: string;
  target: string;
  weight: string;
}
type Rows = Record<Timeframe, Row[]>;

let counter = 0;
const newRow = (): Row => ({ key: `r${counter++}`, title: '', target: '', weight: '' });

const ORDER: Timeframe[] = ['day', 'week', 'month'];
const HINT: Record<Timeframe, string> = {
  day: 'каждый день',
  week: 'за неделю',
  month: 'за месяц (4 недели)',
};

export default function NewSessionScreen() {
  const c = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const createSession = useCreateSession(user?.id);

  const [rows, setRows] = useState<Rows>({ day: [newRow()], week: [], month: [] });
  const [error, setError] = useState<string | null>(null);

  const update = (tf: Timeframe, key: string, patch: Partial<Row>) =>
    setRows((r) => ({ ...r, [tf]: r[tf].map((x) => (x.key === key ? { ...x, ...patch } : x)) }));
  const add = (tf: Timeframe) => setRows((r) => ({ ...r, [tf]: [...r[tf], newRow()] }));
  const remove = (tf: Timeframe, key: string) =>
    setRows((r) => ({ ...r, [tf]: r[tf].filter((x) => x.key !== key) }));
  const distribute = (tf: Timeframe) =>
    setRows((r) => {
      const list = r[tf];
      const n = list.length;
      if (n === 0) return r;
      const each = Math.floor((100 / n) * 10) / 10;
      return {
        ...r,
        [tf]: list.map((x, i) => ({
          ...x,
          weight: String(i === 0 ? Math.round((100 - each * (n - 1)) * 10) / 10 : each),
        })),
      };
    });

  const submit = () => {
    setError(null);
    const goals: NewGoal[] = [];

    for (const tf of ORDER) {
      const list = rows[tf];
      if (list.length === 0) continue;
      const parsed = list.map((x) => ({
        title: x.title.trim(),
        timeframe: tf,
        target: parseFloat(x.target),
        weight: parseFloat(x.weight) || 0,
      }));
      for (const g of parsed) {
        if (!g.title) return setError(`«${timeframeLabel[tf]}»: у каждой цели должно быть название`);
        if (!Number.isFinite(g.target) || g.target <= 0)
          return setError(`«${timeframeLabel[tf]}»: укажи цель (> 0) для «${g.title}»`);
      }
      const w = validateWeights(parsed);
      if (!w.ok)
        return setError(`«${timeframeLabel[tf]}»: сумма весов должна быть 100% (сейчас ${Math.round(w.sum)}%)`);
      goals.push(...parsed);
    }

    if (goals.length === 0) return setError('Добавь хотя бы одну цель');

    createSession.mutate(goals, {
      onSuccess: () => router.replace('/(app)'),
      onError: (e: any) => setError(e?.message ?? 'Не удалось создать сессию'),
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing.md,
        }}>
        <Text variant="heading">Новая сессия целей</Text>
        <Text variant="label" tone="muted" onPress={() => router.back()}>
          Отмена
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ alignItems: 'center', paddingBottom: spacing['3xl'] }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={{ width: '100%', maxWidth: 560, paddingHorizontal: spacing.xl, gap: spacing.xl }}>
          <Text variant="body" tone="muted">
            Отсчёт пойдёт с момента создания: день, неделя и месяц (4 недели). Веса внутри каждого
            горизонта в сумме = 100%.
          </Text>

          {ORDER.map((tf) => (
            <Section
              key={tf}
              tf={tf}
              rows={rows[tf]}
              onUpdate={(key, patch) => update(tf, key, patch)}
              onAdd={() => add(tf)}
              onRemove={(key) => remove(tf, key)}
              onDistribute={() => distribute(tf)}
            />
          ))}

          {error ? (
            <Text variant="caption" tone="danger">
              {error}
            </Text>
          ) : null}

          <Button title="Создать цели" onPress={submit} loading={createSession.isPending} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  tf,
  rows,
  onUpdate,
  onAdd,
  onRemove,
  onDistribute,
}: {
  tf: Timeframe;
  rows: Row[];
  onUpdate: (key: string, patch: Partial<Row>) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
  onDistribute: () => void;
}) {
  const c = useColors();
  const color = timeframeColor[tf];
  const sum = rows.reduce((s, r) => s + (parseFloat(r.weight) || 0), 0);
  const remaining = Math.round((100 - sum) * 10) / 10;

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
        <Text variant="heading" style={{ flex: 1 }}>
          {timeframeLabel[tf]}
        </Text>
        <Text variant="caption" tone="faint">
          {HINT[tf]}
        </Text>
      </View>

      {rows.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="label" tone="muted">
              Веса
            </Text>
            <Text
              variant="label"
              style={{ color: remaining === 0 ? c.success : remaining < 0 ? c.danger : c.textMuted }}>
              {remaining === 0 ? '100% ✓' : remaining > 0 ? `осталось ${remaining}%` : `перебор ${Math.abs(remaining)}%`}
            </Text>
          </View>
          <ProgressBar
            progress={Math.min(1, sum / 100)}
            color={remaining < 0 ? c.danger : sum === 100 ? c.success : color}
          />
        </View>
      ) : null}

      {rows.map((r, i) => (
        <Card key={r.key}>
          <View style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="label" tone="faint">
                Цель {i + 1}
              </Text>
              <Text variant="label" tone="danger" onPress={() => onRemove(r.key)}>
                Удалить
              </Text>
            </View>
            <Input
              value={r.title}
              onChangeText={(t) => onUpdate(r.key, { title: t })}
              placeholder="Название цели"
            />
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Цель (число)"
                  value={r.target}
                  onChangeText={(t) => onUpdate(r.key, { target: t })}
                  keyboardType="numeric"
                  placeholder="30"
                />
              </View>
              <View style={{ width: 96 }}>
                <Input
                  label="Вес %"
                  value={r.weight}
                  onChangeText={(t) => onUpdate(r.key, { weight: t })}
                  keyboardType="numeric"
                  placeholder="50"
                />
              </View>
            </View>
          </View>
        </Card>
      ))}

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Pressable
          onPress={onAdd}
          style={{
            flex: 1,
            height: 46,
            borderRadius: radius.md,
            borderWidth: 1.5,
            borderColor: c.border,
            borderStyle: 'dashed',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text variant="label" style={{ color }}>
            + Добавить цель
          </Text>
        </Pressable>
        {rows.length > 1 ? (
          <Pressable
            onPress={onDistribute}
            style={{
              height: 46,
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
    </View>
  );
}

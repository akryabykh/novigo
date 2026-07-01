import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { NewGoal } from '../../../core/data';
import type { Goal, Timeframe } from '../../../core/domain';
import { todayISO, validateWeights } from '../../../core/logic';
import { useAuth } from '../../../features/auth/auth-provider';
import { useSaveGoals, useWorkspace, type GoalUpdate } from '../../../features/queries';
import { Button, Card, Input, ProgressBar, Text } from '../../../ui/components';
import { radius, spacing, timeframeColor, timeframeLabel } from '../../../ui/theme';
import { useColors } from '../../../ui/theme-provider';

interface Row {
  key: string;
  id?: string;
  title: string;
  target: string;
  weight: string;
  endDate: string | null;
}
type Rows = Record<Timeframe, Row[]>;
const ORDER: Timeframe[] = ['day', 'week', 'month'];
const HINT: Record<Timeframe, string> = {
  day: 'каждый день',
  week: 'каждую неделю',
  month: 'каждый месяц',
};

let counter = 0;
const blankRow = (): Row => ({ key: `n${counter++}`, title: '', target: '', weight: '', endDate: null });
const fromGoal = (g: Goal): Row => ({
  key: g.id,
  id: g.id,
  title: g.title,
  target: String(g.target),
  weight: String(g.weight),
  endDate: g.endDate,
});
const seedRows = (goals: Goal[]): Rows => ({
  day: goals.filter((g) => g.timeframe === 'day').map(fromGoal),
  week: goals.filter((g) => g.timeframe === 'week').map(fromGoal),
  month: goals.filter((g) => g.timeframe === 'month').map(fromGoal),
});

export default function GoalsEditorScreen() {
  const { user } = useAuth();
  const { data: ws, isLoading } = useWorkspace(user?.id);

  return (
    <ScreenFrame>
      {isLoading && !ws ? (
        <Text variant="body" tone="muted">
          Загрузка…
        </Text>
      ) : (
        <Editor uid={user?.id} existing={ws?.goals ?? []} />
      )}
    </ScreenFrame>
  );
}

function ScreenFrame({ children }: { children: React.ReactNode }) {
  const c = useColors();
  const router = useRouter();
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
        <Text variant="heading">Мои цели</Text>
        <Text variant="label" tone="muted" onPress={() => router.back()}>
          Закрыть
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={{ alignItems: 'center', paddingBottom: spacing['3xl'] }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={{ width: '100%', maxWidth: 560, paddingHorizontal: spacing.xl, gap: spacing.lg }}>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Editor({ uid, existing }: { uid: string | undefined; existing: Goal[] }) {
  const router = useRouter();
  const saveGoals = useSaveGoals(uid);

  const [rows, setRows] = useState<Rows>(() => seedRows(existing));
  const [error, setError] = useState<string | null>(null);

  const update = (tf: Timeframe, key: string, patch: Partial<Row>) =>
    setRows((r) => ({ ...r, [tf]: r[tf].map((x) => (x.key === key ? { ...x, ...patch } : x)) }));
  const add = (tf: Timeframe) => setRows((r) => ({ ...r, [tf]: [...r[tf], blankRow()] }));
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

  const save = () => {
    setError(null);
    const updates: GoalUpdate[] = [];
    const creates: NewGoal[] = [];

    for (const tf of ORDER) {
      const list = rows[tf];
      if (list.length === 0) continue;
      const parsed = list.map((x) => ({
        row: x,
        title: x.title.trim(),
        target: parseFloat(x.target),
        weight: parseFloat(x.weight) || 0,
      }));
      for (const p of parsed) {
        if (!p.title) return setError(`«${timeframeLabel[tf]}»: у каждой цели нужно название`);
        if (!Number.isFinite(p.target) || p.target <= 0)
          return setError(`«${timeframeLabel[tf]}»: укажи цель (> 0) для «${p.title}»`);
      }
      if (!validateWeights(parsed).ok)
        return setError(`«${timeframeLabel[tf]}»: сумма весов должна быть 100%`);

      for (const p of parsed) {
        if (p.row.id)
          updates.push({ id: p.row.id, title: p.title, target: p.target, weight: p.weight, endDate: p.row.endDate });
        else
          creates.push({
            title: p.title,
            timeframe: tf,
            target: p.target,
            weight: p.weight,
            startDate: todayISO(),
            endDate: null,
          });
      }
    }

    const keptIds = new Set(
      ORDER.flatMap((tf) => rows[tf].map((r) => r.id).filter(Boolean) as string[]),
    );
    const deletes = existing.map((g) => g.id).filter((id) => !keptIds.has(id));

    if (updates.length + creates.length === 0) return setError('Добавь хотя бы одну цель');

    saveGoals.mutate(
      { updates, creates, deletes },
      { onSuccess: () => router.replace('/(app)'), onError: (e: any) => setError(e?.message ?? 'Ошибка') },
    );
  };

  return (
    <>
      <Text variant="body" tone="muted">
        Цели повторяются: дневные — каждый день, недельные — каждую неделю, месячные — каждый месяц.
        Веса внутри горизонта в сумме = 100%.
      </Text>

      {ORDER.map((tf) => (
        <EditSection
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

      <Button title="Сохранить" onPress={save} loading={saveGoals.isPending} />
    </>
  );
}

function EditSection({
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
        {rows.length > 0 ? (
          <Text
            variant="caption"
            style={{ color: remaining === 0 ? c.success : remaining < 0 ? c.danger : c.textMuted }}>
            {remaining === 0 ? '100% ✓' : remaining > 0 ? `ост. ${remaining}%` : `+${Math.abs(remaining)}%`}
          </Text>
        ) : (
          <Text variant="caption" tone="faint">
            {HINT[tf]}
          </Text>
        )}
      </View>
      {rows.length > 0 ? (
        <ProgressBar
          progress={Math.min(1, sum / 100)}
          color={remaining < 0 ? c.danger : sum === 100 ? c.success : color}
        />
      ) : null}

      {rows.map((r) => (
        <Card key={r.key}>
          <View style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <Text variant="label" tone="danger" onPress={() => onRemove(r.key)}>
                Удалить
              </Text>
            </View>
            <Input value={r.title} onChangeText={(t) => onUpdate(r.key, { title: t })} placeholder="Название цели" />
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Цель"
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
            height: 44,
            borderRadius: radius.md,
            borderWidth: 1.5,
            borderColor: c.border,
            borderStyle: 'dashed',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text variant="label" style={{ color }}>
            Добавить цель
          </Text>
        </Pressable>
        {rows.length > 1 ? (
          <Pressable
            onPress={onDistribute}
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
    </View>
  );
}

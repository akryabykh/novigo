import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Goal, Timeframe } from '../../../core/domain';
import { validateWeights } from '../../../core/logic';
import { useAuth } from '../../../features/auth/auth-provider';
import { goalsByTimeframe } from '../../../features/goals/select';
import {
  useDeleteSession,
  useSaveGoals,
  useWorkspace,
  type GoalUpdate,
} from '../../../features/queries';
import type { NewGoal } from '../../../core/data';
import { Button, Card, Input, ProgressBar, Text } from '../../../ui/components';
import { radius, spacing, timeframeColor, timeframeLabel } from '../../../ui/theme';
import { useColors } from '../../../ui/theme-provider';

interface Row {
  key: string;
  id?: string;
  title: string;
  target: string;
  weight: string;
}
type Rows = Record<Timeframe, Row[]>;
const ORDER: Timeframe[] = ['day', 'week', 'month'];

let counter = 0;
const blankRow = (): Row => ({ key: `n${counter++}`, title: '', target: '', weight: '' });
const fromGoal = (g: Goal): Row => ({
  key: g.id,
  id: g.id,
  title: g.title,
  target: String(g.target),
  weight: String(g.weight),
});

export default function EditSessionScreen() {
  const c = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const { data: ws, isLoading } = useWorkspace(user?.id);
  const saveGoals = useSaveGoals(user?.id);
  const deleteSession = useDeleteSession(user?.id);

  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Rows>({ day: [], week: [], month: [] });
  const [confirmEdit, setConfirmEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const beginEdit = () => {
    if (!ws) return;
    setRows({
      day: goalsByTimeframe(ws, 'day').map(fromGoal),
      week: goalsByTimeframe(ws, 'week').map(fromGoal),
      month: goalsByTimeframe(ws, 'month').map(fromGoal),
    });
    setEditing(true);
    setConfirmEdit(false);
  };

  const update = (tf: Timeframe, key: string, patch: Partial<Row>) =>
    setRows((r) => ({ ...r, [tf]: r[tf].map((x) => (x.key === key ? { ...x, ...patch } : x)) }));
  const add = (tf: Timeframe) => setRows((r) => ({ ...r, [tf]: [...r[tf], blankRow()] }));
  const remove = (tf: Timeframe, key: string) =>
    setRows((r) => ({ ...r, [tf]: r[tf].filter((x) => x.key !== key) }));

  const save = () => {
    if (!ws?.session) return;
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
          return setError(`«${timeframeLabel[tf]}»: цель (> 0) для «${p.title}»`);
      }
      if (!validateWeights(parsed).ok)
        return setError(`«${timeframeLabel[tf]}»: веса должны давать 100%`);

      for (const p of parsed) {
        if (p.row.id) updates.push({ id: p.row.id, title: p.title, target: p.target, weight: p.weight });
        else creates.push({ title: p.title, timeframe: tf, target: p.target, weight: p.weight });
      }
    }

    const keptIds = new Set(ORDER.flatMap((tf) => rows[tf].map((r) => r.id).filter(Boolean) as string[]));
    const deletes = ws.goals.map((g) => g.id).filter((id) => !keptIds.has(id));

    if (updates.length + creates.length === 0) return setError('Должна остаться хотя бы одна цель');

    saveGoals.mutate(
      { sessionId: ws.session.id, updates, creates, deletes },
      { onSuccess: () => router.replace('/(app)'), onError: (e: any) => setError(e?.message ?? 'Ошибка') },
    );
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
        <Text variant="heading">Сессия целей</Text>
        <Text variant="label" tone="muted" onPress={() => router.back()}>
          Закрыть
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ alignItems: 'center', paddingBottom: spacing['3xl'] }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={{ width: '100%', maxWidth: 560, paddingHorizontal: spacing.xl, gap: spacing.lg }}>
          {isLoading || !ws?.session ? (
            <Text variant="body" tone="muted">
              Загрузка…
            </Text>
          ) : !editing ? (
            // ---- locked, read-only view ----
            <>
              {ORDER.map((tf) => {
                const gs = goalsByTimeframe(ws, tf);
                if (gs.length === 0) return null;
                return (
                  <View key={tf} style={{ gap: spacing.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: timeframeColor[tf] }} />
                      <Text variant="heading">{timeframeLabel[tf]}</Text>
                    </View>
                    {gs.map((g) => (
                      <Card key={g.id}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>
                            {g.title}
                          </Text>
                          <Text variant="caption" tone="faint">
                            цель {g.target} · вес {Math.round(g.weight)}%
                          </Text>
                        </View>
                      </Card>
                    ))}
                  </View>
                );
              })}

              {/* edit gate */}
              {!confirmEdit ? (
                <Button title="Редактировать цели" variant="secondary" onPress={() => setConfirmEdit(true)} />
              ) : (
                <Card>
                  <View style={{ gap: spacing.md }}>
                    <Text variant="body">Изменить цели текущей сессии? Прогресс по изменённым целям может пересчитаться.</Text>
                    <View style={{ flexDirection: 'row', gap: spacing.md }}>
                      <View style={{ flex: 1 }}>
                        <Button title="Отмена" variant="secondary" onPress={() => setConfirmEdit(false)} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button title="Редактировать" onPress={beginEdit} />
                      </View>
                    </View>
                  </View>
                </Card>
              )}

              {/* delete gate */}
              {!confirmDelete ? (
                <Button title="Удалить сессию" variant="ghost" onPress={() => setConfirmDelete(true)} />
              ) : (
                <Card>
                  <View style={{ gap: spacing.md }}>
                    <Text variant="body" tone="danger">
                      Удалить всю сессию вместе с целями и историей отметок? Это нельзя отменить.
                    </Text>
                    <View style={{ flexDirection: 'row', gap: spacing.md }}>
                      <View style={{ flex: 1 }}>
                        <Button title="Отмена" variant="secondary" onPress={() => setConfirmDelete(false)} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button
                          title="Удалить"
                          variant="danger"
                          loading={deleteSession.isPending}
                          onPress={() =>
                            deleteSession.mutate(ws.session!.id, { onSuccess: () => router.replace('/(app)') })
                          }
                        />
                      </View>
                    </View>
                  </View>
                </Card>
              )}
            </>
          ) : (
            // ---- editing view ----
            <>
              {ORDER.map((tf) => (
                <EditSection
                  key={tf}
                  tf={tf}
                  rows={rows[tf]}
                  onUpdate={(key, patch) => update(tf, key, patch)}
                  onAdd={() => add(tf)}
                  onRemove={(key) => remove(tf, key)}
                />
              ))}
              {error ? (
                <Text variant="caption" tone="danger">
                  {error}
                </Text>
              ) : null}
              <Button title="Сохранить изменения" onPress={save} loading={saveGoals.isPending} />
              <Text variant="label" tone="muted" style={{ textAlign: 'center' }} onPress={() => setEditing(false)}>
                Отмена
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function EditSection({
  tf,
  rows,
  onUpdate,
  onAdd,
  onRemove,
}: {
  tf: Timeframe;
  rows: Row[];
  onUpdate: (key: string, patch: Partial<Row>) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
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
        ) : null}
      </View>
      {rows.length > 0 ? (
        <ProgressBar progress={Math.min(1, sum / 100)} color={remaining < 0 ? c.danger : sum === 100 ? c.success : color} />
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

      <Pressable
        onPress={onAdd}
        style={{
          height: 44,
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
    </View>
  );
}

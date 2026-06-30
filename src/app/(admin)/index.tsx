// Admin / preview mode (login admin / 1111). A FULL local app (data in
// AsyncStorage, no Supabase): you set your own goals and log progress, and the
// only extra power is a bottom day-scrubber to jump to any day of the session.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { NewGoal } from '../../core/data';
import type { DailyLog, Goal, GoalSession, Timeframe } from '../../core/domain';
import { SESSION_DAYS, addDays, computeRings, currentWeekIndex, todayISO, validateWeights } from '../../core/logic';
import { useAuth } from '../../features/auth/auth-provider';
import { GoalRow } from '../../features/goals/GoalRow';
import { Button, Card, Input, ProgressBar, ProgressRing, Text } from '../../ui/components';
import { radius, spacing, timeframeColor, timeframeLabel } from '../../ui/theme';
import { useColors } from '../../ui/theme-provider';

const KEY = 'novigo.admin.state';
const ORDER: Timeframe[] = ['day', 'week', 'month'];
const JUMPS = [1, 7, 14, 21, 28];

interface AdminState {
  startDate: string | null;
  goals: Goal[];
  logs: DailyLog[];
}
const EMPTY: AdminState = { startDate: null, goals: [], logs: [] };

let idc = 0;
const newId = () => `admin_${idc++}`;

export default function AdminScreen() {
  const c = useColors();
  const { exitAdmin } = useAuth();
  const [state, setState] = useState<AdminState>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [simDay, setSimDay] = useState(1);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((s) => {
      if (s) {
        try {
          setState(JSON.parse(s));
        } catch {}
      }
      setLoaded(true);
    });
  }, []);

  const persist = (next: AdminState) => {
    setState(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  };

  const session: GoalSession | null = state.startDate
    ? { id: 'admin', userId: 'admin', startDate: state.startDate }
    : null;
  const simToday = session ? addDays(session.startDate, simDay - 1) : todayISO();

  const createGoals = (drafts: NewGoal[]) => {
    const goals: Goal[] = drafts.map((d) => ({ ...d, id: newId(), sessionId: 'admin' }));
    persist({ startDate: todayISO(), goals, logs: [] });
    setSimDay(1);
  };

  const saveLog = (goalId: string, value: number) => {
    const logs = state.logs.filter((l) => !(l.goalId === goalId && l.date === simToday));
    logs.push({ goalId, date: simToday, value });
    persist({ ...state, logs });
  };

  const reset = () => {
    persist(EMPTY);
    setSimDay(1);
  };

  if (!loaded) return <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} />;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing.md,
        }}>
        <View>
          <Text variant="caption" tone="faint">
            Режим админа
          </Text>
          <Text variant="title">Мои цели</Text>
        </View>
        <Pressable
          onPress={exitAdmin}
          hitSlop={12}
          style={({ pressed }) => ({
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
            borderRadius: radius.md,
            backgroundColor: c.surfaceAlt,
            opacity: pressed ? 0.7 : 1,
          })}>
          <Text variant="label" tone="accent">
            Выйти
          </Text>
        </Pressable>
      </View>

      {!session ? (
        <CreateForm onCreate={createGoals} />
      ) : (
        <Main
          session={session}
          goals={state.goals}
          logs={state.logs}
          simToday={simToday}
          simDay={simDay}
          onDay={(d) => setSimDay(Math.max(1, Math.min(SESSION_DAYS, d)))}
          onSave={saveLog}
          onReset={reset}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------- MAIN (rings + goals + scrubber) ----------------
function Main({
  session,
  goals,
  logs,
  simToday,
  simDay,
  onDay,
  onSave,
  onReset,
}: {
  session: GoalSession;
  goals: Goal[];
  logs: DailyLog[];
  simToday: string;
  simDay: number;
  onDay: (d: number) => void;
  onSave: (goalId: string, value: number) => void;
  onReset: () => void;
}) {
  const c = useColors();
  const [selected, setSelected] = useState<Timeframe>('day');

  const rings = useMemo(() => computeRings(session, goals, logs, simToday), [session, goals, logs, simToday]);
  const weekNum = currentWeekIndex(session.startDate, simToday) + 1;
  const ringLabels: Record<Timeframe, string> = {
    day: `День ${simDay}`,
    week: `Неделя ${weekNum}`,
    month: 'Месяц',
  };
  const shown = goals.filter((g) => g.timeframe === selected);

  return (
    <>
      <ScrollView
        contentContainerStyle={{ alignItems: 'center', paddingBottom: spacing['2xl'] }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={{ width: '100%', maxWidth: 560, paddingHorizontal: spacing.xl, gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {ORDER.map((tf) => {
              const active = tf === selected;
              return (
                <Pressable
                  key={tf}
                  onPress={() => setSelected(tf)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    gap: spacing.sm,
                    paddingVertical: spacing.md,
                    borderRadius: radius.lg,
                    borderWidth: 1.5,
                    borderColor: active ? timeframeColor[tf] : c.border,
                    backgroundColor: active ? c.surface : 'transparent',
                  }}>
                  <ProgressRing progress={rings[tf]} size={84} stroke={8} color={timeframeColor[tf]} />
                  <Text variant="label" style={{ color: active ? timeframeColor[tf] : c.textMuted }}>
                    {ringLabels[tf]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: timeframeColor[selected] }} />
            <Text variant="heading" style={{ flex: 1 }}>
              Цели · {timeframeLabel[selected].toLowerCase()}
            </Text>
            <Text variant="label" tone="danger" onPress={onReset}>
              Сбросить
            </Text>
          </View>

          {shown.length === 0 ? (
            <Text variant="body" tone="muted">
              На этот горизонт целей нет.
            </Text>
          ) : (
            <View style={{ gap: spacing.md }}>
              {shown.map((g) => (
                <GoalRow key={g.id} session={session} goal={g} logs={logs} today={simToday} onSave={onSave} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={{ borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface, padding: spacing.lg, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <ScrubBtn label="−" onPress={() => onDay(simDay - 1)} />
          <View style={{ alignItems: 'center' }}>
            <Text variant="heading">День {simDay}</Text>
            <Text variant="caption" tone="faint">
              из {SESSION_DAYS}
            </Text>
          </View>
          <ScrubBtn label="+" onPress={() => onDay(simDay + 1)} />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' }}>
          {JUMPS.map((d) => {
            const active = d === simDay;
            return (
              <Pressable
                key={d}
                onPress={() => onDay(d)}
                hitSlop={6}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  borderRadius: radius.full,
                  backgroundColor: active ? c.accent : c.surfaceAlt,
                }}>
                <Text variant="label" style={{ color: active ? c.onAccent : c.textMuted }}>
                  {d}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </>
  );
}

function ScrubBtn({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 54,
        height: 54,
        borderRadius: radius.md,
        backgroundColor: c.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
      })}>
      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 26, color: c.text }}>{label}</Text>
    </Pressable>
  );
}

// ---------------- CREATE FORM ----------------
interface Row {
  key: string;
  title: string;
  target: string;
  weight: string;
}
type Rows = Record<Timeframe, Row[]>;
let rc = 0;
const blankRow = (): Row => ({ key: `r${rc++}`, title: '', target: '', weight: '' });

function CreateForm({ onCreate }: { onCreate: (goals: NewGoal[]) => void }) {
  const [rows, setRows] = useState<Rows>({ day: [blankRow()], week: [], month: [] });
  const [error, setError] = useState<string | null>(null);

  const update = (tf: Timeframe, key: string, patch: Partial<Row>) =>
    setRows((r) => ({ ...r, [tf]: r[tf].map((x) => (x.key === key ? { ...x, ...patch } : x)) }));
  const add = (tf: Timeframe) => setRows((r) => ({ ...r, [tf]: [...r[tf], blankRow()] }));
  const remove = (tf: Timeframe, key: string) =>
    setRows((r) => ({ ...r, [tf]: r[tf].filter((x) => x.key !== key) }));

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
        if (!g.title) return setError(`«${timeframeLabel[tf]}»: нужно название`);
        if (!Number.isFinite(g.target) || g.target <= 0)
          return setError(`«${timeframeLabel[tf]}»: цель (> 0) для «${g.title}»`);
      }
      if (!validateWeights(parsed).ok) return setError(`«${timeframeLabel[tf]}»: веса должны давать 100%`);
      goals.push(...parsed);
    }
    if (goals.length === 0) return setError('Добавь хотя бы одну цель');
    onCreate(goals);
  };

  return (
    <ScrollView
      contentContainerStyle={{ alignItems: 'center', paddingBottom: spacing['3xl'] }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <View style={{ width: '100%', maxWidth: 560, paddingHorizontal: spacing.xl, gap: spacing.xl }}>
        <Text variant="body" tone="muted">
          Внеси свои цели на день/неделю/месяц — как обычный пользователь. Дальше внизу появится
          переключатель дней.
        </Text>
        {ORDER.map((tf) => (
          <Section
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
        <Button title="Поставить цели" onPress={submit} />
      </View>
    </ScrollView>
  );
}

function Section({
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
          <Text variant="caption" style={{ color: remaining === 0 ? c.success : remaining < 0 ? c.danger : c.textMuted }}>
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
          Добавить цель
        </Text>
      </Pressable>
    </View>
  );
}

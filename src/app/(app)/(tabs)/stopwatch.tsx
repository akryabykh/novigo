import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';

import { goalsForScope, TIMEFRAMES, type Goal } from '../../../core/logic';
import { todayISO } from '../../../core/logic';
import { useAuth } from '../../../features/auth/auth-provider';
import { useWorkspace } from '../../../features/queries';
import { changeStopwatch, elapsedMs, finishSession, formatDuration, pauseSession, readStopwatch, startSession,
  type StopwatchRecord } from '../../../features/stopwatch/stopwatch-store';
import { notifyStopwatch, subscribeStopwatch, syncStopwatch } from '../../../features/stopwatch/stopwatch-sync';
import { Button, Card, Input, Screen, Text } from '../../../ui/components';
import { confirmAction } from '../../../ui/confirm';
import { radius, spacing, timeframeLabel, typography } from '../../../ui/theme';
import { useColors } from '../../../ui/theme-provider';

const EMPTY: StopwatchRecord = { version: 1, active: null, sessions: [], pending: [] };
const dateLabel = (iso: string) => new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
}).format(new Date(iso));

export default function StopwatchScreen() {
  const { user } = useAuth();
  const uid = user?.id;
  return <StopwatchContent key={uid ?? 'guest'} uid={uid} />;
}

function StopwatchContent({ uid }: { uid: string | undefined }) {
  const c = useColors();
  const { data: workspace } = useWorkspace(uid);
  const [record, setRecord] = useState<StopwatchRecord>(EMPTY);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);

  const availableTasks = useMemo(() => {
    if (!workspace) return [];
    const tasks = workspace.goals.filter((goal) => goal.kind === 'task');
    const today = todayISO();
    return TIMEFRAMES.flatMap((period) => goalsForScope(tasks, period, today));
  }, [workspace]);
  const selectedTask = availableTasks.find((item) => item.id === selectedId);
  const workTitle = selectedTask?.title ?? customTitle.trim();
  const current = record.active;
  const duration = current ? elapsedMs(current, now) : 0;
  const totalForTask = record.sessions.filter((item) =>
    current?.taskId ? item.taskId === current.taskId : selectedTask
      ? item.taskId === selectedTask.id : item.taskTitle === (current?.taskTitle ?? workTitle) && item.taskId === null)
    .reduce((sum, item) => sum + item.durationMs, 0);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    const refresh = () => {
      void readStopwatch(uid).then((value) => {
        if (alive) { setRecord(value); setReady(true); }
      }).catch(() => { if (alive) setError('Не удалось открыть секундомер.'); });
    };
    const sync = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      void syncStopwatch(uid).then(() => { if (alive) setError(null); })
        .catch(() => { if (alive) setError('Не удалось синхронизировать историю. Повтори позже.'); });
    };
    const unsubscribe = subscribeStopwatch(uid, refresh);
    refresh(); sync();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', sync);
      const timer = window.setInterval(sync, 30_000);
      return () => { alive = false; unsubscribe(); window.removeEventListener('online', sync); window.clearInterval(timer); };
    }
    return () => { alive = false; unsubscribe(); };
  }, [uid]);

  useEffect(() => {
    if (!current?.runningSince) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [current?.runningSince]);

  const change = async (update: (before: StopwatchRecord) => StopwatchRecord, send = false) => {
    if (!uid || !ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await changeStopwatch(uid, update);
      setRecord(next);
      setNow(Date.now());
      notifyStopwatch(uid);
      if (send) void syncStopwatch(uid).catch(() => setError('Время сохранено на устройстве. Синхронизация повторится позже.'));
    } catch { setError('Не удалось сохранить время на устройстве. Повтори действие.'); }
    finally { setBusy(false); }
  };

  const start = () => {
    if (!workTitle) return;
    void change((before) => before.active ? before : { ...before, active: startSession(selectedTask?.id ?? null, workTitle) });
  };
  const pause = () => void change((before) => before.active
    ? { ...before, active: pauseSession(before.active) } : before);
  const resume = () => void change((before) => before.active && !before.active.runningSince
    ? { ...before, active: { ...before.active, runningSince: new Date().toISOString() } } : before);
  const finish = () => void change((before) => {
    if (!before.active) return before;
    const saved = finishSession(before.active);
    return { ...before, active: null, sessions: [saved, ...before.sessions], pending: [...before.pending, saved] };
  }, true);
  const discard = async () => {
    if (!(await confirmAction('Удалить текущий отсчёт без сохранения времени?',
      { title: 'Сбросить секундомер?', confirmLabel: 'Удалить отсчёт' }))) return;
    void change((before) => ({ ...before, active: null }));
  };

  return <Screen edges={['top']}>
    <View style={{ paddingTop: spacing.md, gap: spacing.xs }}>
      <Button title="‹ Приложения" size="md" variant="ghost" fullWidth={false}
        onPress={() => router.navigate('/(app)/(tabs)/apps')} />
      <Text variant="title">Секундомер</Text>
      <Text variant="caption" tone="muted">Время сохраняется при закрытии приложения. Завершённые сессии синхронизируются между устройствами.</Text>
    </View>

    <Card style={{ gap: spacing.lg }}>
      <Text variant="heading">{current?.taskTitle ?? (workTitle || 'Выбери задачу')}</Text>
      <View style={{ minHeight: 150, borderRadius: radius.xl, backgroundColor: c.surfaceAlt,
        borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
        <Text accessibilityLabel={`Время: ${formatDuration(duration)}`}
          style={{ color: c.text, fontFamily: typography.bold, fontSize: 48, fontVariant: ['tabular-nums'] }}>
          {formatDuration(duration)}
        </Text>
      </View>
      {current || workTitle ? <Text variant="caption" tone="muted">
        Всего по задаче: {formatDuration(totalForTask + duration)}
      </Text> : null}
      {current ? <>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button title={current.runningSince ? 'Пауза' : 'Продолжить'} size="lg" fullWidth={false}
            disabled={busy} style={{ flex: 1 }} onPress={current.runningSince ? pause : resume} />
          <Button title="Завершить" size="lg" variant="secondary" fullWidth={false}
            disabled={busy} style={{ flex: 1 }} onPress={finish} />
        </View>
        <Button title="Сбросить без сохранения" size="md" variant="ghost" disabled={busy} onPress={() => void discard()} />
      </> : <Button title="Начать работу" disabled={!ready || busy || !workTitle} onPress={start} />}
    </Card>

    {!current ? <Card style={{ gap: spacing.md }}>
      <Text variant="heading">Над чем работаешь?</Text>
      <Input label="Или своё название" value={customTitle} onChangeText={(value) => { setCustomTitle(value); setSelectedId(null); }}
        maxLength={120} placeholder="Например, подготовка презентации" />
      {availableTasks.length ? <>
        <Text variant="label" tone="muted">Текущие задачи Novigo</Text>
        {availableTasks.map((task: Goal) => <Pressable key={task.id}
          accessibilityRole="button" accessibilityState={{ selected: selectedId === task.id }}
          onPress={() => { setSelectedId(task.id); setCustomTitle(''); }}
          style={{ padding: spacing.md, borderWidth: 1, borderColor: selectedId === task.id ? c.accent : c.border,
            borderRadius: radius.md, backgroundColor: selectedId === task.id ? c.accentSoft : c.surface }}>
          <Text variant="label">{task.title}</Text>
          <Text variant="caption" tone="muted">{timeframeLabel[task.timeframe]}</Text>
        </Pressable>)}
      </> : null}
    </Card> : null}

    {record.pending.length ? <Text variant="caption" tone="muted">Ожидают синхронизации: {record.pending.length}</Text> : null}
    {error ? <View style={{ gap: spacing.sm }}>
      <Text variant="caption" tone="danger">{error}</Text>
      <Button title="Повторить синхронизацию" size="md" variant="secondary"
        onPress={() => { if (uid) void syncStopwatch(uid).then(() => setError(null)).catch(() => setError('Не удалось синхронизировать историю. Повтори позже.')); }} />
    </View> : null}

    <Card style={{ gap: spacing.md }}>
      <Button title={`История (${record.sessions.length}) ${historyVisible ? '▴' : '▾'}`} size="md" variant="ghost"
        onPress={() => setHistoryVisible((value) => !value)} />
      <Text variant="caption" tone="muted">Общее время: {formatDuration(record.sessions.reduce((sum, item) => sum + item.durationMs, 0))}</Text>
      {historyVisible ? record.sessions.length ? record.sessions.map((item) =>
        <View key={item.id} style={{ gap: spacing.xs, paddingVertical: spacing.sm,
          borderBottomWidth: 1, borderBottomColor: c.border }}>
          <Text variant="label">{item.taskTitle}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="caption" tone="muted">{dateLabel(item.endedAt)}</Text>
            <Text variant="heading">{formatDuration(item.durationMs)}</Text>
          </View>
        </View>) : <Text variant="caption" tone="muted">Пока нет завершённых сессий.</Text> : null}
    </Card>
  </Screen>;
}

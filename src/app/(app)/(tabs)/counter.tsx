import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '../../../features/auth/auth-provider';
import { adjustCounter, applyCounterOperation, EMPTY_COUNTER, formatCounterValue, loadCounterRecord, newCounterOperationId, enqueueCounter, retryCounterWrite, visibleCounter, type CounterOperation, type CounterState } from '../../../features/counter/counter-store';
import { notifyCounter, subscribeCounter, syncCounter } from '../../../features/counter/counter-sync';
import { Button, Card, Screen, Text } from '../../../ui/components';
import { confirmAction } from '../../../ui/confirm';
import { radius, spacing, typography } from '../../../ui/theme';
import { useColors } from '../../../ui/theme-provider';

const formatSavedAt = (date: string) => new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(date));

export default function CounterScreen() {
  const { user } = useAuth();
  const uid = user?.id;
  return <CounterContent key={uid ?? 'guest'} uid={uid} />;
}

function CounterContent({ uid }: { uid: string | undefined }) {
  const c = useColors();
  const [state, setState] = useState<CounterState>(EMPTY_COUNTER);
  const stateRef = useRef<CounterState>(EMPTY_COUNTER);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    const refresh = () => {
      void loadCounterRecord(uid).then((record) => {
        if (!active) return;
        const visible = visibleCounter(record);
        stateRef.current = visible;
        setState(visible);
        setPending(record.pending.length);
        setReady(true);
      }).catch(() => { if (active) setError('Не удалось загрузить счётчик. Открой раздел ещё раз.'); });
    };
    const sync = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      void syncCounter(uid).then(() => { if (active) setError(null); })
        .catch(() => { if (active) setError('Не удалось синхронизировать счётчик. Повтори позже.'); });
    };
    const unsubscribe = subscribeCounter(uid, refresh);
    refresh();
    sync();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', sync);
      const timer = window.setInterval(sync, 30_000);
      return () => { active = false; unsubscribe(); window.removeEventListener('online', sync); window.clearInterval(timer); };
    }
    return () => { active = false; unsubscribe(); };
  }, [uid]);

  const commit = (operation: CounterOperation) => {
    if (!uid || !ready) return;
    const next = applyCounterOperation(stateRef.current, operation);
    stateRef.current = next;
    setState(next);
    setPending((count) => count + 1);
    setError(null);
    void enqueueCounter(uid, operation).then(() => {
      notifyCounter(uid);
      return syncCounter(uid);
    }).catch(() => setError('Не удалось сохранить или синхронизировать счётчик. Повтори позже.'));
  };

  const reset = async () => {
    if (!ready || stateRef.current.value === 0) return;
    if (await confirmAction('Сбросить текущее значение на ноль? Сохранённая история останется.',
      { title: 'Сбросить счётчик?', confirmLabel: 'Сбросить' })) {
      commit({ id: newCounterOperationId(), type: 'reset' });
    }
  };

  const clearHistory = async () => {
    if (!ready || !stateRef.current.snapshots.length) return;
    if (await confirmAction('Удалить всю сохранённую историю счётчика?',
      { title: 'Очистить историю?', confirmLabel: 'Очистить' })) {
      commit({ id: newCounterOperationId(), type: 'clear' });
    }
  };

  const display = formatCounterValue(state.value);
  const fontSize = Math.min(72, Math.max(20, 300 / display.length));

  return (
    <Screen edges={['top']}>
      <View style={{ paddingTop: spacing.md, gap: spacing.xs }}>
        <Text variant="title">Счётчик</Text>
        <Text variant="caption" tone="muted">Работает без сети и синхронизируется между устройствами.</Text>
      </View>

      <Card style={{ gap: spacing.xl }}>
        <View style={{ minHeight: 160, alignSelf: 'stretch', borderRadius: radius.xl,
          backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border,
          alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm }}>
          <Text variant="caption" tone="accent">ТЕКУЩЕЕ ЗНАЧЕНИЕ</Text>
          <Text accessibilityLabel={`Счётчик: ${state.value}`} numberOfLines={1}
            style={{ color: c.text, fontFamily: typography.bold, fontSize, lineHeight: fontSize * 1.15,
              letterSpacing: 3, fontVariant: ['tabular-nums'] }}>
            {display}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Button title="+1" size="lg" fullWidth={false} disabled={!ready || state.value === Number.MAX_SAFE_INTEGER}
            style={{ flex: 1, height: 76 }} onPress={() => { if (adjustCounter(stateRef.current, 1) !== stateRef.current) commit({ id: newCounterOperationId(), type: 'delta', delta: 1 }); }} />
          <Button title="−1" size="lg" variant="secondary" fullWidth={false} disabled={!ready || state.value === 0}
            style={{ flex: 1, height: 76 }} onPress={() => { if (adjustCounter(stateRef.current, -1) !== stateRef.current) commit({ id: newCounterOperationId(), type: 'delta', delta: -1 }); }} />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Button title="Сохранить" size="md" variant="secondary" fullWidth={false} disabled={!ready}
            style={{ flex: 1 }} onPress={() => commit({ id: newCounterOperationId(), type: 'snapshot', value: stateRef.current.value, savedAt: new Date().toISOString() })} />
          <Button title="Сбросить" size="md" variant="ghost" fullWidth={false} disabled={!ready || state.value === 0}
            style={{ flex: 1 }} onPress={() => void reset()} />
        </View>
      </Card>

      {pending > 0 ? <Text variant="caption" tone="muted">Ожидают синхронизации: {pending}</Text> : null}
      {error ? <View style={{ gap: spacing.sm }}>
        <Text variant="caption" tone="danger">{error}</Text>
        <Button title="Повторить синхронизацию" size="md" variant="secondary"
          onPress={() => { if (uid) void retryCounterWrite(uid).then(() => syncCounter(uid)).then(() => setError(null)).catch(() => setError('Не удалось синхронизировать счётчик. Повтори позже.')); }} />
      </View> : null}

      <Card style={{ gap: spacing.md }}>
        <Button title={`История (${state.snapshots.length}) ${historyVisible ? '▴' : '▾'}`}
          size="md" variant="ghost" disabled={!ready} onPress={() => setHistoryVisible((visible) => !visible)} />
        {historyVisible ? state.snapshots.length ? (
          <View style={{ gap: spacing.md }}>
            {state.snapshots.map((item) => (
              <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.border }}>
                <Text variant="label" tone="muted" style={{ flex: 1 }}>{formatSavedAt(item.savedAt)}</Text>
                <Text variant="heading">{item.value}</Text>
              </View>
            ))}
            <Button title="Очистить историю" size="md" variant="ghost" onPress={() => void clearHistory()} />
          </View>
        ) : <Text variant="caption" tone="muted">Сохранённых результатов пока нет.</Text> : null}
      </Card>
    </Screen>
  );
}

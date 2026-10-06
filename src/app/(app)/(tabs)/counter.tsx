import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '../../../features/auth/auth-provider';
import { adjustCounter, EMPTY_COUNTER, formatCounterValue, loadCounter, persistCounter, type CounterState } from '../../../features/counter/counter-store';
import { Button, Card, Screen, Text } from '../../../ui/components';
import { confirmAction } from '../../../ui/confirm';
import { radius, spacing, typography } from '../../../ui/theme';
import { useColors } from '../../../ui/theme-provider';

let snapshotSequence = 0;
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
  const writeVersion = useRef(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);

  useEffect(() => {
    let active = true;
    if (uid) {
      loadCounter(uid).then((loaded) => {
        if (!active) return;
        stateRef.current = loaded;
        setState(loaded);
        setReady(true);
      }).catch(() => { if (active) setError('Не удалось загрузить счётчик. Открой раздел ещё раз.'); });
    }
    return () => { active = false; };
  }, [uid]);

  const saveOnDevice = (next: CounterState) => {
    if (!uid) return;
    setError(null);
    const version = ++writeVersion.current;
    void persistCounter(uid, next).catch(() => {
      if (version === writeVersion.current) setError('Не удалось сохранить на устройстве. Повтори сохранение.');
    });
  };

  const commit = (next: CounterState) => {
    if (!uid || !ready || next === stateRef.current) return;
    stateRef.current = next;
    setState(next);
    saveOnDevice(next);
  };

  const reset = async () => {
    if (!ready || stateRef.current.value === 0) return;
    if (await confirmAction('Сбросить текущее значение на ноль? Сохранённая история останется.',
      { title: 'Сбросить счётчик?', confirmLabel: 'Сбросить' })) {
      commit({ ...stateRef.current, value: 0 });
    }
  };

  const clearHistory = async () => {
    if (!ready || !stateRef.current.snapshots.length) return;
    if (await confirmAction('Удалить всю сохранённую историю счётчика?',
      { title: 'Очистить историю?', confirmLabel: 'Очистить' })) {
      commit({ ...stateRef.current, snapshots: [] });
    }
  };

  const display = formatCounterValue(state.value);
  const fontSize = Math.min(72, Math.max(20, 300 / display.length));

  return (
    <Screen edges={['top']}>
      <View style={{ paddingTop: spacing.md, gap: spacing.xs }}>
        <Text variant="title">Счётчик</Text>
        <Text variant="caption" tone="muted">Значение сохраняется на этом устройстве и доступно без сети.</Text>
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
            style={{ flex: 1, height: 76 }} onPress={() => commit(adjustCounter(stateRef.current, 1))} />
          <Button title="−1" size="lg" variant="secondary" fullWidth={false} disabled={!ready || state.value === 0}
            style={{ flex: 1, height: 76 }} onPress={() => commit(adjustCounter(stateRef.current, -1))} />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Button title="Сохранить" size="md" variant="secondary" fullWidth={false} disabled={!ready}
            style={{ flex: 1 }} onPress={() => commit({ ...stateRef.current, snapshots: [{
              id: `${Date.now()}-${++snapshotSequence}`, value: stateRef.current.value, savedAt: new Date().toISOString(),
            }, ...stateRef.current.snapshots] })} />
          <Button title="Сбросить" size="md" variant="ghost" fullWidth={false} disabled={!ready || state.value === 0}
            style={{ flex: 1 }} onPress={() => void reset()} />
        </View>
      </Card>

      {error ? <View style={{ gap: spacing.sm }}>
        <Text variant="caption" tone="danger">{error}</Text>
        <Button title="Повторить сохранение" size="md" variant="secondary"
          onPress={() => saveOnDevice(stateRef.current)} />
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

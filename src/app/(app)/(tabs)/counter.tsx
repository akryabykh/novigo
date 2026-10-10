import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { useAuth } from '../../../features/auth/auth-provider';
import {
  adjustCounter, enqueueCounter, formatCounterValue, loadCounterRecord,
  newCounterOperationId, parseCounterRecord, retryCounterWrite, selectCounter, selectedCounter,
  visibleCounters, type CounterOperation, type CounterRecord,
} from '../../../features/counter/counter-store';
import { notifyCounter, subscribeCounter, syncCounter } from '../../../features/counter/counter-sync';
import { Button, Card, Input, Screen, Text } from '../../../ui/components';
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
  const [record, setRecord] = useState<CounterRecord>(() => parseCounterRecord(null));
  const recordRef = useRef(record);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [form, setForm] = useState<'create' | 'rename' | null>(null);
  const [titleDraft, setTitleDraft] = useState('');

  useEffect(() => {
    if (!uid) return;
    let active = true;
    const refresh = () => {
      void loadCounterRecord(uid).then((saved) => {
        if (!active) return;
        recordRef.current = saved;
        setRecord(saved);
        setReady(true);
      }).catch(() => { if (active) setError('Не удалось загрузить счётчики. Открой раздел ещё раз.'); });
    };
    const sync = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      void syncCounter(uid).then(() => { if (active) setError(null); })
        .catch(() => { if (active) setError('Не удалось синхронизировать счётчики. Повтори позже.'); });
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
    const current = recordRef.current;
    const selectedId = operation.type === 'create' ? operation.counterId
      : operation.type === 'delete' && current.selectedId === operation.counterId
        ? visibleCounters(current).counters.find((item) => item.id !== operation.counterId)?.id ?? null
        : current.selectedId;
    const next = { ...current, pending: [...current.pending, operation], selectedId };
    recordRef.current = next;
    setRecord(next);
    setError(null);
    void enqueueCounter(uid, operation).then(() => {
      notifyCounter(uid);
      return syncCounter(uid);
    }).catch(() => setError('Не удалось сохранить или синхронизировать счётчики. Повтори позже.'));
  };

  const choose = (counterId: string) => {
    if (!uid || !ready) return;
    const next = { ...recordRef.current, selectedId: counterId };
    recordRef.current = next;
    setRecord(next);
    setHistoryVisible(false);
    setForm(null);
    void selectCounter(uid, counterId).catch(() => setError('Не удалось запомнить выбранный счётчик.'));
  };

  const saveTitle = () => {
    const title = titleDraft.trim();
    if (!title || !form) return;
    if (form === 'create') {
      const counterId = newCounterOperationId();
      commit({ id: newCounterOperationId(), type: 'create', counterId, title });
      setHistoryVisible(false);
    } else {
      const current = selectedCounter(recordRef.current);
      if (current && title !== current.title) commit({ id: newCounterOperationId(), type: 'rename', counterId: current.id, title });
    }
    setForm(null);
    setTitleDraft('');
  };

  const current = selectedCounter(record);
  const counters = visibleCounters(record).counters;
  const display = formatCounterValue(current?.value ?? 0);
  const fontSize = Math.min(72, Math.max(20, 300 / display.length));
  const reset = async () => {
    if (!current || current.value === 0) return;
    if (await confirmAction(`Сбросить «${current.title}» на ноль? Сохранённая история останется.`,
      { title: 'Сбросить счётчик?', confirmLabel: 'Сбросить' })) {
      commit({ id: newCounterOperationId(), type: 'reset', counterId: current.id });
    }
  };
  const remove = async () => {
    if (!current) return;
    if (await confirmAction(`Удалить «${current.title}» вместе с его историей?`,
      { title: 'Удалить счётчик?', confirmLabel: 'Удалить' })) {
      commit({ id: newCounterOperationId(), type: 'delete', counterId: current.id });
      setHistoryVisible(false);
      setForm(null);
    }
  };
  const clearHistory = async () => {
    if (!current?.snapshots.length) return;
    if (await confirmAction(`Удалить сохранённую историю «${current.title}»?`,
      { title: 'Очистить историю?', confirmLabel: 'Очистить' })) {
      commit({ id: newCounterOperationId(), type: 'clear', counterId: current.id });
    }
  };

  const header = <View style={{ paddingTop: spacing.md, gap: spacing.xs }}>
    <Button title="‹ Приложения" size="md" variant="ghost" fullWidth={false}
      onPress={() => router.navigate('/(app)/(tabs)/apps')} />
    <Text variant="title">Счётчики</Text>
    <Text variant="caption" tone="muted">Работают без сети и синхронизируются между устройствами.</Text>
  </View>;

  if (!ready) return <Screen edges={['top']}>
    {header}
    <Card><Text variant="label" tone={error ? 'danger' : 'muted'}>
      {error ?? 'Загружаем счётчики…'}
    </Text></Card>
  </Screen>;

  return <Screen edges={['top']}>
    {header}

    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="heading">Мои счётчики</Text>
        <Button title="+ Новый" size="md" variant="secondary" fullWidth={false} disabled={!ready}
          onPress={() => { setTitleDraft(''); setForm('create'); }} />
      </View>
      {counters.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }}>
        {counters.map((item) => {
          const selected = item.id === current?.id;
          return <Pressable key={item.id} accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${item.value}`}
            accessibilityState={{ selected }} onPress={() => choose(item.id)}
            style={({ pressed }) => ({ minWidth: 104, maxWidth: 180, paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md, borderRadius: radius.lg, borderWidth: 1.5,
              borderColor: selected ? c.accent : c.border,
              backgroundColor: selected ? c.accentSoft : c.surface, opacity: pressed ? 0.75 : 1 })}>
            <Text variant="label" numberOfLines={1} style={{ color: selected ? c.accent : c.text }}>{item.title}</Text>
            <Text variant="caption" tone="muted">{formatCounterValue(item.value)}</Text>
          </Pressable>;
        })}
      </ScrollView> : null}
    </View>

    {form ? <Card style={{ gap: spacing.md }}>
      <Text variant="heading">{form === 'create' ? 'Новый счётчик' : 'Переименовать счётчик'}</Text>
      <Input label="Название" value={titleDraft} maxLength={60} onChangeText={setTitleDraft}
        placeholder="Например, подходы" autoFocus returnKeyType="done" onSubmitEditing={saveTitle} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button title={form === 'create' ? 'Создать' : 'Сохранить'} size="md" fullWidth={false}
          disabled={!titleDraft.trim()} style={{ flex: 1 }} onPress={saveTitle} />
        <Button title="Отмена" size="md" variant="secondary" fullWidth={false} onPress={() => setForm(null)} />
      </View>
    </Card> : null}

    {current ? <Card style={{ gap: spacing.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Text variant="heading" numberOfLines={2}>{current.title}</Text>
          <Text variant="caption" tone="muted">Текущий счётчик</Text>
        </View>
        <Button title="Изменить" size="md" variant="ghost" fullWidth={false} disabled={!ready}
          onPress={() => { setTitleDraft(current.title); setForm('rename'); }} />
      </View>

      <View style={{ minHeight: 164, borderRadius: radius.xl, backgroundColor: c.accentSoft,
        borderWidth: 1, borderColor: c.accent, alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
        paddingHorizontal: spacing.sm }}>
        <Text variant="caption" tone="accent">ТЕКУЩЕЕ ЗНАЧЕНИЕ</Text>
        <Text accessibilityLabel={`${current.title}: ${current.value}`} numberOfLines={1}
          style={{ color: c.accentStrong, fontFamily: typography.bold, fontSize, lineHeight: fontSize * 1.15,
            letterSpacing: 3, fontVariant: ['tabular-nums'] }}>{display}</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Увеличить счётчик на один"
          disabled={!ready || current.value === Number.MAX_SAFE_INTEGER}
          onPress={() => {
            if (adjustCounter(current, 1) !== current) commit({ id: newCounterOperationId(), type: 'delta', counterId: current.id, delta: 1 });
          }}
          style={({ pressed }) => ({ flex: 1, height: 92, borderRadius: radius.xl,
            alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent,
            opacity: !ready || current.value === Number.MAX_SAFE_INTEGER ? 0.45 : pressed ? 0.82 : 1 })}>
          <Text style={{ color: c.onAccent, fontFamily: typography.bold, fontSize: 30, lineHeight: 36 }}>+1</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Уменьшить счётчик на один"
          disabled={!ready || current.value === 0}
          onPress={() => {
            if (adjustCounter(current, -1) !== current) commit({ id: newCounterOperationId(), type: 'delta', counterId: current.id, delta: -1 });
          }}
          style={({ pressed }) => ({ width: 84, height: 92, borderRadius: radius.xl,
            borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center',
            backgroundColor: c.surfaceAlt, opacity: !ready || current.value === 0 ? 0.45 : pressed ? 0.75 : 1 })}>
          <Text style={{ color: c.textMuted, fontFamily: typography.semibold, fontSize: 20, lineHeight: 26 }}>−1</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Button title="Сохранить" size="md" variant="secondary" fullWidth={false} disabled={!ready}
          style={{ flex: 1 }} onPress={() => commit({ id: newCounterOperationId(), type: 'snapshot',
            counterId: current.id, value: selectedCounter(recordRef.current)?.value ?? current.value,
            savedAt: new Date().toISOString() })} />
        <Button title="Сбросить" size="md" variant="ghost" fullWidth={false} disabled={!ready || current.value === 0}
          style={{ flex: 1 }} onPress={() => void reset()} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Удалить счётчик ${current.title}`}
        disabled={!ready} onPress={() => void remove()}
        style={{ alignSelf: 'center', padding: spacing.sm }}>
        <Text variant="caption" style={{ color: c.danger }}>Удалить счётчик</Text>
      </Pressable>
    </Card> : <Card style={{ gap: spacing.md, alignItems: 'center' }}>
      <Text variant="heading">Счётчиков пока нет</Text>
      <Text variant="caption" tone="muted">Создай счётчик и дай ему название.</Text>
      <Button title="Создать счётчик" size="md" disabled={!ready}
        onPress={() => { setTitleDraft(''); setForm('create'); }} />
    </Card>}

    {record.pending.length ? <Text variant="caption" tone="muted">Ожидают синхронизации: {record.pending.length}</Text> : null}
    {error ? <View style={{ gap: spacing.sm }}>
      <Text variant="caption" tone="danger">{error}</Text>
      <Button title="Повторить синхронизацию" size="md" variant="secondary"
        onPress={() => { if (uid) void retryCounterWrite(uid).then(() => syncCounter(uid))
          .then(() => setError(null)).catch(() => setError('Не удалось синхронизировать счётчики. Повтори позже.')); }} />
    </View> : null}

    {current ? <Card style={{ gap: spacing.md }}>
      <Button title={`История (${current.snapshots.length}) ${historyVisible ? '▴' : '▾'}`}
        size="md" variant="ghost" disabled={!ready} onPress={() => setHistoryVisible((visible) => !visible)} />
      {historyVisible ? current.snapshots.length ? <View style={{ gap: spacing.md }}>
        {current.snapshots.map((item) => <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center',
          justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.sm,
          borderBottomWidth: 1, borderBottomColor: c.border }}>
          <Text variant="label" tone="muted" style={{ flex: 1 }}>{formatSavedAt(item.savedAt)}</Text>
          <Text variant="heading">{item.value}</Text>
        </View>)}
        <Button title="Очистить историю" size="md" variant="ghost" onPress={() => void clearHistory()} />
      </View> : <Text variant="caption" tone="muted">Сохранённых результатов пока нет.</Text> : null}
    </Card> : null}
  </Screen>;
}

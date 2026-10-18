import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppState, Platform, Pressable, ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { periodRange } from '../../core/logic';
import { qk } from '../../core/query';
import { Button, Card, CheckIcon, EmptyState, Input, PlusIcon, Skeleton, Text, TrashIcon } from '../../ui/components';
import { confirmAction } from '../../ui/confirm';
import { radius, spacing, timeframeColor, timeframeLabel, typography } from '../../ui/theme';
import { useColors } from '../../ui/theme-provider';
import { useAuth } from '../auth/auth-provider';
import { CalendarScaffold } from '../calendar/CalendarScaffold';
import { useCalendar } from '../calendar/useCalendar';
import { createFamily, joinFamily, leaveFamily, type FamilyTask } from './family-data';
import { familyOpenCounts, familyRings, familyTasksForPeriod } from './family-logic';
import { clearFamilyCache, discardFirstFamilyOperation, loadFamilyView, queueFamilyOperation } from './family-sync';

export function FamilyTasksScreen() {
  const c = useColors();
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();
  const cal = useCalendar();
  const { today, refDate, scope } = cal;
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  const familyQuery = useQuery({
    queryKey: qk.family(uid ?? 'anon'),
    queryFn: () => loadFamilyView(uid!),
    enabled: !!uid,
    networkMode: 'always',
    refetchInterval: 15_000,
  });
  const family = familyQuery.data?.family;
  const tasks = useMemo(() => familyQuery.data?.tasks ?? [], [familyQuery.data]);
  const selected = familyTasksForPeriod(tasks, scope, refDate);
  const ordered = [...selected].sort((a, b) => Number(a.done) - Number(b.done));
  const rings = useMemo(() => familyRings(tasks, refDate), [tasks, refDate]);
  const counts = useMemo(() => familyOpenCounts(tasks, refDate), [tasks, refDate]);
  const emptyRings = useMemo(() => ({
    day: familyTasksForPeriod(tasks, 'day', refDate).length === 0,
    week: familyTasksForPeriod(tasks, 'week', refDate).length === 0,
    month: familyTasksForPeriod(tasks, 'month', refDate).length === 0,
  }), [tasks, refDate]);
  const daysWithProgress = useMemo(() => new Set(tasks.filter((task) => task.timeframe === 'day' && task.done)
    .map((task) => task.periodStart)), [tasks]);
  const editable = periodRange(scope, refDate).end >= today;
  const canToggle = periodRange(scope, refDate).start <= today && editable;

  const membership = useMutation({
    mutationFn: async (action: 'create' | 'join' | 'leave') => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Для этого действия нужен интернет');
      if (action === 'create') await createFamily(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
      if (action === 'join') await joinFamily(code);
      if (action === 'leave') await leaveFamily();
      await clearFamilyCache(uid!);
    },
    onSuccess: () => { setCode(''); setLocalError(null); void qc.invalidateQueries({ queryKey: qk.family(uid!) }); },
  });
  const taskMutation = useMutation({
    networkMode: 'always',
    mutationFn: (input: Parameters<typeof queueFamilyOperation>[1]) => queueFamilyOperation(uid!, input, qc),
    onSuccess: () => setLocalError(null),
  });

  useEffect(() => {
    if (!uid) return;
    const refresh = () => { if (typeof navigator === 'undefined' || navigator.onLine !== false)
      void qc.invalidateQueries({ queryKey: qk.family(uid) }); };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const visible = () => { if (document.visibilityState === 'visible') refresh(); };
      window.addEventListener('online', refresh);
      document.addEventListener('visibilitychange', visible);
      return () => { window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', visible); };
    }
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => sub.remove();
  }, [uid, qc]);

  const addTask = () => {
    if (!family) return;
    if (!title.trim()) { setLocalError('Напиши название задачи'); return; }
    taskMutation.mutate({ familyId: family.id, action: 'create', title, timeframe: scope, date: refDate }, {
      onSuccess: () => { setTitle(''); setAdding(false); },
    });
  };
  const cancelAdd = () => { setAdding(false); setTitle(''); setLocalError(null); taskMutation.reset(); };
  const toggle = (task: FamilyTask) => {
    if (!family || !canToggle) return;
    taskMutation.mutate({ familyId: family.id, taskId: task.id, action: 'toggle', done: !task.done });
  };
  const deleteTask = async (task: FamilyTask) => {
    if (!family || !(await confirmAction(`Удалить общую задачу «${task.title}» для вас обоих?`))) return;
    taskMutation.mutate({ familyId: family.id, taskId: task.id, action: 'delete' });
  };
  const leave = async () => {
    if ((familyQuery.data?.pending ?? 0) > 0) { setLocalError('Сначала дождись синхронизации семейных задач'); return; }
    if (!(await confirmAction('Выйти из семьи? Если ты последний участник, общие задачи удалятся.'))) return;
    membership.mutate('leave');
  };
  const discardFailed = async () => {
    if (!uid || !(await confirmAction('Отменить первую несинхронизированную правку семейных задач на этом устройстве?'))) return;
    await discardFirstFamilyOperation(uid, qc);
  };
  const share = () => {
    if (!family) return;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(family.inviteCode)
        .then(() => setShareMessage('Код скопирован'))
        .catch(() => setShareMessage('Выдели и скопируй код вручную'));
      return;
    }
    if (Platform.OS === 'web') { setShareMessage('Выдели и скопируй код вручную'); return; }
    void Share.share({ message: `Код для общего списка задач Novigo: ${family.inviteCode}` }).catch(() => {});
  };

  const setupContent = (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ alignItems: 'center', flexGrow: 1, paddingBottom: spacing['2xl'] }}>
        <View style={{ width: '100%', maxWidth: 560, paddingHorizontal: spacing.xl, gap: spacing.lg }}>
          {familyQuery.isLoading ? <Skeleton height={180} rounded={radius.lg} /> : familyQuery.isError ? (
            <EmptyState emoji="⚠️" title="Не удалось загрузить семью"
              subtitle="Проверь интернет и повтори попытку" ctaTitle="Повторить"
              onCta={() => void familyQuery.refetch()} />
          ) : <>
            <Text variant="heading">Общие задачи</Text>
            <Text tone="muted">Вы оба сможете добавлять, отмечать и удалять задачи. Личные задачи останутся только твоими.</Text>
            <Button title="Создать пространство" onPress={() => membership.mutate('create')} loading={membership.isPending} />
            <Card style={{ gap: spacing.md }}>
              <Text variant="label">Есть код от партнёра?</Text>
              <Input label="Код приглашения" value={code} onChangeText={setCode} autoCapitalize="characters"
                autoCorrect={false} maxLength={16} placeholder="Например, A1B2C3D4E5F6A7B8" />
              <Button title="Присоединиться" variant="secondary" disabled={code.trim().length !== 16}
                loading={membership.isPending} onPress={() => membership.mutate('join')} />
            </Card>
            {membership.isError ? <Text tone="danger">{membership.error.message}</Text> : null}
          </>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
  if (!family) return setupContent;

  return <CalendarScaffold
    cal={cal} navigationDisabled={adding || taskMutation.isPending}
    rings={rings} emptyRings={emptyRings} pendingTaskCounts={counts}
    daysWithProgress={daysWithProgress}
    onSelectScope={(tf) => { cal.setScope(tf); cancelAdd(); }}
    isError={familyQuery.isError && !familyQuery.data}
    refetch={() => void familyQuery.refetch()}
    isRefetching={familyQuery.isRefetching}
    saveError={taskMutation.isError ? taskMutation.error.message : localError}
    onDismissError={() => { taskMutation.reset(); setLocalError(null); }}>
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: timeframeColor[scope] }} />
        <Text variant="heading" style={{ flex: 1 }}>Семья · {timeframeLabel[scope].toLowerCase()}</Text>
        {editable && !adding ? <Pressable accessibilityRole="button" accessibilityLabel="Добавить семейную задачу"
          onPress={() => { taskMutation.reset(); setLocalError(null); setAdding(true); }} hitSlop={6}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4,
            paddingHorizontal: spacing.md, height: 34, borderRadius: radius.md,
            backgroundColor: c.surfaceAlt, opacity: pressed ? 0.7 : 1 })}>
          <PlusIcon size={16} color={c.accent} strokeWidth={2.2} />
          <Text variant="label" tone="accent">Добавить</Text>
        </Pressable> : null}
      </View>
      <Pressable onPress={() => setShowInvite((value) => !value)} hitSlop={8}
        style={{ alignSelf: 'flex-start', paddingVertical: spacing.xs }}>
        <Text variant="caption" tone="accent">{family.memberCount}/2 участника · {showInvite ? 'Скрыть приглашение' : 'Код приглашения'}</Text>
      </Pressable>
      {showInvite ? <Card style={{ gap: spacing.sm }}>
        <Text variant="label">Пригласи партнёра</Text>
        <Text variant="heading" selectable>{family.inviteCode}</Text>
        <Text variant="caption" tone="muted">Код действует, пока вы вместе в этом пространстве.</Text>
        <Button title={Platform.OS === 'web' ? 'Скопировать код' : 'Поделиться кодом'} variant="secondary" size="md" onPress={share} />
        {shareMessage ? <Text variant="caption" tone="muted">{shareMessage}</Text> : null}
        <Button title="Выйти из семьи" variant="ghost" size="md" onPress={() => void leave()} />
        {membership.isError ? <Text variant="caption" tone="danger">{membership.error.message}</Text> : null}
      </Card> : null}
      {familyQuery.data?.pending ? <Text variant="caption" tone="accent">
        На устройстве сохранено изменений: {familyQuery.data.pending}. Отправим при появлении сети.
      </Text> : null}
      {familyQuery.data?.syncError ? <Text variant="caption" tone="danger">
        Не удалось синхронизировать общие задачи. Потяни экран вниз, чтобы повторить.
      </Text> : null}
      {familyQuery.data?.syncError && familyQuery.data.pending > 0 ? (
        <Button title="Отменить неотправленную правку" variant="secondary" size="md"
          onPress={() => void discardFailed()} />
      ) : null}
      {adding ? <View style={{ gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg,
        borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
        <Input autoFocus value={title} onChangeText={(value) => { setTitle(value); setLocalError(null); }}
          placeholder="Новая семейная задача" maxLength={200} returnKeyType="done" onSubmitEditing={addTask} />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button title="Отмена" variant="secondary" size="md" fullWidth={false} style={{ flex: 1 }} onPress={cancelAdd} />
          <Button title="Сохранить" size="md" fullWidth={false} style={{ flex: 1 }}
            loading={taskMutation.isPending} onPress={addTask} />
        </View>
      </View> : null}
      {!editable ? <Text variant="caption" tone="muted">Этот период закрыт. Новую задачу можно добавить в текущий период.</Text> : null}
    </View>
    {ordered.length === 0 ? adding ? null : editable ? <EmptyState emoji="✅" title="Общих задач пока нет"
      subtitle="Добавь первую задачу на выбранный период — её увидите вы оба."
      ctaTitle="Добавить задачу" onCta={() => setAdding(true)} />
      : <Text tone="muted">На этот период общих задач нет.</Text> : (
      <View style={{ gap: spacing.md }}>
        {ordered.map((task) => <Card key={task.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: task.done, disabled: !canToggle }}
              disabled={!canToggle} onPress={() => toggle(task)}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, opacity: !canToggle && !task.done ? 0.6 : 1 }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: task.done ? 0 : 2,
                borderColor: c.border, backgroundColor: task.done ? timeframeColor[scope] : 'transparent',
                alignItems: 'center', justifyContent: 'center' }}>
                {task.done ? <CheckIcon size={16} color={c.onAccent} strokeWidth={3} /> : null}
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text variant="label" numberOfLines={2} style={{ fontFamily: typography.regular,
                  color: task.done ? c.textFaint : c.text, textDecorationLine: task.done ? 'line-through' : 'none' }}>
                  {task.title}
                </Text>
                <Text variant="caption" tone="faint">Добавил{task.createdBy === uid ? ' ты' : ' партнёр'}</Text>
              </View>
            </Pressable>
            <Pressable accessibilityLabel={`Удалить общую задачу ${task.title}`} hitSlop={8}
              onPress={() => void deleteTask(task)} style={{ padding: 4 }}>
              <TrashIcon size={22} color={c.textMuted} strokeWidth={1.7} />
            </Pressable>
          </View>
        </Card>)}
      </View>
    )}
  </CalendarScaffold>;
}

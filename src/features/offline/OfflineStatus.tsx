import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Platform, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { qk } from '../../core/query';
import { finalizeMedalPeriods } from '../../core/data/medals-repo';
import { Button, Text } from '../../ui/components';
import { spacing } from '../../ui/theme';
import { useColors } from '../../ui/theme-provider';
import { confirmAction } from '../../ui/confirm';
import { getOfflineStatus, readOffline, subscribeOffline } from './store';
import { resolveOfflineConflict, synchronize } from './sync';

export function OfflineStatus({ uid }: { uid: string | undefined }) {
  const qc = useQueryClient();
  const c = useColors();
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const [resolving, setResolving] = useState(false);
  const [resolutionError, setResolutionError] = useState(false);
  const syncing = useRef(false);
  const state = useSyncExternalStore(subscribeOffline, () => getOfflineStatus(uid ?? 'anon'), () => getOfflineStatus(uid ?? 'anon'));

  useEffect(() => {
    if (!uid || Platform.OS !== 'web') return;
    const trySync = () => {
      setOnline(navigator.onLine !== false);
      if (navigator.onLine === false || syncing.current) return;
      syncing.current = true;
      void (async () => {
        try {
          await synchronize(uid, qc);
          const saved = await readOffline(uid);
          if (saved.operations.length === 0 && !saved.conflictId && navigator.onLine !== false) {
            const count = await finalizeMedalPeriods(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
            if (count) void qc.invalidateQueries({ queryKey: qk.medals(uid) });
          }
        } catch { /* Medal sync is secondary; task saving has its own status. */ }
        finally { syncing.current = false; }
      })();
    };
    const onReconnect = () => { trySync(); if (navigator.onLine !== false) void qc.invalidateQueries({ queryKey: qk.workspace(uid) }); };
    const onVisibility = () => { if (document.visibilityState === 'visible') onReconnect(); };
    trySync();
    window.addEventListener('online', onReconnect);
    window.addEventListener('offline', trySync);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(trySync, 30_000);
    return () => {
      window.removeEventListener('online', onReconnect);
      window.removeEventListener('offline', trySync);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
    };
  }, [uid, qc]);

  if (!uid || Platform.OS !== 'web' || (online && !state.pending && !state.error)) return null;
  const choose = (choice: 'mine' | 'server') => {
    void (async () => {
      if (choice === 'server' && !(await confirmAction('Отменить конфликтующую правку и связанные с ней изменения на этом устройстве?'))) return;
      setResolving(true);
      try { await resolveOfflineConflict(uid, choice, qc); setResolutionError(false); }
      catch { setResolutionError(true); }
      finally { setResolving(false); }
    })();
  };
  const title = state.conflict
    ? 'Есть разные изменения на двух устройствах'
    : state.error ? state.error
    : !online ? `Без сети · ${state.pending ? `ожидают отправки: ${state.pending}` : 'данные на устройстве'}`
    : `Сохранено на устройстве · ожидают отправки: ${state.pending}`;
  return (
    <View style={{ backgroundColor: c.surfaceAlt, padding: spacing.sm, gap: spacing.sm }}>
      <Text variant="label">{title}</Text>
      {resolutionError ? <Text variant="label">Не удалось получить данные сервера. Попробуй ещё раз.</Text> : null}
      {state.conflict ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button title="Оставить мои" size="md" fullWidth={false} disabled={resolving || !online} onPress={() => choose('mine')} />
          <Button title="Взять с сервера" size="md" variant="secondary" fullWidth={false} disabled={resolving || !online} onPress={() => choose('server')} />
        </View>
      ) : state.error && online ? (
        <Button title="Повторить" size="md" fullWidth={false} onPress={() => {
          void synchronize(uid, qc);
          void qc.invalidateQueries({ queryKey: qk.workspace(uid) });
        }} />
      ) : null}
    </View>
  );
}

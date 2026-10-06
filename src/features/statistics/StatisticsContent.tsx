import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import type { Timeframe } from '../../core/domain';
import { finalizeMedalPeriods, listMedalResults } from '../../core/data/medals-repo';
import { todayISO } from '../../core/logic';
import { qk } from '../../core/query';
import { useAuth } from '../../features/auth/auth-provider';
import { addMonths } from '../../features/calendar/format';
import { readOffline } from '../../features/offline/store';
import { bestStreak, medalTier, monthlyStats, type MedalPeriodResult } from '../../features/statistics/logic';
import { medalAssets } from '../../features/statistics/medal-assets';
import { Button, Card, Text } from '../../ui/components';
import { radius, spacing } from '../../ui/theme';
import { useColors } from '../../ui/theme-provider';

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MEDALS: { timeframe: Timeframe; label: string; roman: string }[] = [
  { timeframe: 'day', label: 'Дни подряд', roman: 'I' },
  { timeframe: 'week', label: 'Недели подряд', roman: 'VII' },
  { timeframe: 'month', label: 'Месяцы подряд', roman: 'XXX' },
];

async function cachedResults(uid: string): Promise<MedalPeriodResult[]> {
  const key = `novigo.medals.${uid}`;
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.onLine === false) {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) as MedalPeriodResult[] : [];
  }
  try {
    const results = await listMedalResults(uid);
    await AsyncStorage.setItem(key, JSON.stringify(results));
    return results;
  } catch (error) {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.onLine === false) {
      const raw = await AsyncStorage.getItem(key);
      if (raw) return JSON.parse(raw) as MedalPeriodResult[];
    }
    throw error;
  }
}

export function StatisticsContent() {
  const c = useColors();
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(() => todayISO().slice(0, 7) + '-01');
  const query = useQuery({
    queryKey: qk.medals(uid ?? 'anon'),
    queryFn: () => cachedResults(uid!),
    networkMode: 'always',
    enabled: !!uid,
  });

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void (async () => {
      if (Platform.OS === 'web') {
        if (navigator.onLine === false || (await readOffline(uid)).operations.length > 0) return;
      }
      const count = await finalizeMedalPeriods(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
      if (count && !cancelled) void qc.invalidateQueries({ queryKey: qk.medals(uid) });
    })().catch(() => { /* Query below exposes server/migration errors. */ });
    return () => { cancelled = true; };
  }, [uid, qc]);

  const results = query.data ?? [];
  const month = monthlyStats(results, selectedMonth);
  const label = `${MONTHS[Number(selectedMonth.slice(5, 7)) - 1]} ${selectedMonth.slice(0, 4)}`;

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ paddingTop: spacing.md, gap: spacing.xs }}>
        <Text variant="title">Статистика</Text>
        <Text variant="caption" tone="muted">Период учитывается после его окончания в местную полночь.</Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityLabel="Предыдущий месяц" onPress={() => setSelectedMonth(addMonths(selectedMonth, -1))}
          style={{ padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceAlt }}>
          <Text variant="heading">‹</Text>
        </Pressable>
        <Text variant="heading" style={{ textTransform: 'capitalize' }}>{label}</Text>
        <Pressable accessibilityLabel="Следующий месяц" onPress={() => setSelectedMonth(addMonths(selectedMonth, 1))}
          style={{ padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceAlt }}>
          <Text variant="heading">›</Text>
        </Pressable>
      </View>

      {query.isError ? (
        <Card>
          <Text variant="label" tone="danger">Не удалось загрузить статистику. Проверь подключение и выполнение SQL-миграции.</Text>
          <Button title="Повторить" onPress={() => void query.refetch()} />
        </Card>
      ) : query.isPending ? <Text variant="label" tone="muted">Загружаем статистику…</Text> : (
        <>
          <Card>
            <View style={{ gap: spacing.md }}>
              <Text variant="heading">Периоды на 100%</Text>
              <Text variant="body">Дни: {month.daysCompleted} из {month.daysTotal}</Text>
              <Text variant="body">Недели: {month.weeksCompleted} из {month.weeksTotal}</Text>
              <Text variant="caption" tone="muted">Неделя относится к месяцу своего воскресенья.</Text>
            </View>
          </Card>

          <Text variant="heading">Медали · личные рекорды</Text>
          <View style={{ gap: spacing.md }}>
            {MEDALS.map(({ timeframe, label: medalLabel, roman }) => {
              const record = bestStreak(results, timeframe);
              const tier = medalTier(record);
              return (
                <Card key={timeframe}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    {tier ? <Image source={medalAssets[timeframe][tier]} style={{ width: 72, height: 72 }} contentFit="contain" /> : (
                      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.surfaceAlt,
                        alignItems: 'center', justifyContent: 'center' }}>
                        <Text variant="heading" tone="faint">{roman}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, gap: spacing.xs }}>
                      <Text variant="heading">{medalLabel}</Text>
                      <Text variant="label" tone={tier ? 'accent' : 'muted'}>
                        {record ? `Рекорд: ${record}` : 'Пока не получена'}
                      </Text>
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

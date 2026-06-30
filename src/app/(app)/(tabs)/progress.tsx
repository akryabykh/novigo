import { useMemo } from 'react';
import { View } from 'react-native';

import { ACHIEVEMENTS } from '../../../core/domain';
import { useAuth } from '../../../features/auth/auth-provider';
import { activeDates } from '../../../features/gamification/engine';
import { Heatmap } from '../../../features/gamification/Heatmap';
import { LevelBar } from '../../../features/gamification/LevelBar';
import { StreakPill } from '../../../features/gamification/StreakPill';
import { useAchievements, useProfile, useWorkspace } from '../../../features/queries';
import { Badge, Card, Screen, Skeleton, Text } from '../../../ui/components';
import { spacing } from '../../../ui/theme';

export default function ProgressScreen() {
  const { user } = useAuth();
  const uid = user?.id;
  const { data: profile } = useProfile(uid);
  const { data: ws, isLoading } = useWorkspace(uid);
  const { data: unlocked } = useAchievements(uid);

  const unlockedSet = useMemo(() => new Set((unlocked ?? []).map((a) => a.code)), [unlocked]);
  const activeDays = useMemo(
    () => (ws?.session ? activeDates({ session: ws.session, goals: ws.goals, logs: ws.logs }).length : 0),
    [ws],
  );

  return (
    <Screen>
      <View style={{ paddingTop: spacing.md }}>
        <Text variant="title">Прогресс</Text>
      </View>

      {isLoading ? (
        <View style={{ gap: spacing.lg }}>
          <Skeleton height={120} />
          <Skeleton height={160} />
        </View>
      ) : (
        <>
          <LevelBar xp={profile?.xp ?? 0} />

          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <StreakPill current={profile?.currentStreak ?? 0} best={profile?.bestStreak ?? 0} />
            <Card style={{ flex: 1 }}>
              <View style={{ gap: spacing.sm }}>
                <Text variant="title">{activeDays}</Text>
                <Text variant="caption" tone="muted">
                  активных дней
                </Text>
                <Text variant="caption" tone="faint">
                  Целей в сессии: {ws?.goals.length ?? 0}
                </Text>
              </View>
            </Card>
          </View>

          <Text variant="heading" style={{ marginTop: spacing.sm }}>
            Активность
          </Text>
          <Card>{ws ? <Heatmap goals={ws.goals} logs={ws.logs} /> : null}</Card>

          <Text variant="heading" style={{ marginTop: spacing.sm }}>
            Достижения
          </Text>
          <Card>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                rowGap: spacing.lg,
              }}>
              {ACHIEVEMENTS.map((a) => (
                <Badge key={a.code} emoji={a.emoji} title={a.title} unlocked={unlockedSet.has(a.code)} />
              ))}
            </View>
          </Card>
        </>
      )}
    </Screen>
  );
}

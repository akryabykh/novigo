import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../../features/auth/auth-provider';
import { LevelBar } from '../../../features/gamification/LevelBar';
import { StreakPill } from '../../../features/gamification/StreakPill';
import { ProgramCard } from '../../../features/programs/ProgramCard';
import { activeSlices, overallProgress } from '../../../features/programs/select';
import { useProfile, useWorkspace } from '../../../features/queries';
import {
  Button,
  Card,
  EmptyState,
  PlusIcon,
  ProgressRing,
  Skeleton,
  Text,
} from '../../../ui/components';
import { radius, spacing } from '../../../ui/theme';
import { useColors } from '../../../ui/theme-provider';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export default function HomeScreen() {
  const c = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const uid = user?.id;
  const { data: profile } = useProfile(uid);
  const { data: ws, isLoading, refetch, isRefetching } = useWorkspace(uid);

  const slices = useMemo(() => (ws ? activeSlices(ws) : []), [ws]);
  const overall = useMemo(() => overallProgress(slices), [slices]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ alignItems: 'center', paddingBottom: spacing['2xl'] }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.accent} />}>
        <View style={{ width: '100%', maxWidth: 560, paddingHorizontal: spacing.xl, gap: spacing.lg }}>
          {/* header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: spacing.md,
            }}>
            <View>
              <Text variant="caption" tone="faint">
                {greeting()}
              </Text>
              <Text variant="title">{profile?.firstName ?? '...'}</Text>
            </View>
            <Pressable
              onPress={() => router.push('/(app)/programs/new')}
              style={{
                width: 48,
                height: 48,
                borderRadius: radius.md,
                backgroundColor: c.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <PlusIcon color={c.onAccent} />
            </Pressable>
          </View>

          {isLoading ? (
            <View style={{ gap: spacing.lg }}>
              <Skeleton height={180} rounded={radius.lg} />
              <Skeleton height={90} rounded={radius.lg} />
              <Skeleton height={90} rounded={radius.lg} />
            </View>
          ) : slices.length === 0 ? (
            <EmptyState
              emoji="🎯"
              title="Пока нет активных программ"
              subtitle="Создайте первую программу, разбейте цель на задачи и начните двигаться."
              ctaTitle="Создать первую программу"
              onCta={() => router.push('/(app)/programs/new')}
            />
          ) : (
            <>
              {/* hero overall ring */}
              <Card>
                <View style={{ alignItems: 'center', gap: spacing.md }}>
                  <Text variant="label" tone="muted">
                    ОБЩИЙ ПРОГРЕСС
                  </Text>
                  <ProgressRing progress={overall} size={172} stroke={15} sublabel="по активным" />
                  <Button
                    title="Отметить сегодня"
                    onPress={() => router.push('/(app)/log')}
                    size="md"
                  />
                </View>
              </Card>

              {/* gamification row */}
              <View style={{ gap: spacing.lg }}>
                <LevelBar xp={profile?.xp ?? 0} />
                <View style={{ flexDirection: 'row', gap: spacing.lg }}>
                  <StreakPill
                    current={profile?.currentStreak ?? 0}
                    best={profile?.bestStreak ?? 0}
                  />
                  <Card style={{ flex: 1 }}>
                    <View style={{ gap: spacing.sm }}>
                      <Text variant="title">{slices.length}</Text>
                      <Text variant="caption" tone="muted">
                        активных программ
                      </Text>
                    </View>
                  </Card>
                </View>
              </View>

              {/* program list */}
              <Text variant="heading" style={{ marginTop: spacing.sm }}>
                Программы
              </Text>
              <View style={{ gap: spacing.md }}>
                {slices.map((sl) => (
                  <ProgramCard
                    key={sl.program.id}
                    program={sl.program}
                    tasks={sl.tasks}
                    logs={sl.logs}
                    onPress={() =>
                      router.push({ pathname: '/(app)/programs/[id]', params: { id: sl.program.id } })
                    }
                  />
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { daysRemaining, programProgress, taskProgress } from '../../../core/logic';
import { useAuth } from '../../../features/auth/auth-provider';
import { sliceProgram } from '../../../features/programs/select';
import { useDeleteProgram, useSetProgramStatus, useWorkspace } from '../../../features/queries';
import {
  Button,
  Card,
  ChevronLeftIcon,
  Chip,
  ProgressBar,
  ProgressRing,
  Screen,
  Skeleton,
  Text,
} from '../../../ui/components';
import { spacing } from '../../../ui/theme';
import { useColors } from '../../../ui/theme-provider';

const PERIOD_LABEL = { '7d': '7 дней', '14d': '14 дней', '30d': '30 дней' } as const;

export default function ProgramDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: ws, isLoading } = useWorkspace(user?.id);
  const setStatus = useSetProgramStatus(user?.id);
  const deleteProgram = useDeleteProgram(user?.id);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const slice = ws && id ? sliceProgram(ws, id) : null;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm }}>
        <Text onPress={() => router.back()}>
          <ChevronLeftIcon color={c.text} />
        </Text>
        <Text variant="heading" style={{ flex: 1 }} numberOfLines={1}>
          {slice?.program.title ?? 'Программа'}
        </Text>
      </View>

      {isLoading ? (
        <View style={{ gap: spacing.lg }}>
          <Skeleton height={200} />
          <Skeleton height={80} />
          <Skeleton height={80} />
        </View>
      ) : !slice ? (
        <Text variant="body" tone="muted">
          Программа не найдена.
        </Text>
      ) : (
        <>
          <Card>
            <View style={{ alignItems: 'center', gap: spacing.md }}>
              <ProgressRing
                progress={programProgress(slice.program, slice.tasks, slice.logs)}
                size={180}
                stroke={16}
              />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Chip label={PERIOD_LABEL[slice.program.period]} />
                <Chip
                  label={
                    daysRemaining(slice.program) === 0
                      ? 'Финальный день'
                      : `${daysRemaining(slice.program)} дн. осталось`
                  }
                  tone="accent"
                />
                {slice.program.status === 'completed' ? <Chip label="Завершена" /> : null}
              </View>
            </View>
          </Card>

          <Text variant="heading">Задачи</Text>
          <View style={{ gap: spacing.md }}>
            {slice.tasks.map((t) => {
              const p = taskProgress(t, slice.program, slice.logs);
              return (
                <Card key={t.id}>
                  <View style={{ gap: spacing.sm }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>
                        {t.title}
                      </Text>
                      <Text variant="label" tone="accent">
                        {Math.round(p * 100)}%
                      </Text>
                    </View>
                    <ProgressBar progress={p} />
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <Chip label={t.goalType === 'daily' ? 'Каждый день' : 'За период'} />
                      <Chip label={`Цель ${t.target}${t.unit ? ' ' + t.unit : ''}`} />
                      <Chip label={`Вес ${Math.round(t.weight)}%`} />
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>

          <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
            <Button title="Отметить сегодня" onPress={() => router.push('/(app)/log')} />
            {slice.program.status === 'active' ? (
              <Button
                title="Завершить программу"
                variant="secondary"
                loading={setStatus.isPending}
                onPress={() =>
                  setStatus.mutate({ programId: slice.program.id, status: 'completed' })
                }
              />
            ) : (
              <Button
                title="Вернуть в активные"
                variant="secondary"
                loading={setStatus.isPending}
                onPress={() => setStatus.mutate({ programId: slice.program.id, status: 'active' })}
              />
            )}
            <Button
              title="В архив"
              variant="ghost"
              loading={setStatus.isPending}
              onPress={() =>
                setStatus.mutate(
                  { programId: slice.program.id, status: 'archived' },
                  { onSuccess: () => router.replace('/(app)') },
                )
              }
            />

            {!confirmDelete ? (
              <Button
                title="Удалить программу"
                variant="ghost"
                onPress={() => setConfirmDelete(true)}
                style={{ marginTop: spacing.sm }}
              />
            ) : (
              <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                <Text variant="caption" tone="danger" style={{ textAlign: 'center' }}>
                  Удалить навсегда? Программа, задачи и история отметок будут стёрты без возможности
                  восстановления.
                </Text>
                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Отмена"
                      variant="secondary"
                      onPress={() => setConfirmDelete(false)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Удалить"
                      variant="danger"
                      loading={deleteProgram.isPending}
                      onPress={() =>
                        deleteProgram.mutate(slice.program.id, {
                          onSuccess: () => router.replace('/(app)'),
                        })
                      }
                    />
                  </View>
                </View>
              </View>
            )}
          </View>
        </>
      )}
    </Screen>
  );
}

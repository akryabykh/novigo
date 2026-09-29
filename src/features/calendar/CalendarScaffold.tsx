// Shared screen chrome for the Goals and Tasks tabs: the scrolling shell, the
// day strip, the period navigator and the rings selector. The screen supplies
// its own content (goal/task list or the editor) as children. This is a
// composition wrapper, NOT a universal screen — each tab keeps its own logic.
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Timeframe } from '../../core/domain';
import { type Rings } from '../../core/logic';
import { EmptyState, ProgressRing, Text } from '../../ui/components';
import { radius, spacing, timeframeColor, timeframeLabel } from '../../ui/theme';
import { useColors } from '../../ui/theme-provider';
import { WEEKDAYS_SHORT, dayNum, periodTitle } from './format';
import type { Calendar } from './useCalendar';

const ORDER: Timeframe[] = ['day', 'week', 'month'];

export function CalendarScaffold({
  cal,
  rings,
  daysWithProgress,
  onSelectScope,
  navigationDisabled = false,
  isError,
  refetch,
  isRefetching,
  saveError,
  onDismissError,
  children,
}: {
  cal: Calendar;
  rings: Rings;
  daysWithProgress: Set<string>;
  onSelectScope: (tf: Timeframe) => void;
  navigationDisabled?: boolean;
  isError: boolean;
  refetch: () => void;
  isRefetching: boolean;
  saveError?: string | null;
  onDismissError?: () => void;
  children: React.ReactNode;
}) {
  const c = useColors();
  const { today, scope, refDate, setRefDate } = cal;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ alignItems: 'center', paddingBottom: spacing['2xl'] }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.accent} />}>
        <View style={{ width: '100%', maxWidth: 560, paddingHorizontal: spacing.xl, gap: spacing.lg }}>
          {isError ? (
            <EmptyState
              emoji="⚠️"
              title="Не удалось загрузить"
              subtitle="Сервер не ответил вовремя. Проверь соединение и попробуй ещё раз."
              ctaTitle="Повторить"
              onCta={refetch}
            />
          ) : (
            <>
              {/* day strip */}
              <View style={{ flexDirection: 'row', gap: spacing.xs, paddingTop: spacing.md }}>
                {cal.weekDays.map((d, i) => {
                  const active = d === refDate;
                  const isToday = d === today;
                  const hasProgress = daysWithProgress.has(d);
                  return (
                    <Pressable
                      disabled={navigationDisabled}
                      key={d}
                      onPress={() => setRefDate(d)}
                      style={{
                        flex: 1,
                        alignItems: 'center',
                        gap: 3,
                        paddingVertical: spacing.sm,
                        borderRadius: radius.md,
                        backgroundColor: active ? c.accent : 'transparent',
                        borderWidth: !active && isToday ? 1.5 : 0,
                        borderColor: c.accent,
                      }}>
                      <Text variant="caption" style={{ color: active ? '#fff' : c.textFaint }}>
                        {WEEKDAYS_SHORT[i]}
                      </Text>
                      <Text variant="label" style={{ color: active ? '#fff' : isToday ? c.accent : c.text }}>
                        {dayNum(d)}
                      </Text>
                      <View
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: 3,
                          backgroundColor: hasProgress ? (active ? '#fff' : c.accent) : 'transparent',
                        }}
                      />
                    </Pressable>
                  );
                })}
              </View>

              {/* period navigator */}
              <View style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <NavArrow disabled={navigationDisabled} label="‹" onPress={() => cal.stepPeriod(-1)} />
                  {scope === 'day' ? (
                    <View style={{ flex: 1 }} />
                  ) : (
                    <Text variant="heading">{periodTitle(scope, refDate, today)}</Text>
                  )}
                  <NavArrow disabled={navigationDisabled} label="›" onPress={() => cal.stepPeriod(1)} />
                </View>
                {refDate !== today ? (
                  <Pressable
                    disabled={navigationDisabled}
                    onPress={cal.goToday}
                    style={{
                      alignSelf: 'center',
                      paddingHorizontal: spacing.lg,
                      height: 32,
                      borderRadius: radius.md,
                      backgroundColor: c.surfaceAlt,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <Text variant="label" tone="accent">
                      Сегодня
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {/* rings selector */}
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {ORDER.map((tf) => {
                  const active = tf === scope;
                  return (
                    <Pressable
                      disabled={navigationDisabled}
                      key={tf}
                      onPress={() => onSelectScope(tf)}
                      style={{
                        flex: 1,
                        alignItems: 'center',
                        gap: spacing.sm,
                        paddingVertical: spacing.md,
                        borderRadius: radius.lg,
                        borderWidth: 1.5,
                        borderColor: active ? timeframeColor[tf] : c.border,
                        backgroundColor: active ? c.surface : 'transparent',
                      }}>
                      <ProgressRing progress={rings[tf]} size={84} stroke={8} color={timeframeColor[tf]} />
                      <Text variant="label" style={{ color: active ? timeframeColor[tf] : c.textMuted }}>
                        {timeframeLabel[tf]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {saveError ? (
                <Pressable
                  onPress={onDismissError}
                  style={{
                    padding: spacing.md,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: c.danger,
                    backgroundColor: c.surfaceAlt,
                  }}>
                  <Text variant="caption" tone="danger">
                    {saveError}
                  </Text>
                </Pressable>
              ) : null}

              {children}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function NavArrow({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: c.surfaceAlt,
        opacity: pressed ? 0.7 : 1,
      })}>
      <Text style={{ fontSize: 22, color: c.text }}>{label}</Text>
    </Pressable>
  );
}

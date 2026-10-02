import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';

import { addDays, weekdayMon0 } from '../../core/logic';
import { radius, spacing } from '../../ui/theme';
import { useColors } from '../../ui/theme-provider';
import { Text } from '../../ui/components';
import { WEEKDAYS_SHORT, dayNum } from './format';

const ITEM_WIDTH = 54;
const CENTER = 15;

export function DayWheel({ refDate, today, onSelect, daysWithProgress, disabled }: {
  refDate: string;
  today: string;
  onSelect: (date: string) => void;
  daysWithProgress: Set<string>;
  disabled: boolean;
}) {
  const c = useColors();
  const ref = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const lastWheel = useRef(0);
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const days = Array.from({ length: 31 }, (_, index) => addDays(refDate, index - CENTER));

  const selectOffset = (offset: number) => {
    const delta = Math.round(offset / ITEM_WIDTH) - CENTER;
    if (delta) onSelect(addDays(refDate, delta));
  };

  useEffect(() => () => {
    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
  }, []);

  useEffect(() => {
    if (Platform?.OS !== 'web') return;
    const node = ref.current?.getScrollableNode?.();
    if (!node || typeof node === 'number') return;
    const onWheel = (event: WheelEvent) => {
      if (disabled || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      event.preventDefault();
      const now = Date.now();
      if (now - lastWheel.current < 120) return;
      lastWheel.current = now;
      onSelect(addDays(refDate, event.deltaY > 0 ? 1 : -1));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [disabled, onSelect, refDate, width]);

  useEffect(() => {
    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    if (width) ref.current?.scrollTo?.({ x: CENTER * ITEM_WIDTH, animated: false });
  }, [refDate, width]);

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ paddingTop: spacing.md }}>
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={!disabled}
        snapToInterval={ITEM_WIDTH}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: Math.max(0, (width - ITEM_WIDTH) / 2) }}
        onScroll={Platform?.OS === 'web' ? (event) => {
          const offset = event.nativeEvent.contentOffset.x;
          if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
          scrollEndTimer.current = setTimeout(() => selectOffset(offset), 130);
        } : undefined}
        scrollEventThrottle={16}
        onScrollEndDrag={(event) => {
          if (Platform?.OS === 'web') return;
          const offset = event.nativeEvent.contentOffset.x;
          if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
          scrollEndTimer.current = setTimeout(() => selectOffset(offset), 130);
        }}
        onMomentumScrollBegin={() => {
          if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
        }}
        onMomentumScrollEnd={(event) => {
          if (Platform?.OS !== 'web') {
            if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
            selectOffset(event.nativeEvent.contentOffset.x);
          }
        }}>
        {days.map((date) => {
          const active = date === refDate;
          const isToday = date === today;
          return (
            <Pressable key={date} disabled={disabled} onPress={() => onSelect(date)}
              style={{ width: ITEM_WIDTH, alignItems: 'center', gap: 3,
                paddingVertical: spacing.sm, borderRadius: radius.md,
                backgroundColor: active ? c.accent : 'transparent',
                borderWidth: !active && isToday ? 1.5 : 0, borderColor: c.accent }}>
              <Text variant="caption" style={{ color: active ? '#fff' : c.textFaint }}>
                {WEEKDAYS_SHORT[weekdayMon0(date)]}
              </Text>
              <Text variant="label" style={{ color: active ? '#fff' : isToday ? c.accent : c.text }}>
                {dayNum(date)}
              </Text>
              <View style={{ width: 5, height: 5, borderRadius: 3,
                backgroundColor: daysWithProgress.has(date) ? (active ? '#fff' : c.accent) : 'transparent' }} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

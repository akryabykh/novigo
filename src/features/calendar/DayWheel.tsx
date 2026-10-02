import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';

import { addDays, weekdayMon0 } from '../../core/logic';
import { radius, spacing } from '../../ui/theme';
import { useColors } from '../../ui/theme-provider';
import { Text } from '../../ui/components';
import { WEEKDAYS_SHORT, dayNum } from './format';

const ITEM_WIDTH = 54;
const COUNT = 61;
const CENTER = 30;
const EDGE = 8;
const SHIFT = 20;

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
  const [windowStart, setWindowStart] = useState(() => addDays(refDate, -CENTER));
  const offset = useRef(CENTER * ITEM_WIDTH);
  const pendingOffset = useRef<number | null>(null);
  const lastWheel = useRef(0);
  const previousSelected = useRef(refDate);
  const days = Array.from({ length: COUNT }, (_, index) => addDays(windowStart, index));

  // Extend the visible dates without changing the selected calendar period.
  const handleScroll = (x: number) => {
    offset.current = x;
    if (disabled || pendingOffset.current !== null) return;
    if (x < EDGE * ITEM_WIDTH) {
      pendingOffset.current = x + SHIFT * ITEM_WIDTH;
      setWindowStart((start) => addDays(start, -SHIFT));
    } else if (x > (COUNT - EDGE - 1) * ITEM_WIDTH) {
      pendingOffset.current = x - SHIFT * ITEM_WIDTH;
      setWindowStart((start) => addDays(start, SHIFT));
    }
  };

  useLayoutEffect(() => {
    if (pendingOffset.current === null) return;
    const next = pendingOffset.current;
    pendingOffset.current = null;
    offset.current = next;
    ref.current?.scrollTo?.({ x: next, animated: false });
  }, [windowStart]);

  useEffect(() => {
    if (previousSelected.current === refDate) return;
    previousSelected.current = refDate;
    pendingOffset.current = CENTER * ITEM_WIDTH;
    setWindowStart(addDays(refDate, -CENTER));
  }, [refDate]);

  useEffect(() => {
    if (width) ref.current?.scrollTo?.({ x: offset.current, animated: false });
  }, [width]);

  useEffect(() => {
    if (Platform?.OS !== 'web') return;
    const node = ref.current?.getScrollableNode?.();
    if (!node || typeof node === 'number') return;
    const onWheel = (event: WheelEvent) => {
      if (disabled || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      event.preventDefault();
      const now = Date.now();
      if (now - lastWheel.current < 100) return;
      lastWheel.current = now;
      const next = offset.current + (event.deltaY > 0 ? ITEM_WIDTH : -ITEM_WIDTH);
      offset.current = next;
      ref.current?.scrollTo?.({ x: next, animated: false });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [disabled, width]);

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
        onScroll={(event) => handleScroll(event.nativeEvent.contentOffset.x)}
        scrollEventThrottle={16}>
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

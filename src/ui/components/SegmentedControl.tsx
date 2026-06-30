// SegmentedControl — small pill selector (e.g. program period, theme).
import { Pressable, View } from 'react-native';

import { radius, spacing, typography } from '../theme';
import { useColors } from '../theme-provider';
import { Text } from './Text';

export interface Segment<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (v: T) => void;
}

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: c.surfaceAlt,
        borderRadius: radius.md,
        padding: 4,
        gap: 4,
      }}>
      {segments.map((s) => {
        const active = s.value === value;
        return (
          <Pressable
            key={s.value}
            onPress={() => onChange(s.value)}
            style={{
              flex: 1,
              paddingVertical: spacing.sm + 2,
              borderRadius: radius.sm,
              alignItems: 'center',
              backgroundColor: active ? c.surface : 'transparent',
              ...(active
                ? {
                    shadowColor: '#11111A',
                    shadowOpacity: 0.08,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 2 },
                    elevation: 1,
                  }
                : {}),
            }}>
            <Text
              style={{
                fontFamily: active ? typography.semibold : typography.medium,
                fontSize: typography.size.sm,
                color: active ? c.text : c.textMuted,
              }}>
              {s.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

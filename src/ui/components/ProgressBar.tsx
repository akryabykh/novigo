// ProgressBar — thin secondary progress indicator with animated fill.
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';

import { radius } from '../theme';
import { useColors } from '../theme-provider';

export interface ProgressBarProps {
  progress: number; // 0..1
  height?: number;
  color?: string;
  trackColor?: string;
}

export function ProgressBar({ progress, height = 8, color, trackColor }: ProgressBarProps) {
  const c = useColors();
  const target = Math.max(0, Math.min(1, progress));
  const w = useSharedValue(0);

  useEffect(() => {
    w.value = withTiming(target, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [target, w]);

  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));

  return (
    <View
      style={{
        height,
        borderRadius: radius.full,
        backgroundColor: trackColor ?? c.track,
        overflow: 'hidden',
      }}>
      <Animated.View
        style={[{ height, borderRadius: radius.full, backgroundColor: color ?? c.accent }, fill]}
      />
    </View>
  );
}

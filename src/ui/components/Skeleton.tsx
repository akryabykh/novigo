// Skeleton — subtle pulsing placeholder for loading states.
import { useEffect } from 'react';
import { type DimensionValue } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';

import { radius } from '../theme';
import { useColors } from '../theme-provider';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  rounded?: number;
}

export function Skeleton({ width = '100%', height = 16, rounded = radius.sm }: SkeletonProps) {
  const c = useColors();
  const o = useSharedValue(0.5);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      style={[{ width, height, borderRadius: rounded, backgroundColor: c.surfaceAlt }, style]}
    />
  );
}

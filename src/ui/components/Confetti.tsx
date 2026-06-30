// Confetti — restrained celebratory burst for 100% day. Auto-stops.
import { useEffect } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';

import { palette } from '../theme';

const COLORS = [palette.accent, palette.success, palette.warning, palette.accentStrong];
const COUNT = 28;

function Piece({ index, run }: { index: number; run: number }) {
  const { width, height } = useWindowDimensions();
  const startX = (index / COUNT) * width + ((index * 37) % 40) - 20;
  const drift = ((index * 53) % 80) - 40;
  const delay = (index % 6) * 60;
  const color = COLORS[index % COLORS.length];
  const size = 6 + (index % 4) * 2;

  const t = useSharedValue(0);
  useEffect(() => {
    if (run === 0) return;
    t.value = 0;
    t.value = withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) });
  }, [run, t]);

  const style = useAnimatedStyle(() => ({
    opacity: t.value === 0 ? 0 : 1 - t.value,
    transform: [
      { translateY: t.value * (height * 0.9) },
      { translateX: t.value * drift },
      { rotate: `${t.value * 540}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: -20,
          left: startX,
          width: size,
          height: size * 1.6,
          borderRadius: 2,
          backgroundColor: color,
          // crude per-piece delay via initial translateY offset
          marginTop: -delay,
        },
        style,
      ]}
    />
  );
}

export function Confetti({ run }: { run: number }) {
  if (run === 0) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}>
      {Array.from({ length: COUNT }).map((_, i) => (
        <Piece key={`${run}-${i}`} index={i} run={run} />
      ))}
    </View>
  );
}

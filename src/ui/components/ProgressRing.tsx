// ProgressRing — the hero. Animated circular progress (0..1) with center label.
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { typography } from '../theme';
import { useColors } from '../theme-provider';
import { Text } from './Text';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface ProgressRingProps {
  /** 0..1 */
  progress: number;
  size?: number;
  stroke?: number;
  color?: string;
  trackColor?: string;
  /** big number in the middle; defaults to rounded percent */
  label?: string;
  sublabel?: string;
  showPercent?: boolean;
}

export function ProgressRing({
  progress,
  size = 180,
  stroke = 14,
  color,
  trackColor,
  label,
  sublabel,
  showPercent = true,
}: ProgressRingProps) {
  const c = useColors();
  const ringColor = color ?? c.accent;
  const track = trackColor ?? c.track;

  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const target = Math.max(0, Math.min(1, progress));

  const anim = useSharedValue(0);
  useEffect(() => {
    anim.value = withTiming(target, { duration: 750, easing: Easing.out(Easing.cubic) });
  }, [target, anim]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - anim.value),
  }));

  const pct = Math.round(target * 100);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={ringColor}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          // start at 12 o'clock
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ alignItems: 'center' }}>
        <Text style={{ fontFamily: typography.bold, fontSize: size * 0.26, color: c.text }}>
          {label ?? (showPercent ? `${pct}` : '')}
          {label == null && showPercent ? (
            <Text style={{ fontFamily: typography.semibold, fontSize: size * 0.12, color: c.textMuted }}>
              %
            </Text>
          ) : null}
        </Text>
        {sublabel ? (
          <Text variant="caption" tone="faint">
            {sublabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

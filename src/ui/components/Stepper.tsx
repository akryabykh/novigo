// Stepper — fast 1-2 tap numeric input for daily logging. Optional inline edit.
import * as Haptics from 'expo-haptics';
import { Platform, Pressable, TextInput, View } from 'react-native';

import { radius, spacing, typography } from '../theme';
import { useColors } from '../theme-provider';
import { Text } from './Text';

function StepButton({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: radius.md,
        backgroundColor: c.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
      })}>
      <Text style={{ fontFamily: typography.bold, fontSize: 22, color: c.text }}>{label}</Text>
    </Pressable>
  );
}

export interface StepperProps {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
}

export function Stepper({ value, onChange, step = 1, min = 0, max, unit }: StepperProps) {
  const c = useColors();

  const tick = (delta: number) => {
    let next = Math.round((value + delta) * 100) / 100;
    if (next < min) next = min;
    if (max != null && next > max) next = max;
    if (next !== value && Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    onChange(next);
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <StepButton label="−" onPress={() => tick(-step)} />
      <View style={{ flex: 1, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <TextInput
            value={String(value)}
            keyboardType="numeric"
            onChangeText={(t) => {
              const n = parseFloat(t.replace(',', '.'));
              onChange(Number.isFinite(n) ? n : 0);
            }}
            style={{
              fontFamily: typography.bold,
              fontSize: typography.size['2xl'],
              color: c.text,
              minWidth: 48,
              textAlign: 'center',
              padding: 0,
            }}
          />
          {unit ? (
            <Text variant="label" tone="faint">
              {unit}
            </Text>
          ) : null}
        </View>
      </View>
      <StepButton label="+" onPress={() => tick(step)} />
    </View>
  );
}

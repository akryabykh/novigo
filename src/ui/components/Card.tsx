// Card — soft surface, 16px radius, gentle shadow.
import { type ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';

import { radius, shadow, spacing } from '../theme';
import { useColors } from '../theme-provider';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  padded?: boolean;
}

export function Card({ children, onPress, style, padded = true }: CardProps) {
  const c = useColors();
  const base: ViewStyle = {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    padding: padded ? spacing.lg : 0,
    ...shadow.card,
    shadowColor: c.shadow === 'transparent' ? '#000' : '#11111A',
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [base, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

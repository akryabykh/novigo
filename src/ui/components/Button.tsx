// Button — primary (accent), secondary (surface), ghost. Haptic on native.
import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Platform, Pressable, View, type ViewStyle } from 'react-native';

import { radius, spacing, typography } from '../theme';
import { useColors } from '../theme-provider';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled,
  loading,
  fullWidth = true,
  icon,
  style,
}: ButtonProps) {
  const c = useColors();
  const height = size === 'lg' ? 54 : 44;

  const bg =
    variant === 'primary' ? c.accent
    : variant === 'secondary' ? c.surfaceAlt
    : variant === 'danger' ? c.danger
    : 'transparent';
  const fg =
    variant === 'primary' || variant === 'danger' ? c.onAccent
    : variant === 'ghost' ? c.accent
    : c.text;
  const borderColor = variant === 'secondary' ? c.border : 'transparent';

  const handlePress = () => {
    if (disabled || loading) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          height,
          borderRadius: radius.md,
          backgroundColor: bg,
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: spacing.sm,
          paddingHorizontal: spacing.xl,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: disabled ? 0.45 : pressed ? 0.9 : 1,
          transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <View>{icon}</View> : null}
          <Text style={{ color: fg, fontFamily: typography.semibold, fontSize: typography.size.md }}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

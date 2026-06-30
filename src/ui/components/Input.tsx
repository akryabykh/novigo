// Input — labeled text field with error + helper states.
import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { radius, spacing, typography } from '../theme';
import { useColors } from '../theme-provider';
import { Text } from './Text';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null;
  helper?: string;
}

export function Input({ label, error, helper, style, ...rest }: InputProps) {
  const c = useColors();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: spacing.sm }}>
      {label ? (
        <Text variant="label" tone="muted">
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={c.textFaint}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          {
            height: 52,
            borderRadius: radius.md,
            borderWidth: 1.5,
            borderColor: error ? c.danger : focused ? c.accent : c.border,
            backgroundColor: c.surface,
            paddingHorizontal: spacing.lg,
            color: c.text,
            fontFamily: typography.regular,
            fontSize: typography.size.md,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : helper ? (
        <Text variant="caption" tone="faint">
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

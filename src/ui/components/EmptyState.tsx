// EmptyState — friendly empty screen with a single clear CTA.
import { View } from 'react-native';

import { spacing } from '../theme';
import { Button } from './Button';
import { Text } from './Text';

export interface EmptyStateProps {
  emoji?: string;
  title: string;
  subtitle?: string;
  ctaTitle?: string;
  onCta?: () => void;
}

export function EmptyState({ emoji = '🎯', title, subtitle, ctaTitle, onCta }: EmptyStateProps) {
  return (
    <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing['3xl'] }}>
      <Text style={{ fontSize: 56 }}>{emoji}</Text>
      <Text variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="body" tone="muted" style={{ textAlign: 'center' }}>
          {subtitle}
        </Text>
      ) : null}
      {ctaTitle && onCta ? (
        <View style={{ marginTop: spacing.md, alignSelf: 'stretch' }}>
          <Button title={ctaTitle} onPress={onCta} />
        </View>
      ) : null}
    </View>
  );
}

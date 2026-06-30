// Shown when Supabase env vars are still placeholders — guides first-run setup.
import { View } from 'react-native';

import { Card, Screen, Text } from './components';
import { spacing } from './theme';

export function SetupNotice() {
  return (
    <Screen>
      <View style={{ gap: spacing.lg, paddingTop: spacing['3xl'] }}>
        <Text style={{ fontSize: 56 }}>🛠️</Text>
        <Text variant="title">Почти готово</Text>
        <Text variant="body" tone="muted">
          Novigo не видит проект Supabase. Создайте проект и пропишите ключи в файле{' '}
          <Text variant="body" tone="accent">
            .env
          </Text>
          , затем перезапустите.
        </Text>
        <Card>
          <Text variant="label" tone="muted">
            .env
          </Text>
          <View style={{ height: spacing.sm }} />
          <Text variant="caption" style={{ fontFamily: 'Inter_500Medium' }}>
            EXPO_PUBLIC_SUPABASE_URL=https://…supabase.co{'\n'}
            EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ…
          </Text>
        </Card>
        <Text variant="caption" tone="faint">
          Значения — в Supabase → Project Settings → API. Затем примените миграцию из
          supabase/migrations/0001_init.sql в SQL Editor.
        </Text>
      </View>
    </Screen>
  );
}

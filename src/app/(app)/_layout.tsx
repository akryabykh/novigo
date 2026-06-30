import { Stack } from 'expo-router';

import { useColors } from '../../ui/theme-provider';

export default function AppLayout() {
  const c = useColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.bg },
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="programs/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="programs/[id]" />
      <Stack.Screen name="log" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

import { Stack } from 'expo-router';

import { useColors } from '../../ui/theme-provider';

export default function AdminLayout() {
  const c = useColors();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }} />;
}

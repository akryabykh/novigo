import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { ListIcon, TargetIcon, UserIcon } from '../../../ui/components';
import { typography } from '../../../ui/theme';
import { useColors } from '../../../ui/theme-provider';

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textFaint,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.border,
          borderTopWidth: 1,
          height: Platform.OS === 'web' ? 64 : undefined,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontFamily: typography.medium, fontSize: 11 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Цели',
          tabBarIcon: ({ color }) => <TargetIcon color={color as string} size={24} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Задачи',
          tabBarIcon: ({ color }) => <ListIcon color={color as string} size={24} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Профиль',
          tabBarIcon: ({ color }) => <UserIcon color={color as string} size={24} />,
        }}
      />
    </Tabs>
  );
}

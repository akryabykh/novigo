import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { CounterIcon, FamilyIcon, ListIcon, TargetIcon, TimerIcon, UserIcon } from '../../../ui/components';
import { FEATURE_TABS, launchTab, useFeaturePreferences, type FeatureTab } from '../../../features/preferences/FeaturePreferences';
import { typography } from '../../../ui/theme';
import { useColors } from '../../../ui/theme-provider';

export default function TabsLayout() {
  const c = useColors();
  const { preferences } = useFeaturePreferences();
  const routes: Record<FeatureTab, 'tasks' | 'family' | 'index' | 'counter' | 'stopwatch'> = {
    tasks: 'tasks', family: 'family', goals: 'index', counter: 'counter', stopwatch: 'stopwatch',
  };
  const titles: Record<FeatureTab, string> = {
    tasks: 'Задачи', family: 'Семья', goals: 'Цели', counter: 'Счётчик', stopwatch: 'Секундомер',
  };
  const icons = { tasks: ListIcon, family: FamilyIcon, goals: TargetIcon, counter: CounterIcon, stopwatch: TimerIcon };
  const visible = preferences.tabs;
  const hidden = FEATURE_TABS.filter((tab) => !visible.includes(tab));
  return (
    <Tabs
      initialRouteName={routes[launchTab(visible)]}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textFaint,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.border,
          borderTopWidth: 1,
          height: Platform.OS === 'web' ? 68 : undefined,
          paddingTop: 6,
          paddingBottom: 4,
        },
        tabBarLabelStyle: { fontFamily: typography.medium, fontSize: 11 },
      }}>
      {visible.map((tab) => {
        const Icon = icons[tab];
        return <Tabs.Screen key={tab} name={routes[tab]} options={{
          title: titles[tab],
          tabBarIcon: ({ color }) => <Icon color={color as string} size={24} />,
        }} />;
      })}
      {hidden.map((tab) => <Tabs.Screen key={tab} name={routes[tab]} options={{ title: titles[tab], href: null }} />)}
      <Tabs.Screen name="statistics" options={{ title: 'Статистика', href: null }} />
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

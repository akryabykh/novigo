import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { CounterIcon, Screen, Text, TimerIcon } from '../../../ui/components';
import { radius, spacing } from '../../../ui/theme';
import { useColors } from '../../../ui/theme-provider';

const items = [
  { title: 'Счётчик', description: 'Нажатия и сохранённые результаты', icon: CounterIcon, path: '/(app)/(tabs)/counter' },
  { title: 'Секундомер', description: 'Время работы по задачам', icon: TimerIcon, path: '/(app)/(tabs)/stopwatch' },
] as const;

export default function AppsScreen() {
  const c = useColors();
  return <Screen edges={['top']}>
    <View style={{ paddingTop: spacing.md, gap: spacing.xs }}>
      <Text variant="title">Приложения</Text>
      <Text variant="caption" tone="muted">Выбери инструмент.</Text>
    </View>
    <View style={{ gap: spacing.md }}>
      {items.map(({ title, description, icon: Icon, path }) => <Pressable key={title}
        accessibilityRole="button" accessibilityLabel={title} onPress={() => router.push(path)}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md,
          padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1,
          borderColor: c.border, backgroundColor: c.surface, opacity: pressed ? 0.75 : 1 })}>
        <View style={{ width: 48, height: 48, borderRadius: radius.md, backgroundColor: c.accentSoft,
          alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={25} color={c.accent} />
        </View>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text variant="heading">{title}</Text>
          <Text variant="caption" tone="muted">{description}</Text>
        </View>
        <Text variant="heading" tone="faint">›</Text>
      </Pressable>)}
    </View>
  </Screen>;
}

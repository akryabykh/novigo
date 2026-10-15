import { Pressable, View } from 'react-native';

import type { TaskTag } from '../../core/domain';
import { Text } from '../../ui/components';
import { radius, spacing } from '../../ui/theme';
import { useColors } from '../../ui/theme-provider';
import { TASK_TAGS } from './task-tags';

export function TaskTagPicker({ value, onChange, disabled = false }: {
  value: TaskTag | null;
  onChange: (tag: TaskTag | null) => void;
  disabled?: boolean;
}) {
  const c = useColors();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="caption" tone="muted">Тег задачи · необязательно</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {[{ value: null, label: 'Без тега' }, ...TASK_TAGS].map((option) => {
          const selected = value === option.value;
          return (
            <Pressable key={option.label} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: selected }}
              onPress={() => onChange(option.value)}
              style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                borderWidth: 1.5, borderColor: selected ? c.accent : c.border,
                backgroundColor: selected ? c.accentSoft : c.surface }}>
              <Text variant="label" style={{ color: selected ? c.accent : c.textMuted }}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

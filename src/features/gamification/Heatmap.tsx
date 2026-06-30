import { View } from 'react-native';

import type { DailyLog, Program, Task } from '../../core/domain';
import { addDays, todayISO } from '../../core/logic';
import { Text } from '../../ui/components';
import { radius } from '../../ui/theme';
import { useColors } from '../../ui/theme-provider';
import { dayProgress } from './engine';

const WEEKS = 9;
const CELL = 15;
const GAP = 4;

export function Heatmap({
  programs,
  tasks,
  logs,
}: {
  programs: Program[];
  tasks: Task[];
  logs: DailyLog[];
}) {
  const c = useColors();
  const today = todayISO();
  const bundle = { programs, tasks, logs };

  // build columns (weeks), each 7 days. Align so last column ends at today.
  const totalDays = WEEKS * 7;
  const start = addDays(today, -(totalDays - 1));

  const columns: { date: string; level: number }[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    const col: { date: string; level: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      if (date > today) {
        col.push({ date, level: -1 });
        continue;
      }
      const p = dayProgress(date, bundle);
      const level = p <= 0 ? 0 : p < 0.4 ? 1 : p < 0.8 ? 2 : p < 1 ? 3 : 4;
      col.push({ date, level });
    }
    columns.push(col);
  }

  const colorFor = (level: number): string => {
    if (level < 0) return 'transparent';
    if (level === 0) return c.track;
    const opacity = [0, 0.3, 0.5, 0.75, 1][level];
    return withOpacity(c.accent, opacity);
  };

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: GAP }}>
        {columns.map((col, i) => (
          <View key={i} style={{ gap: GAP }}>
            {col.map((cell) => (
              <View
                key={cell.date}
                style={{
                  width: CELL,
                  height: CELL,
                  borderRadius: 4,
                  backgroundColor: colorFor(cell.level),
                }}
              />
            ))}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
        <Text variant="caption" tone="faint">
          меньше
        </Text>
        {[0, 1, 2, 3, 4].map((l) => (
          <View
            key={l}
            style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: colorFor(l) }}
          />
        ))}
        <Text variant="caption" tone="faint">
          больше
        </Text>
      </View>
    </View>
  );
}

// accent is a hex like #6366F1 → rgba with opacity
function withOpacity(hex: string, opacity: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

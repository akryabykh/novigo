import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import type { Goal, Timeframe } from '../../core/domain';
import { addDays, startOfMonth, todayISO, weekdayMon0 } from '../../core/logic';
import { Button, Input, Text } from '../../ui/components';
import { radius, spacing, timeframeLabel } from '../../ui/theme';
import { useColors } from '../../ui/theme-provider';
import { addMonths, periodTitle } from '../calendar/format';
import { nextTaskPeriod, taskMoveDates } from './task-move';
import type { TaskMoveInput } from '../offline/sync';

const PERIODS: Timeframe[] = ['day', 'week', 'month'];

export function TaskActions({ task, refDate, locked = false, saving, error, onClose, onEdit, onDelete, onMove, onCopy }: {
  task: Goal;
  refDate: string;
  locked?: boolean;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onEdit: (title: string) => void;
  onDelete: () => void;
  onMove: (input: TaskMoveInput) => void;
  onCopy?: () => void;
}) {
  const c = useColors();
  const [mode, setMode] = useState<'menu' | 'edit' | 'move' | 'date'>('menu');
  const [title, setTitle] = useState(task.title);
  const [destination, setDestination] = useState<Timeframe>('day');
  const [selectedDate, setSelectedDate] = useState(refDate);
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(refDate));
  const [localError, setLocalError] = useState<string | null>(null);

  const move = (to: Timeframe, date: string) => {
    if (!locked) onMove({ taskId: task.id, from: task.timeframe, to, ...taskMoveDates(to, date) });
  };
  const saveTitle = () => {
    if (locked) return;
    if (!title.trim()) { setLocalError('Название задачи не может быть пустым'); return; }
    onEdit(title.trim());
  };
  const firstOffset = weekdayMon0(visibleMonth);
  const days = Array.from({ length: 42 }, (_, i) => addDays(visibleMonth, i - firstOffset));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0007' }}>
        <Pressable style={{ flex: 1 }} onPress={saving ? undefined : onClose} />
        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: '85%', backgroundColor: c.surface,
          borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing['2xl'], gap: spacing.md }}>
          <Text variant="heading" numberOfLines={2}>{task.title}</Text>
          {locked || mode === 'menu' ? (
            <>
              {locked ? (
                <Button title="Скопировать на новый период" variant="secondary" onPress={() => onCopy?.()} disabled={saving || !onCopy} />
              ) : (
                <>
                  <Button title="Редактировать задачу" variant="secondary" onPress={() => setMode('edit')} disabled={saving} />
                  <Button title="Перенести задачу" variant="secondary" onPress={() => setMode('move')} disabled={saving} />
                </>
              )}
              <Button title="Удалить задачу" variant="danger" onPress={onDelete} disabled={saving} />
            </>
          ) : mode === 'edit' ? (
            <>
              <Input label="Название задачи" value={title} onChangeText={(v) => { setTitle(v); setLocalError(null); }} editable={!saving} />
              <Button title="Сохранить" onPress={saveTitle} loading={saving} />
              <Button title="Назад" variant="secondary" onPress={() => setMode('menu')} disabled={saving} />
            </>
          ) : mode === 'move' ? (
            <>
              <Text variant="body">Выбери новый период. Отметка выполнения будет сброшена.</Text>
              <Button title="Перенести на следующий период" variant="secondary"
                onPress={() => { const next = nextTaskPeriod(task.timeframe, refDate); onMove({ taskId: task.id, from: task.timeframe, ...next }); }} disabled={saving} />
              {PERIODS.filter((tf) => tf !== task.timeframe).map((tf) => (
                <Button key={tf} title={`Перенести на ${tf === 'day' ? 'день' : tf === 'week' ? 'неделю' : 'месяц'}`}
                  variant="secondary" disabled={saving} onPress={() => { setDestination(tf); setMode('date'); }} />
              ))}
              <Button title="Назад" variant="ghost" onPress={() => setMode('menu')} disabled={saving} />
            </>
          ) : (
            <>
              <Text variant="body">Выбери дату для периода «{timeframeLabel[destination].toLowerCase()}»</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Button title="‹" variant="ghost" fullWidth={false} onPress={() => setVisibleMonth(addMonths(visibleMonth, -1))} />
                <Text variant="label">{periodTitle('month', visibleMonth, todayISO())} {visibleMonth.slice(0, 4)}</Text>
                <Button title="›" variant="ghost" fullWidth={false} onPress={() => setVisibleMonth(addMonths(visibleMonth, 1))} />
              </View>
              <View style={{ flexDirection: 'row' }}>
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => (
                  <Text key={day} variant="caption" tone="muted" style={{ width: '14.28%', textAlign: 'center' }}>{day}</Text>
                ))}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {days.map((date) => (
                  <Pressable key={date} accessibilityLabel={`Выбрать ${date}`} onPress={() => setSelectedDate(date)}
                    style={{ width: '14.28%', height: 36, alignItems: 'center', justifyContent: 'center',
                      borderRadius: radius.md, backgroundColor: selectedDate === date ? c.accent : 'transparent' }}>
                    <Text variant="caption" style={{ color: selectedDate === date ? c.onAccent : date.slice(0, 7) === visibleMonth.slice(0, 7) ? c.text : c.textFaint }}>
                      {Number(date.slice(-2))}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Button title={`Перенести · ${selectedDate}`} onPress={() => move(destination, selectedDate)} loading={saving} />
              <Button title="Назад" variant="secondary" onPress={() => setMode('move')} disabled={saving} />
            </>
          )}
          {localError || error ? <Text variant="caption" tone="danger">{localError ?? error}</Text> : null}
          <Button title="Отмена" variant="ghost" onPress={onClose} disabled={saving} />
        </ScrollView>
      </View>
    </Modal>
  );
}

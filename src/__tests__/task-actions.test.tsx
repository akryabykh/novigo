import './ui-mocks';
import { expect, jest, test } from '@jest/globals';
import { act, create } from 'react-test-renderer';
import { TaskActions } from '../features/goals/TaskActions';
import { Button } from '../ui/components';
import { mkGoal } from './fixtures';

test('month task menu offers edit, delete, next period, day and week with a picked date', async () => {
  const task = mkGoal({ kind: 'task', timeframe: 'month', startDate: '2026-10-01', endDate: '2026-10-31' });
  const onMove = jest.fn();
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<TaskActions task={task} refDate="2026-10-01" saving={false} error={null}
    onClose={jest.fn()} onEdit={jest.fn()} onDelete={jest.fn()} onMove={onMove} />); });
  const press = async (title: string) => act(async () => {
    tree.root.findAllByType(Button).find((node) => node.props.title === title)!.props.onPress();
  });
  expect(tree.root.findAllByType(Button).map((node) => node.props.title)).toEqual(expect.arrayContaining([
    'Редактировать задачу', 'Перенести задачу', 'Удалить задачу',
  ]));
  await press('Перенести задачу');
  const titles = tree.root.findAllByType(Button).map((node) => node.props.title);
  expect(titles).toContain('Перенести на следующий период');
  expect(titles).toContain('Перенести на день');
  expect(titles).toContain('Перенести на неделю');
  expect(titles).not.toContain('Перенести на месяц');
  await press('Перенести на день');
  await act(async () => {
    tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === 'Выбрать 2026-10-04')[0].props.onPress();
  });
  await press('Перенести · 2026-10-04');
  expect(onMove).toHaveBeenCalledWith({ taskId: task.id, from: 'month', to: 'day',
    startDate: '2026-10-04', endDate: '2026-10-04' });
  await act(async () => { tree.unmount(); });
});

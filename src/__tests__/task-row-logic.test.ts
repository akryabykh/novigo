import { describe, expect, jest, test } from '@jest/globals';
import { handleDeletePress, isTaskDone, taskToggleValue } from '../features/goals/task-row-logic';
import { log, mkGoal } from './fixtures';

const task = mkGoal({ id: 't', kind: 'task', timeframe: 'day', target: 1 });

describe('task toggle value', () => {
  test('unchecked → fills the remainder to done', () => {
    expect(isTaskDone(task, [], '2024-06-10')).toBe(false);
    const v = taskToggleValue(task, [], '2024-06-10');
    expect(v).toBe(1);
    // writing that value makes the task done
    expect(isTaskDone(task, [log('t', '2024-06-10', v)], '2024-06-10')).toBe(true);
  });
  test('checked → clears to 0', () => {
    const logs = [log('t', '2024-06-10', 1)];
    expect(isTaskDone(task, logs, '2024-06-10')).toBe(true);
    expect(taskToggleValue(task, logs, '2024-06-10')).toBe(0);
  });
});

describe('delete does not toggle the task', () => {
  test('stops event propagation and calls onDelete only', () => {
    const stopPropagation = jest.fn();
    const onDelete = jest.fn();
    handleDeletePress({ stopPropagation }, onDelete);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  test('is a no-op when no onDelete is provided (still stops propagation)', () => {
    const stopPropagation = jest.fn();
    expect(() => handleDeletePress({ stopPropagation }, undefined)).not.toThrow();
    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });
});

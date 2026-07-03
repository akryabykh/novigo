import { describe, expect, test } from '@jest/globals';
import { computeXp } from '../features/gamification/engine';
import { log, mkGoal } from './fixtures';

describe('gamification respects a goal start/end window', () => {
  test('daily goal earns XP only for days inside its active window', () => {
    const g = mkGoal({ id: 'd', timeframe: 'day', target: 1, startDate: '2024-06-03', endDate: '2024-06-05' });
    const logs = [
      log('d', '2024-06-03', 1),
      log('d', '2024-06-04', 1),
      log('d', '2024-06-05', 1),
      log('d', '2024-06-10', 1), // outside the window — must be ignored
    ];
    // 3 in-window days × (10 goal-hit + 5 perfect-day) = 45
    expect(computeXp({ goals: [g], logs }, '2024-06-10')).toBe(45);
  });

  test('weekly goal earns XP only for weeks overlapping its window', () => {
    const g = mkGoal({ id: 'w', timeframe: 'week', target: 3, startDate: '2024-06-10', endDate: '2024-06-16' });
    const logs = [
      log('w', '2024-06-11', 3), // inside the goal's only week
      log('w', '2024-06-20', 3), // a later week that does NOT overlap the window
    ];
    expect(computeXp({ goals: [g], logs }, '2024-06-25')).toBe(10);
  });
});

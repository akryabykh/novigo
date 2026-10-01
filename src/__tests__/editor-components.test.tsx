import { describe, test, expect, jest } from '@jest/globals';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { CalendarScaffold } from '../features/calendar/CalendarScaffold';
import { HorizonEditor } from '../features/goals/HorizonEditor';
import { isRealDate, parseWeight } from '../features/goals/editor-validation';
import type { Goal } from '../core/domain';

jest.mock('react-native', () => ({ View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl',
  PanResponder: { create: (handlers: object) => ({ panHandlers: handlers }) } }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('../ui/theme-provider', () => ({ useColors: () => ({}) }));
jest.mock('../ui/components', () => ({ Button: 'Button', Card: 'Card', Input: 'Input', ProgressBar: 'ProgressBar', Text: 'Text', TrashIcon: 'TrashIcon', ProgressRing: 'ProgressRing', EmptyState: 'EmptyState' }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const goal = (id: string): Goal => ({ id, title: id, kind: 'goal', timeframe: 'day', target: 1, weight: 100, startDate: '2026-09-26', endDate: null } as Goal);

describe('editor safety', () => {
  test('changing live input data cannot delete IDs outside the original editing snapshot', async () => {
    const onSave = jest.fn();
    const props = { scope: 'day' as const, existing: [goal('a')], defaultStart: '2026-09-26', onSave, onCancel: jest.fn() };
    let tree: any;
    await act(async () => { tree = create(<HorizonEditor {...props} />); });
    await act(async () => { tree.update(<HorizonEditor {...props} existing={[goal('b')]} />); });
    await act(async () => { tree.root.findAllByType('Button')[0].props.onPress(); });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ deletes: [], updates: [expect.objectContaining({ id: 'a' })] }));
    await act(async () => { tree.unmount(); });
  });
  test('saving locks inputs, cancel and all editor actions', async () => {
    const onSave = jest.fn();
    let tree: any;
    await act(async () => { tree = create(<HorizonEditor scope="day" existing={[goal('a')]} defaultStart="2026-09-26" onSave={onSave} onCancel={jest.fn()} saving />); });
    for (const input of tree.root.findAllByType('Input')) expect(input.props.editable).toBe(false);
    for (const button of tree.root.findAllByType('Pressable')) expect(button.props.disabled).toBe(true);
    expect(tree.root.findAllByType('Button')[1].props.disabled).toBe(true);
    await act(async () => { tree.root.findAllByType('Button')[0].props.onPress(); });
    expect(onSave).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });
  test('calendar navigation locks while editing and mutation errors are visible', async () => {
    const noop = jest.fn();
    const cal = { today: '2026-09-26', refDate: '2026-09-25', scope: 'day' as const, setScope: noop, setRefDate: noop, weekDays: ['2026-09-25'], stepPeriod: noop, goToday: noop };
    let tree: any;
    await act(async () => { tree = create(<CalendarScaffold cal={cal} rings={{ day: 0, week: 0, month: 0 }} daysWithProgress={new Set()} onSelectScope={noop} navigationDisabled isError={false} refetch={noop} isRefetching={false} saveError="Deletion failed"><></></CalendarScaffold>); });
    const actions = tree.root.findAllByType('Pressable');
    expect(actions.length).toBe(8);
    for (const button of actions.slice(0, -1)) expect(button.props.disabled).toBe(true);
    expect(tree.root.findAllByType('Text').some((node: any) => node.props.children === 'Deletion failed')).toBe(true);
    await act(async () => { tree.unmount(); });
  });
  test('horizontal swipes step one period without capturing vertical scrolling or disabled navigation', async () => {
    const stepPeriod = jest.fn();
    const noop = jest.fn();
    const cal = { today: '2026-09-26', refDate: '2026-09-26', scope: 'week' as const, setScope: noop, setRefDate: noop,
      weekDays: ['2026-09-26'], stepPeriod, goToday: noop };
    const props = { cal, rings: { day: 0, week: 0, month: 0 }, daysWithProgress: new Set<string>(),
      onSelectScope: noop, isError: false, refetch: noop, isRefetching: false };
    let tree: any;
    await act(async () => { tree = create(<CalendarScaffold {...props}><></></CalendarScaffold>); });
    const handlers = tree.root.findAllByType('View')[0].props;
    expect(handlers.onMoveShouldSetPanResponderCapture(null, { dx: 10, dy: 0 })).toBe(false);
    expect(handlers.onMoveShouldSetPanResponderCapture(null, { dx: 70, dy: 100 })).toBe(false);
    expect(handlers.onMoveShouldSetPanResponderCapture(null, { dx: -70, dy: 5 })).toBe(true);
    await act(async () => { handlers.onPanResponderRelease(null, { dx: -70, dy: 5 }); });
    await act(async () => { handlers.onPanResponderRelease(null, { dx: 75, dy: 5 }); });
    expect(stepPeriod.mock.calls).toEqual([[1], [-1]]);
    await act(async () => { tree.update(<CalendarScaffold {...props} navigationDisabled><></></CalendarScaffold>); });
    const disabledHandlers = tree.root.findAllByType('View')[0].props;
    expect(disabledHandlers.onMoveShouldSetPanResponderCapture(null, { dx: -70, dy: 5 })).toBe(false);
    await act(async () => { disabledHandlers.onPanResponderRelease(null, { dx: -70, dy: 5 }); });
    expect(stepPeriod).toHaveBeenCalledTimes(2);
    await act(async () => { tree.unmount(); });
  });
  test('rejects nonexistent dates, accepts leap dates and decimal comma', () => {
    expect(isRealDate('2026-02-31')).toBe(false);
    expect(isRealDate('2026-13-01')).toBe(false);
    expect(isRealDate('2024-02-29')).toBe(true);
    expect(isRealDate('2026-02-29')).toBe(false);
    expect(parseWeight('33,3')).toBe(33.3);
    for (const weight of ['10abc', 'Infinity', '', '10,2,3']) expect(Number.isNaN(parseWeight(weight))).toBe(true);
  });
});

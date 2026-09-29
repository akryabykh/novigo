import './ui-mocks';
import { jest, test, expect, afterEach } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { ReactElement } from 'react';
import { Button, Input, Stepper, ProgressRing, ProgressBar, EmptyState, SegmentedControl, Badge, Card, Logo, Screen, Skeleton } from '../ui/components';
import { Confetti } from '../ui/components/Confetti';
import { SetupNotice } from '../ui/SetupNotice';
import { GoalRow } from '../features/goals/GoalRow';
import { TaskRow } from '../features/goals/TaskRow';
import { mkGoal, log } from './fixtures';

let tree: ReactTestRenderer;
const render = async (element: ReactElement) => { await act(async () => { tree = create(element); }); return tree!; };
const hosts = (type: string) => tree.root.findAll(node => node.type === type);
afterEach(async () => { if (tree) await act(async () => tree.unmount()); });

test('Button blocks duplicate input while loading or disabled', async () => {
  const onPress = jest.fn();
  await render(<Button title="Save" loading onPress={onPress} />);
  await act(async () => hosts('Pressable')[0].props.onPress());
  expect(onPress).not.toHaveBeenCalled();
  expect(hosts('ActivityIndicator')).toHaveLength(1);
  await act(async () => tree.update(<Button title="Save" onPress={onPress} />));
  await act(async () => hosts('Pressable')[0].props.onPress());
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('Input renders error and forwards change events', async () => {
  const onChangeText = jest.fn();
  await render(<Input label="Name" error="Required" onChangeText={onChangeText} />);
  expect(hosts('Text').some(n => n.props.children === 'Required')).toBe(true);
  await act(async () => hosts('TextInput')[0].props.onChangeText('QA'));
  expect(onChangeText).toHaveBeenCalledWith('QA');
});

test('Stepper clamps numeric entry and +/- at limits', async () => {
  const onChange = jest.fn();
  await render(<Stepper value={2} min={0} max={2} onChange={onChange} />);
  await act(async () => hosts('Pressable')[1].props.onPress());
  expect(onChange).toHaveBeenLastCalledWith(2);
  await act(async () => hosts('TextInput')[0].props.onChangeText('-5'));
  expect(onChange).toHaveBeenLastCalledWith(0);
  await act(async () => hosts('TextInput')[0].props.onChangeText('1,5'));
  expect(onChange).toHaveBeenLastCalledWith(1.5);
});

test('GoalRow caps the selected day at the remaining weekly target and hides controls read-only', async () => {
  const goal = mkGoal({ id: 'g', timeframe: 'week', target: 3 });
  const onSave = jest.fn();
  const props = { goal, logs: [log('g', '2026-09-25', 2)], date: '2026-09-26', onSave };
  await render(<GoalRow {...props} />);
  await act(async () => hosts('Pressable')[1].props.onPress());
  expect(onSave).toHaveBeenCalledWith('g', 1);
  await act(async () => tree.update(<GoalRow {...props} readOnly />));
  expect(hosts('Pressable')).toHaveLength(0);
});

test('TaskRow clears completion on the recorded day and blocks read-only toggle', async () => {
  const task = mkGoal({ id: 't', kind: 'task', timeframe: 'week' });
  const onToggle = jest.fn();
  const props = { task, logs: [log('t', '2026-09-25', 1)], date: '2026-09-26', onToggle };
  await render(<TaskRow {...props} />);
  await act(async () => hosts('Pressable')[0].props.onPress());
  expect(onToggle).toHaveBeenCalledWith([log('t', '2026-09-25', 0)]);
  await act(async () => tree.update(<TaskRow {...props} readOnly />));
  await act(async () => hosts('Pressable')[0].props.onPress());
  expect(onToggle).toHaveBeenCalledTimes(1);
});

test('SegmentedControl and empty-state CTA forward selected actions', async () => {
  const change = jest.fn(), cta = jest.fn();
  await render(<><SegmentedControl segments={[{value:'a',label:'A'},{value:'b',label:'B'}]} value="a" onChange={change} /><EmptyState title="Empty" ctaTitle="Add" onCta={cta} /></>);
  await act(async () => { hosts('Pressable')[1].props.onPress(); hosts('Pressable')[2].props.onPress(); });
  expect(change).toHaveBeenCalledWith('b'); expect(cta).toHaveBeenCalledTimes(1);
});

test('display components render together, clamp progress and handle empty/celebration states', async () => {
  await render(<Screen><Logo /><Card><ProgressRing progress={2} /><ProgressBar progress={-1} /><Badge title="First" emoji="🏆" /><Skeleton /><Confetti run={0} /></Card><SetupNotice /></Screen>);
  expect(hosts('Text').some(n => Array.isArray(n.props.children) && n.props.children[0] === '100')).toBe(true);
  expect(hosts('AnimatedView').some(n => Array.isArray(n.props.style) && n.props.style.some((s: any) => s?.width === '0%'))).toBe(true);
  await act(async () => tree.update(<Confetti run={1} />));
  expect(hosts('AnimatedView')).toHaveLength(28);
});

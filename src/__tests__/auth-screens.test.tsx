import './ui-mocks';
import { jest, test, expect, afterEach } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginScreen from '../app/(auth)/login';
import RegisterScreen from '../app/(auth)/register';
import CompleteProfileScreen from '../app/(auth)/complete-profile';
import ForgotPasswordScreen from '../app/(auth)/forgot-password';
import ProfileScreen from '../app/(app)/(tabs)/profile';
import { Input, Button } from '../ui/components';
import type { ReactElement } from 'react';

const mockSignIn = jest.fn<() => Promise<void>>();
const mockSignUp = jest.fn<() => Promise<void>>();
const mockReset = jest.fn<() => Promise<void>>();
const mockComplete = jest.fn<() => Promise<unknown>>();
const mockMutate = jest.fn();
const mockSignOut = jest.fn<() => Promise<void>>();
const mockSavePreferences = jest.fn<() => Promise<void>>();
jest.mock('expo-router', () => ({ Link: 'Link', useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('../features/auth/auth-provider', () => ({ useAuth: () => ({
  user: { id:'u1', email:'qa@novigo.test' }, signInWithPassword: mockSignIn, signUpWithPassword: mockSignUp,
  sendPasswordReset: mockReset, completeProfile: mockComplete, updatePassword: jest.fn(), signOut: mockSignOut,
}) }));
jest.mock('../features/queries', () => ({
  useProfile: () => ({ data: { firstName:'QA', lastName:'Local' } }),
  useUpdateNames: () => ({ mutate:mockMutate, isPending:false }),
}));
jest.mock('../features/preferences/FeaturePreferences', () => ({
  useFeaturePreferences: () => ({ preferences: { showGoals: false }, ready: true, save: mockSavePreferences }),
}));
let tree: ReactTestRenderer;
let qc: QueryClient;
async function render(element: ReactElement) {
  qc = new QueryClient({defaultOptions:{queries:{gcTime:Infinity}}});
  await act(async () => { tree = create(<QueryClientProvider client={qc}>{element}</QueryClientProvider>); });
}
async function input(label: string, value: string) {
  await act(async () => tree.root.findAllByType(Input).find(n=>n.props.label===label)!.props.onChangeText(value));
}
async function press(title: string) {
  await act(async () => { await tree.root.findAllByType(Button).find(n=>n.props.title===title)!.props.onPress(); });
}
const text = () => tree.root.findAll(n=>String(n.type)==='Text').map(n=>n.props.children).flat().filter(v=>typeof v==='string').join(' ');
afterEach(async () => { if(tree)await act(async()=>tree.unmount()); qc?.clear(); jest.clearAllMocks(); });

test('login rejects invalid email without a network request and shows rejected credentials', async()=>{
  await render(<LoginScreen />); await press('Войти');
  expect(text()).toContain('Введите email'); expect(mockSignIn).not.toHaveBeenCalled();
  await input('Email','qa@novigo.test'); await input('Пароль','test-password');
  mockSignIn.mockRejectedValue(new Error('Invalid login credentials'));
  await press('Войти'); expect(text()).toContain('Неверный email или пароль');
  expect(tree.root.findAllByType(Button)[0].props.loading).toBe(false);
});
test('registration blocks mismatched passwords and missing first name',async()=>{
  await render(<RegisterScreen />); await input('Email','qa@novigo.test'); await input('Пароль','test-password');
  await input('Повторите пароль','different-password'); await press('Создать аккаунт');
  expect(text()).toContain('Пароли не совпадают');
  await input('Повторите пароль','test-password'); await press('Создать аккаунт');
  expect(text()).toContain('Имя обязательно'); expect(mockSignUp).not.toHaveBeenCalled();
});
test('incomplete profile rejects blank name; recovery displays send error', async()=>{
  await render(<CompleteProfileScreen />); await press('Готово');
  expect(text()).toContain('Имя обязательно'); expect(mockComplete).not.toHaveBeenCalled();
  await act(async()=>tree.unmount()); await render(<ForgotPasswordScreen />);
  await input('Email','qa@novigo.test'); mockReset.mockRejectedValue(new Error('offline'));
  await press('Отправить ссылку'); expect(text()).toContain('offline');
});
test('profile validates name and passwords without making invalid writes',async()=>{
  await render(<ProfileScreen />); await input('Имя','   '); await press('Сохранить');
  expect(text()).toContain('Имя обязательно'); expect(mockMutate).not.toHaveBeenCalled();
  await input('Новый пароль','short'); await press('Обновить пароль');
  expect(text()).toContain('Минимум 8 символов');
  await input('Новый пароль','test-password'); await input('Повторите пароль','different-password');
  await press('Обновить пароль'); expect(text()).toContain('Пароли не совпадают');
});


test('profile saves trimmed names and clears success when the draft changes', async()=>{
  await render(<ProfileScreen />); await input('Имя','  QA  '); await press('Сохранить');
  expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({firstName:'QA'}),expect.any(Object));
  const callbacks = mockMutate.mock.calls[0][1] as {onSuccess:()=>void};
  await act(async()=>callbacks.onSuccess()); expect(text()).toContain('Сохранено');
  await input('Имя','Unsaved'); expect(text()).not.toContain('Сохранено');
});

test('goals tab preference changes only after pressing Save settings', async()=>{
  mockSavePreferences.mockResolvedValue(undefined);
  await render(<ProfileScreen />);
  await act(async()=>tree.root.findAll(n=>String(n.type)==='Switch')[0].props.onValueChange(true));
  expect(mockSavePreferences).not.toHaveBeenCalled();
  await press('Сохранить настройки');
  expect(mockSavePreferences).toHaveBeenCalledWith({showGoals:true});
});

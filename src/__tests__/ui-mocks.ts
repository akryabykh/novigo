// Component contracts run with real React state and handlers; native hosts and
// animation drivers are replaced. Browser/device rendering is a separate check.
import { jest } from '@jest/globals';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable',
  ScrollView: 'ScrollView', RefreshControl: 'RefreshControl', ActivityIndicator: 'ActivityIndicator',
  Platform: { OS: 'web', select: (x: Record<string, unknown>) => x.web ?? x.default },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  StyleSheet: { create: (styles: unknown) => styles, flatten: (styles: unknown) => styles },
}));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView', SafeAreaProvider: 'SafeAreaProvider' }));
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Circle: 'Circle', Path: 'Path', Polyline: 'Polyline', Line: 'Line' }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'AnimatedView', createAnimatedComponent: (component: unknown) => component },
  useSharedValue: (value: unknown) => ({ value }),
  useAnimatedProps: (fn: () => unknown) => fn(), useAnimatedStyle: (fn: () => unknown) => fn(),
  withTiming: (value: unknown) => value, withRepeat: (value: unknown) => value,
  Easing: { out: (x: unknown) => x, inOut: (x: unknown) => x, cubic: 1, quad: 1, ease: 1 },
}));
jest.mock('../ui/theme-provider', () => ({
  useColors: () => jest.requireActual<typeof import('../ui/theme')>('../ui/theme').colorsFor('light'),
  useTheme: () => ({ scheme: 'light', preference: 'system', setPreference: jest.fn() }),
}));

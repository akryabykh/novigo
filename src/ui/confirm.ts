// Cross-platform confirmation dialog. react-native-web's Alert is unreliable, so
// on web we use window.confirm; on native we use the RN Alert with two buttons.
import { Alert, Platform } from 'react-native';

export function confirmAction(
  message: string,
  opts: { title?: string; confirmLabel?: string } = {},
): Promise<boolean> {
  const { title = 'Удалить?', confirmLabel = 'Удалить' } = opts;

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') return Promise.resolve(true);
    return Promise.resolve(window.confirm(message));
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Отмена', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

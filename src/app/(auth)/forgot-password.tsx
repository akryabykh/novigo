import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { emailSchema } from '../../core/validation';
import { useAuth } from '../../features/auth/auth-provider';
import { Button, Input, Logo, Screen, Text } from '../../ui/components';
import { spacing } from '../../ui/theme';

export default function ForgotPasswordScreen() {
  const { sendPasswordReset } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setError(null);
    const p = emailSchema.safeParse(email);
    if (!p.success) return setError(p.error.issues[0].message);
    setLoading(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (e: any) {
      setError(e?.message ?? 'Не удалось отправить письмо');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={{ paddingTop: spacing['3xl'], gap: spacing.sm }}>
        <Logo size={30} />
        <Text variant="title">Сброс пароля</Text>
        <Text variant="body" tone="muted">
          {sent
            ? 'Если такой email есть — мы отправили ссылку для сброса. Откройте её и задайте новый пароль.'
            : 'Укажите email, и мы пришлём ссылку для восстановления.'}
        </Text>
      </View>

      {!sent && (
        <View style={{ gap: spacing.lg, marginTop: spacing.lg }}>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com"
            autoFocus
          />
          {error ? (
            <Text variant="caption" tone="danger">
              {error}
            </Text>
          ) : null}
          <Button title="Отправить ссылку" onPress={submit} loading={loading} />
        </View>
      )}

      <View style={{ alignItems: 'center', marginTop: spacing.xl }}>
        <Text variant="label" tone="accent" onPress={() => router.replace('/(auth)/login')}>
          Вернуться ко входу
        </Text>
      </View>
    </Screen>
  );
}

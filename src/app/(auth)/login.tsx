import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { emailSchema } from '../../core/validation';
import { useAuth } from '../../features/auth/auth-provider';
import { Button, Input, Logo, Screen, Text } from '../../ui/components';
import { spacing } from '../../ui/theme';

export default function LoginScreen() {
  const { signInWithPassword, enterAdmin } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    // local admin / preview mode (day-scrubber demo) — bypasses Supabase
    if (email.trim().toLowerCase() === 'admin' && password === '1111') {
      enterAdmin();
      router.replace('/(admin)');
      return;
    }
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    if (!password) return setError('Введите пароль');
    setLoading(true);
    try {
      await signInWithPassword(email, password);
      // gate redirects on session change
    } catch (e: any) {
      setError(
        e?.message?.includes('Invalid login')
          ? 'Неверный email или пароль'
          : e?.message ?? 'Не удалось войти',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={{ paddingTop: spacing['3xl'], gap: spacing.sm }}>
        <Logo size={34} />
        <Text variant="title">С возвращением</Text>
        <Text variant="body" tone="muted">
          Войдите, чтобы продолжить движение к целям.
        </Text>
      </View>

      <View style={{ gap: spacing.lg, marginTop: spacing.lg }}>
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          placeholder="you@example.com"
        />
        <Input
          label="Пароль"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          placeholder="••••••••"
          onSubmitEditing={submit}
        />
        {error ? (
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        ) : null}
        <Button title="Войти" onPress={submit} loading={loading} />

        <View style={{ alignItems: 'center', gap: spacing.md, marginTop: spacing.sm }}>
          <Link href="/(auth)/forgot-password">
            <Text variant="label" tone="accent">
              Забыли пароль?
            </Text>
          </Link>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          gap: spacing.xs,
          marginTop: spacing.xl,
        }}>
        <Text variant="label" tone="muted">
          Нет аккаунта?
        </Text>
        <Text variant="label" tone="accent" onPress={() => router.push('/(auth)/register')}>
          Создать
        </Text>
      </View>
    </Screen>
  );
}

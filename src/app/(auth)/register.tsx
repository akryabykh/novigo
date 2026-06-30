import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { qk } from '../../core/query';
import { emailSchema, nameSchema, passwordSchema } from '../../core/validation';
import { useAuth } from '../../features/auth/auth-provider';
import { Button, Input, Logo, Screen, Text } from '../../ui/components';
import { spacing } from '../../ui/theme';

export default function RegisterScreen() {
  const { signUpWithPassword, completeProfile, user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);

    const e = emailSchema.safeParse(email);
    if (!e.success) return setError(e.error.issues[0].message);
    const p = passwordSchema.safeParse(password);
    if (!p.success) return setError(p.error.issues[0].message);
    if (password !== confirm) return setError('Пароли не совпадают');
    const n = nameSchema.safeParse({ firstName, lastName, middleName });
    if (!n.success) return setError(n.error.issues[0].message);

    setLoading(true);
    try {
      await signUpWithPassword(email, password);
      await completeProfile({ firstName, lastName, middleName });
      if (user?.id) qc.invalidateQueries({ queryKey: qk.profile(user.id) });
      router.replace('/(app)');
    } catch (err: any) {
      const msg = String(err?.message ?? '');
      if (msg.toLowerCase().includes('already') || msg.includes('registered')) {
        setError('Этот email уже зарегистрирован — войдите.');
      } else {
        setError(msg || 'Не удалось создать аккаунт');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={{ paddingTop: spacing['2xl'], gap: spacing.sm }}>
        <Logo size={34} />
        <Text variant="title">Создать аккаунт</Text>
        <Text variant="body" tone="muted">
          Пара полей — и можно ставить первые цели.
        </Text>
      </View>

      <View style={{ gap: spacing.lg, marginTop: spacing.md }}>
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
        />
        <Input
          label="Пароль"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="минимум 8 символов"
        />
        <Input
          label="Повторите пароль"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          placeholder="••••••••"
        />
        <Input label="Имя" value={firstName} onChangeText={setFirstName} placeholder="Артём" />
        <Input
          label="Фамилия"
          value={lastName}
          onChangeText={setLastName}
          placeholder="(необязательно)"
        />
        <Input
          label="Отчество"
          value={middleName}
          onChangeText={setMiddleName}
          placeholder="(необязательно)"
        />

        {error ? (
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        ) : null}

        <Button title="Создать аккаунт" onPress={submit} loading={loading} />
      </View>

      <View style={{ alignItems: 'center', marginTop: spacing.lg }}>
        <Text variant="label" tone="muted" onPress={() => router.replace('/(auth)/login')}>
          Уже есть аккаунт?{' '}
          <Text tone="accent" variant="label">
            Войти
          </Text>
        </Text>
      </View>
    </Screen>
  );
}

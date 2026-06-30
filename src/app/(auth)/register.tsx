import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { qk } from '../../core/query';
import { emailSchema, nameSchema, otpSchema, passwordSchema } from '../../core/validation';
import { useAuth } from '../../features/auth/auth-provider';
import { Button, Input, Logo, ProgressBar, Screen, Text } from '../../ui/components';
import { spacing } from '../../ui/theme';

type Step = 'email' | 'code' | 'password' | 'name';
const ORDER: Step[] = ['email', 'code', 'password', 'name'];

export default function RegisterScreen() {
  const { sendSignupCode, verifySignupCode, setPassword, completeProfile, user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword2] = useState('');
  const [confirm, setConfirm] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setLoading(true);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message ?? 'Что-то пошло не так');
    } finally {
      setLoading(false);
    }
  };

  const onEmail = () => {
    const p = emailSchema.safeParse(email);
    if (!p.success) return setError(p.error.issues[0].message);
    run(async () => {
      await sendSignupCode(email);
      setStep('code');
    });
  };

  const onCode = () => {
    const p = otpSchema.safeParse(code);
    if (!p.success) return setError(p.error.issues[0].message);
    run(async () => {
      await verifySignupCode(email, code);
      setStep('password');
    });
  };

  const onPassword = () => {
    const p = passwordSchema.safeParse(password);
    if (!p.success) return setError(p.error.issues[0].message);
    if (password !== confirm) return setError('Пароли не совпадают');
    run(async () => {
      await setPassword(password);
      setStep('name');
    });
  };

  const onName = () => {
    const p = nameSchema.safeParse({ firstName, lastName, middleName });
    if (!p.success) return setError(p.error.issues[0].message);
    run(async () => {
      await completeProfile({ firstName, lastName, middleName });
      if (user?.id) qc.invalidateQueries({ queryKey: qk.profile(user.id) });
      router.replace('/(app)');
    });
  };

  const idx = ORDER.indexOf(step);

  return (
    <Screen>
      <View style={{ paddingTop: spacing['2xl'], gap: spacing.md }}>
        <Logo size={30} />
        <ProgressBar progress={(idx + 1) / ORDER.length} />
      </View>

      {step === 'email' && (
        <View style={{ gap: spacing.lg }}>
          <Header title="Создать аккаунт" subtitle="Начнём с email — пришлём код подтверждения." />
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com"
            autoFocus
          />
          <ErrorText error={error} />
          <Button title="Отправить код" onPress={onEmail} loading={loading} />
        </View>
      )}

      {step === 'code' && (
        <View style={{ gap: spacing.lg }}>
          <Header title="Введите код" subtitle={`Мы отправили 6 цифр на ${email}.`} />
          <Input
            label="Код из письма"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="123456"
            autoFocus
          />
          <ErrorText error={error} />
          <Button title="Подтвердить" onPress={onCode} loading={loading} />
          <Text
            variant="label"
            tone="accent"
            style={{ textAlign: 'center' }}
            onPress={() => run(async () => sendSignupCode(email))}>
            Отправить код снова
          </Text>
        </View>
      )}

      {step === 'password' && (
        <View style={{ gap: spacing.lg }}>
          <Header title="Придумайте пароль" subtitle="Минимум 8 символов." />
          <Input
            label="Пароль"
            value={password}
            onChangeText={setPassword2}
            secureTextEntry
            placeholder="••••••••"
            autoFocus
          />
          <Input
            label="Повторите пароль"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            placeholder="••••••••"
          />
          <ErrorText error={error} />
          <Button title="Далее" onPress={onPassword} loading={loading} />
        </View>
      )}

      {step === 'name' && (
        <View style={{ gap: spacing.lg }}>
          <Header title="Как вас зовут?" subtitle="Имя обязательно, остальное — по желанию." />
          <Input label="Имя" value={firstName} onChangeText={setFirstName} placeholder="Артём" autoFocus />
          <Input label="Фамилия" value={lastName} onChangeText={setLastName} placeholder="(необязательно)" />
          <Input
            label="Отчество"
            value={middleName}
            onChangeText={setMiddleName}
            placeholder="(необязательно)"
          />
          <ErrorText error={error} />
          <Button title="Готово" onPress={onName} loading={loading} />
        </View>
      )}

      <View style={{ alignItems: 'center', marginTop: spacing.md }}>
        <Text variant="label" tone="muted" onPress={() => router.replace('/(auth)/login')}>
          Уже есть аккаунт? <Text tone="accent" variant="label">Войти</Text>
        </Text>
      </View>
    </Screen>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
      <Text variant="title">{title}</Text>
      <Text variant="body" tone="muted">
        {subtitle}
      </Text>
    </View>
  );
}

function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <Text variant="caption" tone="danger">
      {error}
    </Text>
  );
}

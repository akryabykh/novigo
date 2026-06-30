// Reached when a session exists but the profile row is missing
// (e.g. signup abandoned before the name step). Collects the name only.
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { qk } from '../../core/query';
import { nameSchema } from '../../core/validation';
import { useAuth } from '../../features/auth/auth-provider';
import { Button, Input, Logo, Screen, Text } from '../../ui/components';
import { spacing } from '../../ui/theme';

export default function CompleteProfileScreen() {
  const { completeProfile, signOut } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    const p = nameSchema.safeParse({ firstName, lastName, middleName });
    if (!p.success) return setError(p.error.issues[0].message);
    setLoading(true);
    try {
      const profile = await completeProfile({ firstName, lastName, middleName });
      qc.setQueryData(qk.profile(profile.id), profile);
      router.replace('/(app)');
    } catch (e: any) {
      setError(e?.message ?? 'Не удалось сохранить');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={{ paddingTop: spacing['3xl'], gap: spacing.sm }}>
        <Logo size={30} />
        <Text variant="title">Последний шаг</Text>
        <Text variant="body" tone="muted">
          Как вас зовут? Имя обязательно, остальное — по желанию.
        </Text>
      </View>
      <View style={{ gap: spacing.lg, marginTop: spacing.lg }}>
        <Input label="Имя" value={firstName} onChangeText={setFirstName} placeholder="Артём" autoFocus />
        <Input label="Фамилия" value={lastName} onChangeText={setLastName} placeholder="(необязательно)" />
        <Input label="Отчество" value={middleName} onChangeText={setMiddleName} placeholder="(необязательно)" />
        {error ? (
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        ) : null}
        <Button title="Готово" onPress={submit} loading={loading} />
        <Text variant="label" tone="muted" style={{ textAlign: 'center' }} onPress={() => signOut()}>
          Выйти
        </Text>
      </View>
    </Screen>
  );
}

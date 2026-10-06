import { useState } from 'react';
import { Switch, View } from 'react-native';

import { nameSchema, passwordSchema } from '../../../core/validation';
import { useAuth } from '../../../features/auth/auth-provider';
import { useProfile, useUpdateNames } from '../../../features/queries';
import { useFeaturePreferences } from '../../../features/preferences/FeaturePreferences';
import {
  Button,
  Card,
  Input,
  SegmentedControl,
  Screen,
  Text,
} from '../../../ui/components';
import { radius, spacing } from '../../../ui/theme';
import { useColors, useTheme, type ThemePreference } from '../../../ui/theme-provider';

const THEME_SEGMENTS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
  { value: 'system', label: 'Система' },
];

export default function ProfileScreen() {
  const c = useColors();
  const { preference, setPreference } = useTheme();
  const { user, signOut, updatePassword } = useAuth();
  const uid = user?.id;
  const { data: profile } = useProfile(uid);
  const updateNames = useUpdateNames(uid);
  const { preferences, ready: preferencesReady, save: savePreferences } = useFeaturePreferences();
  const [showGoalsOverride, setShowGoalsOverride] = useState<boolean | null>(null);
  const showGoalsDraft = showGoalsOverride ?? preferences.showGoals;
  const [showStatisticsOverride, setShowStatisticsOverride] = useState<boolean | null>(null);
  const showStatisticsDraft = showStatisticsOverride ?? preferences.showStatistics;
  const [showCounterOverride, setShowCounterOverride] = useState<boolean | null>(null);
  const showCounterDraft = showCounterOverride ?? preferences.showCounter;
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesMessage, setPreferencesMessage] = useState<string | null>(null);
  const saveDisplay = async () => {
    setPreferencesSaving(true);
    setPreferencesMessage(null);
    try {
      await savePreferences({ showGoals: showGoalsDraft, showStatistics: showStatisticsDraft, showCounter: showCounterDraft });
      setShowGoalsOverride(null);
      setShowStatisticsOverride(null);
      setShowCounterOverride(null);
      setPreferencesMessage('Сохранено');
    } catch { setPreferencesMessage('Не удалось сохранить настройки'); }
    finally { setPreferencesSaving(false); }
  };

  // Edited fields are stored as overrides on top of the loaded profile,
  // so we never sync server data into state via an effect.
  const [draft, setDraft] = useState<{ firstName?: string; lastName?: string; middleName?: string }>({});
  const firstName = draft.firstName ?? profile?.firstName ?? '';
  const lastName = draft.lastName ?? profile?.lastName ?? '';
  const middleName = draft.middleName ?? profile?.middleName ?? '';
  const setFirstName = (v: string) => { setNameMsg(null); setNameErr(null); setDraft((d) => ({ ...d, firstName: v })); };
  const setLastName = (v: string) => { setNameMsg(null); setNameErr(null); setDraft((d) => ({ ...d, lastName: v })); };
  const setMiddleName = (v: string) => { setNameMsg(null); setNameErr(null); setDraft((d) => ({ ...d, middleName: v })); };
  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const [nameErr, setNameErr] = useState<string | null>(null);

  const saveNames = () => {
    setNameErr(null);
    setNameMsg(null);
    const p = nameSchema.safeParse({ firstName, lastName, middleName });
    if (!p.success) return setNameErr(p.error.issues[0].message);
    updateNames.mutate(
      p.data,
      {
        onSuccess: () => setNameMsg('Сохранено'),
        onError: (e: any) => setNameErr(e?.message ?? 'Не удалось сохранить'),
      },
    );
  };

  // password change
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);
  const [pwdErr, setPwdErr] = useState<string | null>(null);
  const [pwdLoading, setPwdLoading] = useState(false);

  const changePassword = async () => {
    setPwdErr(null);
    setPwdMsg(null);
    const p = passwordSchema.safeParse(pwd);
    if (!p.success) return setPwdErr(p.error.issues[0].message);
    if (pwd !== pwd2) return setPwdErr('Пароли не совпадают');
    setPwdLoading(true);
    try {
      await updatePassword(pwd);
      setPwd('');
      setPwd2('');
      setPwdMsg('Пароль обновлён');
    } catch (e: any) {
      setPwdErr(e?.message ?? 'Не удалось изменить пароль');
    } finally {
      setPwdLoading(false);
    }
  };

  const initials =
    (profile?.firstName?.[0] ?? '') + (profile?.lastName?.[0] ?? '');

  return (
    <Screen>
      <View style={{ paddingTop: spacing.md }}>
        <Text variant="title">Профиль</Text>
      </View>

      {/* identity */}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: radius.full,
              backgroundColor: c.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Text variant="heading" tone="accent">
              {initials.toUpperCase() || '🙂'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="heading" numberOfLines={1}>
              {[profile?.lastName, profile?.firstName, profile?.middleName]
                .filter(Boolean)
                .join(' ') || profile?.firstName}
            </Text>
            <Text variant="caption" tone="faint" numberOfLines={1}>
              {user?.email}
            </Text>
          </View>
        </View>
      </Card>

      {/* names */}
      <Text variant="heading">Имя</Text>
      <Card>
        <View style={{ gap: spacing.md }}>
          <Input editable={!updateNames.isPending} label="Имя" value={firstName} onChangeText={setFirstName} />
          <Input editable={!updateNames.isPending} label="Фамилия" value={lastName} onChangeText={setLastName} />
          <Input editable={!updateNames.isPending} label="Отчество" value={middleName} onChangeText={setMiddleName} />
          {nameErr ? (
            <Text variant="caption" tone="danger">
              {nameErr}
            </Text>
          ) : nameMsg ? (
            <Text variant="caption" tone="success">
              {nameMsg}
            </Text>
          ) : null}
          <Button title="Сохранить" onPress={saveNames} loading={updateNames.isPending} size="md" />
        </View>
      </Card>

      {/* password */}
      <Text variant="heading">Смена пароля</Text>
      <Card>
        <View style={{ gap: spacing.md }}>
          <Input label="Новый пароль" value={pwd} onChangeText={setPwd} secureTextEntry placeholder="••••••••" />
          <Input
            label="Повторите пароль"
            value={pwd2}
            onChangeText={setPwd2}
            secureTextEntry
            placeholder="••••••••"
          />
          {pwdErr ? (
            <Text variant="caption" tone="danger">
              {pwdErr}
            </Text>
          ) : pwdMsg ? (
            <Text variant="caption" tone="success">
              {pwdMsg}
            </Text>
          ) : null}
          <Button title="Обновить пароль" onPress={changePassword} loading={pwdLoading} size="md" />
        </View>
      </Card>

      {/* appearance */}
      <Text variant="heading">Разделы приложения</Text>
      <Card>
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Text variant="label" style={{ flex: 1 }}>Показывать «Цели» в нижней панели</Text>
            <Switch value={showGoalsDraft} onValueChange={setShowGoalsOverride} disabled={!preferencesReady || preferencesSaving} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Text variant="label" style={{ flex: 1 }}>Показывать «Статистику» в нижней панели</Text>
            <Switch value={showStatisticsDraft} onValueChange={setShowStatisticsOverride} disabled={!preferencesReady || preferencesSaving} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Text variant="label" style={{ flex: 1 }}>Показывать «Счётчик» в нижней панели</Text>
            <Switch value={showCounterDraft} onValueChange={setShowCounterOverride} disabled={!preferencesReady || preferencesSaving} />
          </View>
          {preferencesMessage ? <Text variant="caption">{preferencesMessage}</Text> : null}
          <Button title="Сохранить настройки" size="md" onPress={saveDisplay} loading={preferencesSaving} disabled={!preferencesReady} />
        </View>
      </Card>

      <Text variant="heading">Тема</Text>
      <SegmentedControl segments={THEME_SEGMENTS} value={preference} onChange={setPreference} />

      <View style={{ marginTop: spacing.lg }}>
        <Button title="Выйти" variant="secondary" onPress={() => signOut()} />
      </View>
    </Screen>
  );
}

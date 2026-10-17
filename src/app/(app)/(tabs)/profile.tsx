import { useState } from 'react';
import { Image, Platform, Pressable, Switch, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { deleteAvatar, getAvatarUrl, uploadAvatar } from '../../../core/data/avatar-repo';
import { nameSchema, passwordSchema } from '../../../core/validation';
import { useAuth } from '../../../features/auth/auth-provider';
import { useProfile, useUpdateNames } from '../../../features/queries';
import { FEATURE_TABS, FEATURE_TAB_LABELS, useFeaturePreferences, type FeatureTab } from '../../../features/preferences/FeaturePreferences';
import { prepareAvatar } from '../../../features/profile/avatar-image';
import { StatisticsContent } from '../../../features/statistics/StatisticsContent';
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
import { confirmAction } from '../../../ui/confirm';

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
  const qc = useQueryClient();
  const { data: profile } = useProfile(uid);
  const avatarKey = ['profile-avatar', uid];
  const { data: avatarUrl } = useQuery({ queryKey: avatarKey, enabled: !!uid,
    queryFn: () => getAvatarUrl(uid!), staleTime: 30 * 60 * 1000,
    refetchInterval: 45 * 60 * 1000, retry: 1 });
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const chooseAvatar = () => {
    if (!uid || avatarBusy) return;
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      setAvatarError('Выбор фото пока доступен в веб-приложении');
      return;
    }
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/*';
    picker.style.display = 'none';
    document.body.appendChild(picker);
    picker.addEventListener('cancel', () => picker.remove(), { once: true });
    picker.onchange = async () => {
      const file = picker.files?.[0];
      picker.remove();
      if (!file) return;
      setAvatarBusy(true);
      setAvatarError(null);
      try {
        const photo = await prepareAvatar(file);
        const url = await uploadAvatar(uid, photo);
        qc.setQueryData(avatarKey, url);
      } catch (error) {
        setAvatarError(error instanceof Error ? error.message : 'Не удалось загрузить фото');
      } finally { setAvatarBusy(false); }
    };
    picker.click();
  };
  const removeAvatar = async () => {
    if (!uid || avatarBusy || !(await confirmAction('Убрать фото профиля?'))) return;
    setAvatarBusy(true);
    setAvatarError(null);
    try { await deleteAvatar(uid); qc.setQueryData(avatarKey, null); }
    catch (error) { setAvatarError(error instanceof Error ? error.message : 'Не удалось убрать фото'); }
    finally { setAvatarBusy(false); }
  };
  const updateNames = useUpdateNames(uid);
  const { preferences, ready: preferencesReady, save: savePreferences } = useFeaturePreferences();
  const [tabsOverride, setTabsOverride] = useState<FeatureTab[] | null>(null);
  const tabsDraft = tabsOverride ?? preferences.tabs;
  const displayedTabs = [...tabsDraft, ...FEATURE_TABS.filter((tab) => !tabsDraft.includes(tab))];
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesMessage, setPreferencesMessage] = useState<string | null>(null);
  const toggleTab = (tab: FeatureTab, enabled: boolean) => {
    setPreferencesMessage(null);
    setTabsOverride(enabled ? [...tabsDraft, tab] : tabsDraft.filter((item) => item !== tab));
  };
  const moveTab = (tab: FeatureTab, direction: -1 | 1) => {
    const from = tabsDraft.indexOf(tab);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= tabsDraft.length) return;
    const next = [...tabsDraft];
    [next[from], next[to]] = [next[to], next[from]];
    setPreferencesMessage(null);
    setTabsOverride(next);
  };
  const saveDisplay = async () => {
    setPreferencesSaving(true);
    setPreferencesMessage(null);
    try {
      await savePreferences({ tabs: tabsDraft });
      setTabsOverride(null);
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
              overflow: 'hidden',
              backgroundColor: c.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            {avatarUrl ? <Image source={{ uri: avatarUrl }} style={{ width: 60, height: 60 }} />
              : <Text variant="heading" tone="accent">{initials.toUpperCase() || '🙂'}</Text>}
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
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <View style={{ flex: 1 }}><Button title={avatarUrl ? 'Изменить фото' : 'Поставить фото'} size="md"
            variant="secondary" onPress={chooseAvatar} loading={avatarBusy} /></View>
          {avatarUrl ? <Button title="Убрать" size="md" variant="ghost" fullWidth={false}
            onPress={() => { void removeAvatar(); }} disabled={avatarBusy} /> : null}
        </View>
        {avatarError ? <Text variant="caption" tone="danger" style={{ marginTop: spacing.sm }}>{avatarError}</Text> : null}
      </Card>

      <StatisticsContent />

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
      <Text variant="heading">Нижняя панель</Text>
      <Card>
        <View style={{ gap: spacing.md }}>
          <Text variant="caption" tone="muted">Выбери от одного до трёх разделов. «Профиль» всегда остаётся в панели. Стрелки меняют порядок значков.</Text>
          {displayedTabs.map((tab) => {
            const index = tabsDraft.indexOf(tab);
            const enabled = index >= 0;
            return <View key={tab} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 }}>
              <Text variant="label" style={{ flex: 1 }}>{FEATURE_TAB_LABELS[tab]}</Text>
              {enabled && <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Поднять ${FEATURE_TAB_LABELS[tab]}`}
                  disabled={index === 0 || preferencesSaving} onPress={() => moveTab(tab, -1)}
                  style={{ padding: spacing.xs, opacity: index === 0 ? 0.3 : 1 }}>
                  <Text variant="label">↑</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Опустить ${FEATURE_TAB_LABELS[tab]}`}
                  disabled={index === tabsDraft.length - 1 || preferencesSaving} onPress={() => moveTab(tab, 1)}
                  style={{ padding: spacing.xs, opacity: index === tabsDraft.length - 1 ? 0.3 : 1 }}>
                  <Text variant="label">↓</Text>
                </Pressable>
              </View>}
              <Switch accessibilityLabel={FEATURE_TAB_LABELS[tab]} value={enabled}
                onValueChange={(value) => toggleTab(tab, value)}
                disabled={!preferencesReady || preferencesSaving || (enabled && tabsDraft.length === 1) || (!enabled && tabsDraft.length === 3)} />
            </View>;
          })}
          <Text variant="caption" tone="muted">Значков снизу: {tabsDraft.length + 1} из 4</Text>
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

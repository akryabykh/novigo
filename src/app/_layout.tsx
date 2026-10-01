import '../global.css';

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { isSupabaseConfigured } from '../core/data';
import { queryClient } from '../core/query';
import { AuthProvider, useAuth } from '../features/auth/auth-provider';
import { useProfile } from '../features/queries';
import { OfflineStatus } from '../features/offline/OfflineStatus';
import { EmptyState } from '../ui/components';
import { SetupNotice } from '../ui/SetupNotice';
import { spacing } from '../ui/theme';
import { ThemeProvider, useColors, useTheme } from '../ui/theme-provider';

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootGate() {
  const { session, initializing } = useAuth();
  const uid = session?.user?.id;
  const { data: profile, isLoading: profileLoading, isError: profileError, refetch: refetchProfile } = useProfile(uid);
  const segments = useSegments();
  const router = useRouter();
  const c = useColors();

  useEffect(() => {
    if (initializing) return;
    const inAuthGroup = segments[0] === '(auth)';

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/login');
      return;
    }
    // Don't route while the profile is loading OR errored. A network error must
    // NOT be treated as "no profile" — that would wrongly bounce the user to
    // complete-profile. On error we show a retry screen (below) instead.
    if (profileLoading || profileError) return;
    if (!profile) {
      // Session + confirmed no profile row → the name step must finish. The
      // register / complete-profile screens handle it themselves; from anywhere
      // else (e.g. logging in with a profile-less account) force-redirect there.
      const onNameStep = segments.includes('complete-profile') || segments.includes('register');
      if (!onNameStep) router.replace('/(auth)/complete-profile');
      return;
    }
    if (inAuthGroup) router.replace('/(app)');
  }, [session, initializing, profile, profileLoading, profileError, segments, router]);

  // Signed in but the profile request failed (e.g. network) — offer a retry
  // instead of silently redirecting to complete-profile or hanging.
  if (session && profileError) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center', paddingHorizontal: spacing.xl }}>
        <EmptyState
          emoji="⚠️"
          title="Не удалось загрузить профиль"
          subtitle="Сервер не ответил вовремя. Проверь соединение и попробуй ещё раз."
          ctaTitle="Повторить"
          onCta={() => refetchProfile()}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <OfflineStatus uid={uid} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </View>
  );
}

function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  const [fontsLoaded, fontsError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Hide the splash once fonts are ready OR failed to load. Never leave the
  // splash up (or the app blank) forever just because a font request failed —
  // fall back to the system font and show the app.
  useEffect(() => {
    if (fontsLoaded || fontsError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontsError]);

  if (!fontsLoaded && !fontsError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <ThemedStatusBar />
            {isSupabaseConfigured ? (
              <AuthProvider>
                <RootGate />
              </AuthProvider>
            ) : (
              <SetupNotice />
            )}
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

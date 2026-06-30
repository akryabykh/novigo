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
import { SetupNotice } from '../ui/SetupNotice';
import { ThemeProvider, useColors, useTheme } from '../ui/theme-provider';

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootGate() {
  const { session, initializing, admin } = useAuth();
  const uid = session?.user?.id;
  const { data: profile, isLoading: profileLoading } = useProfile(uid);
  const segments = useSegments();
  const router = useRouter();
  const c = useColors();

  useEffect(() => {
    if (admin) {
      if (segments[0] !== '(admin)') router.replace('/(admin)');
      return;
    }
    if (initializing) return;
    const inAuthGroup = segments[0] === '(auth)';

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/login');
      return;
    }
    if (profileLoading) return;
    if (!profile) {
      if (!inAuthGroup) router.replace('/(auth)/complete-profile');
      return;
    }
    if (inAuthGroup) router.replace('/(app)');
  }, [session, initializing, admin, profile, profileLoading, segments, router]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="(admin)" />
      </Stack>
    </View>
  );
}

function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

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

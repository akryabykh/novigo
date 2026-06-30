// Screen — themed page wrapper. Centers + max-width on wide (desktop web).
import { type ReactNode } from 'react';
import { ScrollView, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { spacing } from '../theme';
import { useColors } from '../theme-provider';

const MAX_WIDTH = 560;

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: readonly Edge[];
  contentStyle?: ViewStyle;
}

export function Screen({
  children,
  scroll = true,
  padded = true,
  edges = ['top', 'bottom'],
  contentStyle,
}: ScreenProps) {
  const c = useColors();
  const inner: ViewStyle = {
    width: '100%',
    maxWidth: MAX_WIDTH,
    marginHorizontal: 'auto',
    paddingHorizontal: padded ? spacing.xl : 0,
    paddingBottom: spacing['2xl'],
    gap: spacing.lg,
  };

  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.bg }}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center' }}>
          <View style={[inner, contentStyle]}>{children}</View>
        </ScrollView>
      ) : (
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={[inner, { flex: 1 }, contentStyle]}>{children}</View>
        </View>
      )}
    </SafeAreaView>
  );
}

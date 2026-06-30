// Wordmark: "Novigo" with an accent dot. Minimal, no image asset needed.
import { View } from 'react-native';

import { typography } from '../theme';
import { useColors } from '../theme-provider';
import { Text } from './Text';

export function Logo({ size = 30 }: { size?: number }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={{ fontFamily: typography.bold, fontSize: size, color: c.text, letterSpacing: -0.5 }}>
        Novigo
      </Text>
      <View
        style={{
          width: size * 0.16,
          height: size * 0.16,
          borderRadius: size,
          backgroundColor: c.accent,
          marginLeft: 3,
          marginBottom: -size * 0.12,
        }}
      />
    </View>
  );
}

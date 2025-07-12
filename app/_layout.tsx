import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react'; // React needs to be imported for React.Fragment
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/useColorScheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  if (!loaded) {
    // Async font loading only occurs in development.
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {/* Wrap Stack and StatusBar in a Fragment to provide a single child to ThemeProvider */}
      <>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="select-languages" options={{ headerShown: false }} />
          <Stack.Screen name="select-language-level" options={{ headerShown: false }} />
          <Stack.Screen name="main-page" options={{ headerShown: false }} />
          <Stack.Screen name="camera-page" options={{ headerShown: false }} />
          <Stack.Screen name="quick-session" options={{ headerShown: false }} />
          <Stack.Screen name="voice-chat" options={{ headerShown: false }} />
          <Stack.Screen name="text-chat" options={{ headerShown: false }} /> 
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style="auto" />
      </>
    </ThemeProvider>
  );
}

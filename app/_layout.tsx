import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { ModelProvider } from './context/ModelContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { ActivityIndicator, View } from 'react-native';
import LingoProMultimodalModule from 'lingopro-multimodal-module';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  const [dbReady, setDbReady] = useState(false);

   useEffect(() => {
      const initializeDatabase = async () => {
        try {
          const success = await LingoProMultimodalModule.initializeDatabase();
          if (!success) {
            console.error('Database initialization failed');
            // Consider adding retry logic here
          }
          setDbReady(true);
        } catch (error) {
          console.error('Database initialization error:', error);
          setDbReady(true); // Still continue to app but log error
        }
      };

      initializeDatabase();
    }, []);

    if (!loaded || !dbReady) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" />
        </View>
      );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {/* Wrap Stack and StatusBar in a Fragment to provide a single child to ThemeProvider */}
      <>
      <ModelProvider>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="terms-of-service" options={{ headerShown: false }} />
          <Stack.Screen name="Yes" options={{ headerShown: false }} />
          <Stack.Screen name="initial-page" options={{ headerShown: false }} />
          <Stack.Screen name="select-languages" options={{ headerShown: false }} />
          <Stack.Screen name="select-language-level" options={{ headerShown: false }} />
          <Stack.Screen name="main-page" options={{ headerShown: false }} />
          <Stack.Screen name="camera-page" options={{ headerShown: false }} />
          <Stack.Screen name="quick-session" options={{ headerShown: false }} />
          <Stack.Screen name="chat" options={{ headerShown: false }} />
          <Stack.Screen name="knowledge-interface" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
          <Stack.Screen name="LearningSystem/srs-system" options={{ headerShown: false }} />
          <Stack.Screen name="LearningSystem/learning-page" options={{ headerShown: false }} />
          <Stack.Screen name="LearningSystem/generated-content-page" options={{ headerShown: false }} />
          <Stack.Screen name="LearningSystem/all-cards" options={{ headerShown: false }} />
          <Stack.Screen name="LearningSystem/stats" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="auto" />
      </ModelProvider>
      </>
    </ThemeProvider>
  );
}

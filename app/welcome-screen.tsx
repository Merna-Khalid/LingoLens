import AsyncStorage from '@react-native-async-storage/async-storage'; // Import AsyncStorage
import { Link, router } from 'expo-router'; // Import Link for navigation and router for direct navigation
import React, { useEffect, useState } from 'react'; // Import useState and useEffect
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'; // Import ActivityIndicator
import { SafeAreaView } from 'react-native-safe-area-context';

const SELECTED_LANGUAGE_KEY = 'selected_language';
const SELECTED_LEVEL_KEY = 'selected_level';

export default function WelcomeScreen() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkCachedPreferences = async () => {
      try {
        const cachedLanguage = await AsyncStorage.getItem(SELECTED_LANGUAGE_KEY);
        const cachedLevel = await AsyncStorage.getItem(SELECTED_LEVEL_KEY);

        if (cachedLanguage && cachedLevel) {
          console.log("Cached language and level found:", cachedLanguage, cachedLevel);
          // If both language and level were previously selected, navigate directly to the main page
          router.replace({
            pathname: '/main-page',
            params: { selectedLanguage: cachedLanguage, selectedLevel: cachedLevel }
          });
        } else {
          console.log("No complete cached language/level preferences found. Proceeding to language selection.");
        }
      } catch (error) {
        console.error("Error checking cached language/level:", error);
      } finally {
        setIsLoading(false);
      }
    };

    checkCachedPreferences();
  }, []);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Checking for saved preferences...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // If isLoading is false and we haven't navigated away, it means no cached preferences were found,
  // so we display the "Choose Your Language" button.
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.headerSection}>
          <Image
            source={{ uri: 'https://placehold.co/80x80/007AFF/FFFFFF?text=A' }}
            style={styles.lingoLensIcon}
            accessibilityLabel="LingoLens Icon"
          />
          <Text style={styles.lingoLensTitle}>LingoLens</Text>
        </View>

        <Link href="/select-languages" asChild>
          <TouchableOpacity style={styles.chooseLanguageButton}>
            <Text style={styles.chooseLanguageButtonText}>Choose Your Language</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f0f4f8', // Light background color for the entire screen
  },
  container: {
    flex: 1,
    justifyContent: 'center', // Center content vertically
    alignItems: 'center',     // Center content horizontally
    paddingHorizontal: 20,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 60, // More space below the logo for a cleaner look
  },
  lingoLensIcon: {
    width: 100, // Slightly larger icon for the landing page
    height: 100,
    borderRadius: 50, // Make it circular
    backgroundColor: '#007AFF', // Example background for the placeholder
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  lingoLensTitle: {
    fontSize: 32, // Larger title
    fontWeight: 'bold',
    color: '#333',
  },
  chooseLanguageButton: {
    backgroundColor: '#fff',
    paddingVertical: 18, // Larger padding
    paddingHorizontal: 40,
    borderRadius: 12, // More rounded
    width: '90%', // Wider button
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 }, // More pronounced shadow
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5, // For Android shadow
  },
  chooseLanguageButtonText: {
    fontSize: 18,
    color: '#555',
    fontWeight: '600', // Slightly bolder text
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: '#555',
  },
});

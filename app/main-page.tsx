import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';


interface UserPreferences {
  selectedLanguage: string | null;
  selectedLevel: string | null;
}

interface LanguageProgress {
  progressTime: number; // in minutes
  wordsLearned: number;
  streak: number;
}

interface AllLanguageProgress {
  [languageId: string]: LanguageProgress;
}


export const LANGUAGE_KEY = 'lingopro_selected_language';
export const LEVEL_KEY = 'lingopro_selected_level';
export const PROGRESS_KEY = 'lingopro_language_progress';

export default function MainPageScreen() {

  const { selectedLanguage: paramLanguage, selectedLevel: paramLevel } = useLocalSearchParams();

  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [languageProgress, setLanguageProgress] = useState<LanguageProgress>({
    progressTime: 0,
    wordsLearned: 0,
    streak: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const storedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
        const storedLevel = await AsyncStorage.getItem(LEVEL_KEY);
        const storedProgressJson = await AsyncStorage.getItem(PROGRESS_KEY);
        let allProgress: AllLanguageProgress = storedProgressJson ? JSON.parse(storedProgressJson) : {};

        let currentLanguage = storedLanguage;
        let currentLevel = storedLevel;

        // Prioritize params from navigation if available and different
        if (paramLanguage && paramLanguage !== storedLanguage) {
          currentLanguage = paramLanguage as string;
          await AsyncStorage.setItem(LANGUAGE_KEY, currentLanguage);
        }
        if (paramLevel && paramLevel !== storedLevel) {
          currentLevel = paramLevel as string;
          await AsyncStorage.setItem(LEVEL_KEY, currentLevel);
        }

        setSelectedLanguage(currentLanguage);
        setSelectedLevel(currentLevel);

        // Initialize or load progress for the current language
        if (currentLanguage) {
          if (!allProgress[currentLanguage]) {
            // Initialize progress for this language if it doesn't exist
            allProgress[currentLanguage] = {
              progressTime: 0,
              wordsLearned: 0,
              streak: 0,
            };
            await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(allProgress));
            console.log(`Initialized progress for ${currentLanguage} to 0.`);
          }
          setLanguageProgress(allProgress[currentLanguage]);
          console.log(`Loaded progress for ${currentLanguage}:`, allProgress[currentLanguage]);
        }

      } catch (error) {
        console.error("Error loading or saving preferences from AsyncStorage:", error);
      } finally {
        setLoading(false);
      }
    };

    loadPreferences();
  }, [paramLanguage, paramLevel]);

  const savePreferences = async (language: string | null, level: string | null) => {
    try {
      if (language !== null) {
        await AsyncStorage.setItem(LANGUAGE_KEY, language);
      } else {
        await AsyncStorage.removeItem(LANGUAGE_KEY);
      }
      if (level !== null) {
        await AsyncStorage.setItem(LEVEL_KEY, level);
      } else {
        await AsyncStorage.removeItem(LEVEL_KEY);
      }
      console.log("Preferences explicitly saved to AsyncStorage:", { language, level });
    } catch (error) {
      console.error("Error saving preferences to AsyncStorage:", error);
    }
  };

  const handleChangeLanguage = () => {
    router.push('/select-languages'); // Navigate back to the language selection page
  };

  const handleCameraPress = () => {
    router.push('/camera-page'); // Navigate to the camera page
  };

  const handleChatPress = () => {
      router.push('/pure-chat'); // Navigate to the camera page
    };


  const handleStartSession = () => {
    if (selectedLanguage && selectedLevel) {
      console.log(`Starting session for ${selectedLanguage} at ${selectedLevel} level.`);
      router.push('/LearningSystem/srs-system');
    } else {
      console.log("Please select a language and level first.");
    }
  };

  const handleKnowledgeNav = () => {
      if (selectedLanguage && selectedLevel) {
        console.log(`Getting Database information for  ${selectedLanguage} at ${selectedLevel} level.`);
        router.push('knowledge-interface');
      } else {
        console.log("Please select a language and level first.");
      }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading your preferences and progress...</Text>
      </SafeAreaView>
    );
  }

  // Define max values for progress bars (can be dynamic later)
  const maxProgressTime = 50;
  const maxWordsLearned = 30;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.greeting}>Hi, you are learning</Text>
          <TouchableOpacity style={styles.languageDisplay} onPress={handleChangeLanguage}>
            <Text style={styles.currentLanguage}>{selectedLanguage || 'Not Selected'}</Text>
            <Text style={styles.dropdownIcon}>⌄</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.cardContainer}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardIcon}>⚡</Text>
              <Text style={styles.cardTitle}>Today's Progress</Text>
            </View>
            <View style={styles.progressBarBackground}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${(languageProgress.progressTime / maxProgressTime) * 100}%` },
                ]}
              />
            </View>
            <Text style={styles.cardSubtitle}>
              {languageProgress.progressTime}/{maxProgressTime} mins
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardIcon}>📖</Text>
              <Text style={styles.cardTitle}>Words Learned</Text>
            </View>
            <View style={styles.progressBarBackground}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${(languageProgress.wordsLearned / maxWordsLearned) * 100}%` },
                ]}
              />
            </View>
            <Text style={styles.cardSubtitle}>
              {languageProgress.wordsLearned}/{maxWordsLearned} words
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardIcon}>🗓️</Text>
              <Text style={styles.cardTitle}>Streak / Calendar</Text>
              <View
                style={[
                  styles.streakBadge,
                  languageProgress.streak === 0 && { backgroundColor: 'gray' }
                ]}
              >
                <Text
                  style={[
                    styles.streakText,
                    languageProgress.streak === 0 && { color: 'white' }
                  ]}
                >
                  {languageProgress.streak === 0 ? `${languageProgress.streak}` : `🔥 ${languageProgress.streak}`}
                </Text>
              </View>
            </View>
          </View>

        </View>

        <TouchableOpacity
          style={[styles.startButton, (!selectedLanguage || !selectedLevel) && styles.startButtonDisabled]}
          onPress={handleStartSession}
          disabled={!selectedLanguage || !selectedLevel}
        >
          <Text style={styles.startButtonIcon}>▶</Text>
          <Text style={styles.startButtonText}>Start a Session</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.bottomNavBar}>
        <TouchableOpacity style={styles.navItem} onPress={handleChatPress}>
          <Text style={{ fontSize: 24 }}>💬</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItemCenter} onPress={handleCameraPress}>
          <Text style={styles.navIconCenter}>📸</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={handleKnowledgeNav}>
          <Text style={styles.navIcon}>📚</Text>
          <Text style={styles.navText}>Knowledge</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f0f4f8',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f4f8',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#555',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 30,
  },
  greeting: {
    fontSize: 24,
    color: '#333',
    fontWeight: 'normal',
    marginRight: 8,
  },
  languageDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0eaff', // Light blue background for language
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
  },
  currentLanguage: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF', // Blue color for the language
  },
  dropdownIcon: {
    fontSize: 18,
    color: '#007AFF',
    marginLeft: 5,
  },
  cardContainer: {
    marginBottom: 30,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1, // Allows title to take available space
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden', // Ensures the fill stays within bounds
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#777',
  },
  streakBadge: {
    backgroundColor: '#ffeb3b', // Yellowish background for streak
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 15,
  },
  streakText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  newBadge: {
    backgroundColor: '#4CAF50', // Green background for new
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 15,
  },
  newBadgeText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  startButton: {
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 15,
    marginBottom: 20,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  startButtonDisabled: {
    backgroundColor: '#a0c8ff', // Lighter blue when disabled
    shadowOpacity: 0.2,
    elevation: 4,
  },
  startButtonIcon: {
    fontSize: 20,
    color: '#fff',
    marginRight: 10,
  },
  startButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  bottomNavBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 5,
  },
  navIcon: {
    fontSize: 26,
    color: '#555',
    marginBottom: 4,
  },
  navText: {
    fontSize: 12,
    color: '#555',
  },
  navItemCenter: {
    backgroundColor: '#007AFF',
    borderRadius: 35, // Make it circular
    width: 70,
    height: 70,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -40, // Lift it up to overlap the bar
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
    borderWidth: 5, // Add a border to make it pop
    borderColor: '#f0f4f8', // Match background color for smooth blend
  },
  navIconCenter: {
    fontSize: 32,
    color: '#fff',
  },
});

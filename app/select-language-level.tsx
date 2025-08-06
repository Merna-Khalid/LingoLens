import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SELECTED_LANGUAGE_KEY = 'selected_language';
const SELECTED_LEVEL_KEY = 'selected_level';

interface LevelCardProps {
  level: string;
  description: string;
  isSelected: boolean;
  onPress: () => void;
}

const LevelCard: React.FC<LevelCardProps> = ({ level, description, isSelected, onPress }) => (
  <TouchableOpacity
    style={[styles.levelCard, isSelected && styles.levelCardSelected]}
    onPress={onPress}
  >
    <Text style={styles.levelText}>{level}</Text>
    <Text style={styles.descriptionText}>{description}</Text>
  </TouchableOpacity>
);

export default function SelectLanguageLevelScreen() {
  const { selectedLanguage } = useLocalSearchParams();
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);

  useEffect(() => {
    if (selectedLanguage) {
      console.log(`Language selected from previous page: ${selectedLanguage}`);
    }
  }, [selectedLanguage]);

  const levels = [
    { id: 'zero', level: 'Zero', description: "I'm just starting to learn" },
    { id: 'beginner', level: 'Beginner', description: "I know some basic words and phrases" },
    { id: 'intermediate', level: 'Intermediate', description: "I can have simple conversations" },
    { id: 'advanced', level: 'Advanced', description: "I can communicate fluently" },
  ];

  const handleProceed = async () => {
    if (selectedLanguage && selectedLevel) {
      console.log(`Selected Language: ${selectedLanguage}, Selected Level: ${selectedLevel}`);

      try {
        await AsyncStorage.setItem(SELECTED_LANGUAGE_KEY, selectedLanguage);
        await AsyncStorage.setItem(SELECTED_LEVEL_KEY, selectedLevel);

        router.push({
          pathname: '/main-page',
          params: { selectedLanguage, selectedLevel },
        });
      } catch (err) {
        console.error("❌ Failed to save to AsyncStorage:", err);
        Alert.alert("Storage Error", "Could not save your selection. Please try again.");
      }
    } else {
      console.log("Please select a language level.");
    }
  };


  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        <View style={styles.headerSection}>
          <Text style={styles.title}>Select Your Language Level</Text>
          <Text style={styles.subtitle}>Choose your current proficiency level</Text>
          {selectedLanguage && (
            <Text style={styles.selectedLanguageDisplay}>
              For: <Text style={styles.selectedLanguageText}>{selectedLanguage}</Text>
            </Text>
          )}
        </View>

        <View style={styles.levelGrid}>
          {levels.map((lvl) => (
            <LevelCard
              key={lvl.id}
              level={lvl.level}
              description={lvl.description}
              isSelected={selectedLevel === lvl.id}
              onPress={() => setSelectedLevel(lvl.id)}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.proceedButton, !selectedLevel && styles.proceedButtonDisabled]}
          onPress={handleProceed}
          disabled={!selectedLevel}
        >
          <Text style={styles.proceedButtonText}>Proceed</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f0f4f8',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  selectedLanguageDisplay: {
    fontSize: 18,
    color: '#555',
    marginTop: 10,
  },
  selectedLanguageText: {
    fontWeight: 'bold',
    color: '#007AFF',
  },
  levelGrid: {
    marginBottom: 30,
  },
  levelCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  levelCardSelected: {
    borderColor: '#007AFF', // Highlight color when selected
    backgroundColor: '#e6f0ff', // Lighter blue background when selected
  },
  levelText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  descriptionText: {
    fontSize: 14,
    color: '#777',
  },
  proceedButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 18,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  proceedButtonDisabled: {
    backgroundColor: '#a0c8ff',
  },
  proceedButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
});

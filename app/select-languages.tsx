import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Alert } from 'react-native'; // Import Alert for user feedback
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage'; // Import AsyncStorage

interface LanguageCardProps {
  flag: string;
  language: string;
  nativeLanguage: string;
  isSelected: boolean;
  onPress: () => void;
}

const LanguageCard: React.FC<LanguageCardProps> = ({ flag, language, nativeLanguage, isSelected, onPress }) => (
  <TouchableOpacity
    style={[styles.languageCard, isSelected && styles.languageCardSelected]}
    onPress={onPress}
  >
    <Text style={styles.flagEmoji}>{flag}</Text>
    <Text style={styles.languageText}>{language}</Text>
    <Text style={styles.nativeLanguageText}>{nativeLanguage}</Text>
  </TouchableOpacity>
);

export default function SelectLanguageScreen() {
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);

  const languages = [
    { id: 'spanish', flag: '🇪🇸', language: 'Spanish', nativeLanguage: 'Español' },
    { id: 'french', flag: '🇫🇷', language: 'French', nativeLanguage: 'Français' },
    { id: 'german', flag: '🇩🇪', language: 'German', nativeLanguage: 'Deutsch' },
    { id: 'italian', flag: '🇮🇹', language: 'Italian', nativeLanguage: 'Italiano' },
    { id: 'japanese', flag: '🇯🇵', language: 'Japanese', nativeLanguage: '日本語' },
    { id: 'chinese', flag: '🇨🇳', language: 'Chinese', nativeLanguage: '中文' },
  ];

  const handleProceed = () => {
    if (selectedLanguage) {
      try {
        router.push({
          pathname: "/select-language-level",
          params: { selectedLanguage: selectedLanguage }
        });
      } catch (error) {
        console.error("Error saving language to cache:", error);
        Alert.alert("Error", "Could not save your language choice. Please try again.");
      }
    } else {
      Alert.alert("Selection Required", "Please select a language before proceeding.");
      console.log("Please select a language before proceeding.");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        <View style={styles.languageSelectionSection}>
          <View style={styles.selectLanguageHeader}>
            <Link href="/" asChild>
              <TouchableOpacity style={styles.backButton}>
                <Text style={styles.backButtonText}>{'<'}</Text>
              </TouchableOpacity>
            </Link>
            <Text style={styles.selectLanguageTitle}>Select Language</Text>
          </View>

          <View style={styles.languageGrid}>
            {languages.map((lang) => (
              <LanguageCard
                key={lang.id}
                flag={lang.flag}
                language={lang.language}
                nativeLanguage={lang.nativeLanguage}
                isSelected={selectedLanguage === lang.id}
                onPress={() => setSelectedLanguage(lang.id)}
              />
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.proceedButton, !selectedLanguage && styles.proceedButtonDisabled]}
          onPress={handleProceed}
          disabled={!selectedLanguage}
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
    backgroundColor: '#f0f4f8', // Light background color for the entire screen
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  languageSelectionSection: {
    flex: 1,
    marginBottom: 20,
  },
  selectLanguageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },
  backButton: {
    padding: 10,
    marginRight: 10,
  },
  backButtonText: {
    fontSize: 24,
    color: '#555',
  },
  selectLanguageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    flex: 1, // Allows title to take up remaining space
  },
  languageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  languageCard: {
    width: '48%', // Roughly half width for two columns, adjust as needed
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
    alignItems: 'center',
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 2,
    borderColor: 'transparent', // Default transparent border
  },
  languageCardSelected: {
    borderColor: '#007AFF', // Highlight color when selected
  },
  flagEmoji: {
    fontSize: 50,
    marginBottom: 10,
  },
  languageText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  nativeLanguageText: {
    fontSize: 14,
    color: '#777',
  },
  proceedButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20, // Add some bottom margin
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  proceedButtonDisabled: {
    backgroundColor: '#A0C8FF', // Lighter color for disabled state
  },
  proceedButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

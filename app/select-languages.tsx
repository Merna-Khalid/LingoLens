import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
    { id: 'spanish', flag: '�🇸', language: 'Spanish', nativeLanguage: 'Español' },
    { id: 'french', flag: '🇫🇷', language: 'French', nativeLanguage: 'Français' },
    { id: 'german', flag: '🇩🇪', language: 'German', nativeLanguage: 'Deutsch' },
    { id: 'italian', flag: '🇮🇹', language: 'Italian', nativeLanguage: 'Italiano' },
    { id: 'japanese', flag: '🇯🇵', language: 'Japanese', nativeLanguage: '日本語' },
    { id: 'chinese', flag: '🇨🇳', language: 'Chinese', nativeLanguage: '中文' },
  ];

  const handleProceed = () => {
    if (selectedLanguage) {
      // Navigate to the new page, passing the selected language as a parameter
      router.push({
        pathname: "/select-language-level",
        params: { selectedLanguage: selectedLanguage }
      });
    } else {

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
    paddingTop: 40, // Adjust padding for overall layout
  },
  languageSelectionSection: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 30,
  },
  selectLanguageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
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
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  languageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  languageCard: {
    width: '48%', // Roughly half width for two columns with some spacing
    backgroundColor: '#f8f8f8',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    alignItems: 'flex-start', // Align content to the left within the card
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 2, // Default border
    borderColor: 'transparent', // Default transparent border
  },
  languageCardSelected: {
    borderColor: '#007AFF', // Highlight color when selected
    backgroundColor: '#e6f0ff', // Lighter blue background when selected
  },
  flagEmoji: {
    fontSize: 30,
    marginBottom: 5,
  },
  languageText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  nativeLanguageText: {
    fontSize: 14,
    color: '#777',
  },
  proceedButton: {
    backgroundColor: '#007AFF', // A nice blue color
    paddingVertical: 18,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20, // Space from the bottom of the screen
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  proceedButtonDisabled: {
    backgroundColor: '#a0c8ff', // Lighter blue when disabled
  },
  proceedButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
});
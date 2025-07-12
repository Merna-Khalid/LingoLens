import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context'; // For safe area handling

// You might need to install react-native-vector-icons for the back arrow and translation icon
// npm install react-native-vector-icons
// expo install react-native-vector-icons
// For this example, I'll use a simple text for the back arrow and suggest an icon for the main logo.

// Define the interface for LanguageCard props
interface LanguageCardProps {
  flag: string;
  language: string;
  nativeLanguage: string;
}

const LanguageCard: React.FC<LanguageCardProps> = ({ flag, language, nativeLanguage }) => (
  <TouchableOpacity style={styles.languageCard}>
    {/* Using an emoji for the flag. For a real app, you'd use an Image component with a flag asset. */}
    <Text style={styles.flagEmoji}>{flag}</Text>
    <Text style={styles.languageText}>{language}</Text>
    <Text style={styles.nativeLanguageText}>{nativeLanguage}</Text>
  </TouchableOpacity>
);

export default function App() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        {/* Header Section */}
        <View style={styles.headerSection}>
          {/* Placeholder for the LingoPro icon. You would typically use an Image component here. */}
          <Image
            source={{ uri: 'https://placehold.co/80x80/007AFF/FFFFFF?text=A' }} // Placeholder image for the icon
            style={styles.lingoProIcon}
            accessibilityLabel="LingoPro Icon"
          />
          <Text style={styles.lingoProTitle}>LingoPro</Text>
          <TouchableOpacity style={styles.chooseLanguageButton}>
            <Text style={styles.chooseLanguageButtonText}>Choose Your Language</Text>
          </TouchableOpacity>
        </View>

        {/* Language Selection Section */}
        <View style={styles.languageSelectionSection}>
          <View style={styles.selectLanguageHeader}>
            <TouchableOpacity style={styles.backButton}>
              <Text style={styles.backButtonText}>{'<'}</Text> {/* Simple text back arrow */}
            </TouchableOpacity>
            <Text style={styles.selectLanguageTitle}>Select Language</Text>
          </View>

          <View style={styles.languageGrid}>
            <LanguageCard flag="🇪🇸" language="Spanish" nativeLanguage="Español" />
            <LanguageCard flag="🇫🇷" language="French" nativeLanguage="Français" />
            <LanguageCard flag="🇩🇪" language="German" nativeLanguage="Deutsch" />
            <LanguageCard flag="🇮🇹" language="Italian" nativeLanguage="Italiano" />
            <LanguageCard flag="🇯🇵" language="Japanese" nativeLanguage="日本語" />
            <LanguageCard flag="🇨🇳" language="Chinese" nativeLanguage="中文" />
          </View>
        </View>

        {/* Proceed Button */}
        <TouchableOpacity style={styles.proceedButton}>
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
  headerSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  lingoProIcon: {
    width: 80,
    height: 80,
    borderRadius: 40, // Make it circular if your icon is like that
    backgroundColor: '#007AFF', // Example background for the placeholder
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  lingoProTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 25,
  },
  chooseLanguageButton: {
    backgroundColor: '#fff',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3, // For Android shadow
  },
  chooseLanguageButtonText: {
    fontSize: 16,
    color: '#555',
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
  proceedButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
});

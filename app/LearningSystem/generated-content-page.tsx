import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, SafeAreaView, Modal, Alert } from 'react-native';
import { AntDesign, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';

// Define types
type Word = {
  id: number;
  language: string;
  word: string;
  meaning: string;
  writing: string;
  wordType: string;
  category1: string;
  category2?: string | null;
  phonetics?: string | null;
  tags: string[];
};

type Story = {
  original: string;
  translation: string;
};

// Language configuration
const LANGUAGE_KEY = 'lingopro_selected_language';

// Your provided language list with BCP 47 codes
const languages = [
  { id: 'spanish', flag: '🇪🇸', language: 'spanish', nativeLanguage: 'Español', code: 'es-ES' },
  { id: 'french', flag: '🇫🇷', language: 'french', nativeLanguage: 'Français', code: 'fr-FR' },
  { id: 'german', flag: '🇩🇪', language: 'german', nativeLanguage: 'Deutsch', code: 'de-DE' },
  { id: 'italian', flag: '🇮🇹', language: 'italian', nativeLanguage: 'Italiano', code: 'it-IT' },
  { id: 'japanese', flag: '🇯🇵', language: 'japanese', nativeLanguage: '日本語', code: 'ja-JP' },
  { id: 'chinese', flag: '🇨🇳', language: 'chinese', nativeLanguage: '中文', code: 'zh-CN' },
];


const languageCodeMap = new Map(languages.map(lang => [lang.language, lang.code]));

export default function GeneratedContentPage() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [generatedWords, setGeneratedWords] = useState<Word[]>([]);
  const [generatedStory, setGeneratedStory] = useState<Story>({
    original: "",
    translation: ""
  });

  const [currentLanguageCode, setCurrentLanguageCode] = useState<string>('en-US'); // Default to English

  // Initialize data from params and fetch stored language
  useEffect(() => {
    try {
      if (params.generatedWords) {
        const words = typeof params.generatedWords === 'string'
          ? JSON.parse(params.generatedWords)
          : params.generatedWords;
        setGeneratedWords(Array.isArray(words) ? words : []);
      }

      if (params.generatedStory) {
        const story = typeof params.generatedStory === 'string'
          ? JSON.parse(params.generatedStory)
          : params.generatedStory;
        setGeneratedStory(story || { original: "", translation: "" });
      }
    } catch (e) {
      console.error("Failed to parse navigation params:", e);
    }

    // Fetch the stored language from AsyncStorage
    const fetchStoredLanguage = async () => {
      try {
        const storedLanguageName = await AsyncStorage.getItem(LANGUAGE_KEY);
        if (storedLanguageName) {
          const mappedCode = languageCodeMap.get(storedLanguageName.toLowerCase());
          if (mappedCode) {
            setCurrentLanguageCode(mappedCode);
            console.log(`TTS language set to: ${mappedCode} based on stored language: ${storedLanguageName}`);
          } else {
            console.warn(`No BCP 47 code found for stored language: ${storedLanguageName}. Using default.`);
          }
        } else {
          console.log("No language stored in AsyncStorage. Using default 'en-US'.");
        }
      } catch (e) {
        console.error("Failed to retrieve language from AsyncStorage:", e);
      }
    };

    fetchStoredLanguage();
  }, [params]);

  // State for modal
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);

  // Word map for quick lookup
  const generatedWordsMap = useMemo(() => {
    return new Map(generatedWords.map(w => [w.word.toLowerCase(), w]));
  }, [generatedWords]);

  // Handle word press
  const handleWordPress = (word: Word) => {
    setSelectedWord(word);
    setModalVisible(true);
  };

  // Render story with tappable words
  const renderStory = (storyText: string) => {
    const storyWords = storyText.split(/(\s+)/);
    return (
      <Text style={styles.storyText}>
        {storyWords.map((part, index) => {
          const cleanPart = part.toLowerCase().replace(/[,.?!]/g, '');
          const wordDetails = generatedWordsMap.get(cleanPart);

          if (wordDetails) {
            return (
              <Text key={index} style={styles.highlightedWord} onPress={() => handleWordPress(wordDetails)}>
                {part}
              </Text>
            );
          }
          return <Text key={index}>{part}</Text>;
        })}
      </Text>
    );
  };

  const handlePlayAudio = async () => {
    if (selectedWord) {
      try {
        const langCodeToSpeak = languageCodeMap.get(selectedWord.language.toLowerCase()) || currentLanguageCode;
        Speech.speak(selectedWord.word, { language: langCodeToSpeak });
        console.log(`Successfully requested audio for word: ${selectedWord.word} in ${langCodeToSpeak}`);
      } catch (e) {
        console.error("Error playing audio for word:", e);
        Alert.alert("Audio Error", `Failed to play audio for word: ${e.message}`);
      }
    }
  };

  const handlePlayStoryAudio = async () => {
    if (generatedStory.original) {
      try {
        Speech.speak(generatedStory.original, { language: currentLanguageCode });
        console.log(`Successfully requested audio for story in ${currentLanguageCode}`);
      } catch (e) {
        console.error("Error playing story audio:", e);
        Alert.alert("Audio Error", `Failed to play story audio: ${e.message}`);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <AntDesign name="arrowleft" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Generated Content</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.contentScrollView}>
        {/* Story Section */}
        <Text style={styles.sectionTitle}>Contextual Story</Text>
        {generatedStory.original ? (
          <View style={styles.contentBlock}>
            <View style={styles.storyHeader}>
              <Text style={styles.contentLabel}>Original:</Text>
              <TouchableOpacity style={styles.storyAudioButton} onPress={handlePlayStoryAudio}>
                <Ionicons name="volume-high" size={20} color="#007AFF" />
              </TouchableOpacity>
            </View>
            {renderStory(generatedStory.original)}
            <Text style={styles.contentLabel}>Translation:</Text>
            <Text style={styles.storyText}>{generatedStory.translation}</Text>
          </View>
        ) : (
          <Text style={styles.noContentText}>No story generated.</Text>
        )}

        {/* Words Section */}
        <Text style={styles.sectionTitle}>Vocabulary Words</Text>
        {generatedWords.length > 0 ? (
          generatedWords.map((word, index) => (
            <TouchableOpacity
              key={index}
              style={styles.generatedWordItem}
              onPress={() => handleWordPress(word)}
            >
              <View style={styles.wordItemContent}>
                <Text style={styles.wordMainText}>
                  <Text style={styles.wordBold}>{word.word}</Text>
                </Text>
                <Text style={styles.wordMeaningText}>{word.meaning}</Text>
              </View>
              <AntDesign name="right" size={16} color="#666" />
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.noContentText}>No words generated.</Text>
        )}

        {/* Action Button */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.navigate('main-page')}
        >
          <Text style={styles.addButtonText}>Go Home</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Word Details Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.closeButton} onPress={() => setModalVisible(false)}>
              <AntDesign name="closecircle" size={24} color="#aaa" />
            </TouchableOpacity>

            {selectedWord && (
              <View style={styles.modalBody}>
                <Text style={styles.modalWord}>{selectedWord.word}</Text>
                {selectedWord.phonetics && (
                  <Text style={styles.modalPhonetics}>{selectedWord.phonetics}</Text>
                )}

                <View style={styles.audioButtonContainer}>
                  <TouchableOpacity style={styles.audioButton} onPress={handlePlayAudio}>
                    <Ionicons name="volume-high" size={24} color="#fff" />
                    <Text style={styles.audioButtonText}>Play Audio</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.wordDetailRow}>
                  <Text style={styles.wordDetailLabel}>Meaning:</Text>
                  <Text style={styles.wordDetailValue}>{selectedWord.meaning}</Text>
                </View>
                <View style={styles.wordDetailRow}>
                  <Text style={styles.wordDetailLabel}>Word Type:</Text>
                  <Text style={styles.wordDetailValue}>{selectedWord.wordType}</Text>
                </View>
                {selectedWord.tags?.length > 0 && (
                  <View style={styles.wordDetailRow}>
                    <Text style={styles.wordDetailLabel}>Tags:</Text>
                    <Text style={styles.wordDetailValue}>{selectedWord.tags.join(', ')}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC', // Light blue-gray background
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E6EBF0',
  },
  backButton: {
    width: 24, // Consistent touch target
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A237E', // Dark blue text
  },
  contentScrollView: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  contentBlock: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  storyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  contentLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#444',
    marginRight: 10, // Space between label and button
  },
  storyAudioButton: {
    padding: 5,
  },
  storyText: {
    fontSize: 16,
    lineHeight: 28,
    color: '#333',
    marginBottom: 15,
  },
  highlightedWord: {
    fontWeight: 'bold',
    color: '#007AFF', // Vibrant blue for interactive words
    textDecorationLine: 'underline',
  },
  generatedWordItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#EAEFF7',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  wordItemContent: {
    flex: 1,
  },
  wordMainText: {
    fontSize: 18,
  },
  wordBold: {
    fontWeight: 'bold',
    color: '#1A237E',
  },
  wordMeaningText: {
    fontSize: 16,
    color: '#666',
  },
  noContentText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
  },
  addButton: {
    backgroundColor: '#4CAF50', // Green button
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 30,
    marginBottom: 30,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  closeButton: {
    position: 'absolute',
    top: 15,
    right: 15,
  },
  modalBody: {
    marginTop: 10,
  },
  modalWord: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1A237E',
    textAlign: 'center',
    marginBottom: 5,
  },
  modalPhonetics: {
    fontSize: 18,
    fontStyle: 'italic',
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  audioButtonContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  audioButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 30,
  },
  audioButtonText: {
    color: '#fff',
    marginLeft: 10,
    fontSize: 16,
    fontWeight: 'bold',
  },
  wordDetailRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  wordDetailLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#444',
    width: 100,
  },
  wordDetailValue: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
});

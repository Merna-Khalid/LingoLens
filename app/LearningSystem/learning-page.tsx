import { AntDesign } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, BackHandler } from 'react-native';
import LingoProMultimodal from 'lingopro-multimodal-module';
import { useModel } from '../context/ModelContext';
import { DEFAULT_MODEL_PATH } from "../initial-page";

interface TopicPreview {
  topic: string;
  wordCount: number;
  exampleWords: string;
}

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

const LANGUAGE_KEY = 'lingopro_selected_language';
const LEVEL_KEY = 'lingopro_selected_level';
const PROGRESS_KEY = 'lingopro_language_progress';

export default function LearningPage() {
  const router = useRouter();
  const {
    modelHandle,
    isModelLoaded,
    isLoadingModel,
    modelLoadError,
    loadModel,
    releaseLoadedModel
  } = useModel();

  // State variables
  const [isDbInitialized, setIsDbInitialized] = useState(true);
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [recommendedTopics, setRecommendedTopics] = useState<{ priorityTopics: TopicPreview[], otherTopics: TopicPreview[] }>({ priorityTopics: [], otherTopics: [] });
  const [customTopic, setCustomTopic] = useState('');
  const [numberOfCards, setNumberOfCards] = useState('5');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  // Using useRef to hold the AbortController instance
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadUserSettings = async () => {
    try {
      const storedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
      if (storedLanguage) setSelectedLanguage(storedLanguage);
      console.log('Loaded settings:', { storedLanguage });
    } catch (error) {
      console.error('Failed to load user settings:', error);
    }
  };

  // --- MODEL LOADING AND RELEASE ---
  useEffect(() => {
    if (!isModelLoaded && !isLoadingModel) {
      loadModel(DEFAULT_MODEL_PATH).catch(console.error);
    }
  }, [isModelLoaded, isLoadingModel, loadModel]);

  // Handle back button press to cancel ongoing requests and release the model
  useEffect(() => {
    const backAction = () => {
      // First, check if there's an active request to cancel
      if (abortControllerRef.current) {
        console.log("Back button pressed, aborting request...");
        abortControllerRef.current.abort();
        abortControllerRef.current = null; // Clear the reference
      }
      // Then, release the model
      releaseLoadedModel();
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [releaseLoadedModel]);

  // --- FETCH RECOMMENDATIONS ---
  useEffect(() => {
    loadUserSettings();
    const fetchRecommendations = async () => {
      if (!isModelLoaded) {
        console.log("Model not loaded yet. Waiting for model to load...");
        return;
      }
      setIsLoadingContent(true);
      try {
        const count = 10;
        const topicStringsRaw: string = await LingoProMultimodal.getRecommendedTopics(modelHandle, Math.floor(Math.random() * 1000000), selectedLanguage, count);
        const topicStrings = topicStringsRaw
          .slice(1, -1)
          .split(",")
          .map(item => item.trim());

        const previews: TopicPreview[] = await Promise.all(
          topicStrings.map(async (topic) => {
            const preview: TopicPreview = JSON.parse(await LingoProMultimodal.getTopicPreview(topic, selectedLanguage));
            return {
              topic: preview.topic,
              wordCount: preview.wordCount,
              exampleWords: Array.isArray(preview.exampleWords) ? preview.exampleWords.join(', ') : preview.exampleWords,
            } as TopicPreview;
          })
        );
        setRecommendedTopics({
          priorityTopics: previews.slice(0, 3),
          otherTopics: previews.slice(3),
        });
      } catch (error: any) {
        console.error('Error fetching recommendations:', error);
        Alert.alert('Error', `Failed to get learning recommendations: ${error.message}`);
      } finally {
        setIsLoadingContent(false);
      }
    };
    fetchRecommendations();
  }, [isDbInitialized, selectedLanguage, isModelLoaded]);

  // --- HANDLE GENERATING CONTENT (MODIFIED) ---
  const handleGenerateContent = useCallback(async (topicToGenerate: string) => {
    if (!isDbInitialized || !modelHandle) {
      Alert.alert("Error", "Database not initialized or model not loaded. Cannot generate content.");
      return;
    }
    const count = parseInt(numberOfCards, 10);
    if (!topicToGenerate || isNaN(count) || count < 1 || count > 20) {
      Alert.alert("Invalid Input", "Please select or enter a valid topic and number of cards (1-20).");
      return;
    }

    setIsLoadingContent(true);

    // Create a new AbortController for this specific request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await LingoProMultimodal.generateTopicCards({
        handle: modelHandle,
        requestId: Math.floor(Math.random() * 1000000),
        topic: topicToGenerate,
        language: selectedLanguage,
        count: count,
        deckLevel: "a1",
        // Pass the signal to the API call for cancellation
        signal: controller.signal,
      });

      // Clear the controller reference after a successful call
      abortControllerRef.current = null;

      const wordsForDisplay: Word[] = result.cards.map((card: any) => ({
        id: card.wordId,
        language: selectedLanguage,
        word: card.word || "Generated Word",
        meaning: card.meaning || "Generated Meaning",
        writing: card.writing || card.word || "Generated Word",
        wordType: card.wordType || "unknown",
        category1: topicToGenerate,
        tags: card.tags || [],
      }));

      router.navigate({
        pathname: '/LearningSystem/generated-content-page',
        params: {
          generatedWords: JSON.stringify(wordsForDisplay),
          generatedStory: JSON.stringify({ original: result.content, translation: result.translation }),
        },
      });

    } catch (error: any) {
      // Check if the error is due to cancellation
      if (error.name === 'AbortError') {
        console.log('Request was aborted by user.');
        // Do not show an alert for a canceled request
      } else {
        console.error('Error generating content:', error);
        Alert.alert('Error', `Failed to generate content: ${error.message}`);
      }
    } finally {
      // Ensure loading state is turned off, even if there's an error or cancellation
      setIsLoadingContent(false);
      abortControllerRef.current = null;
    }
  }, [isDbInitialized, modelHandle, numberOfCards, selectedLanguage, router]);

  // --- NEW FUNCTION TO HANDLE TOPIC SELECTION AND GENERATION ---
  const handleSelectTopic = useCallback((topic: string) => {
    if (isLoadingContent) return;
    setSelectedTopic(topic);
    setCustomTopic(topic);
    handleGenerateContent(topic);
  }, [isLoadingContent, handleGenerateContent]);

  // --- RENDER COMPONENT ---
  return (
    <SafeAreaView style={styles.fullPageContainer}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <AntDesign name="arrowleft" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Learning Topics</Text>
        <View style={styles.badgePlaceholder} />
      </View>

      <ScrollView style={styles.contentScrollView}>
        {isLoadingModel || isLoadingContent ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6200EE" />
            <Text style={styles.loadingText}>
              {isLoadingModel ? "Loading AI model..." : "Loading topics or generating content..."}
            </Text>
            {modelLoadError && !isModelLoaded && (
              <View style={styles.modelNotLoadedContainer}>
                <Text style={styles.modelNotLoadedText}>{modelLoadError}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={loadModel}>
                  <Text style={styles.retryButtonText}>Retry Load Model</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <>
            <Text style={styles.learningTitle}>Choose a Topic to Learn</Text>

            {!isModelLoaded && !modelLoadError && (
              <View style={styles.modelNotLoadedContainer}>
                <Text style={styles.modelNotLoadedText}>AI Model is initializing. Please wait...</Text>
              </View>
            )}

            {isModelLoaded && recommendedTopics.priorityTopics.length > 0 && (
              <View style={styles.topicSection}>
                <Text style={styles.topicSectionTitle}>Priority Topics</Text>
                {recommendedTopics.priorityTopics.map((item, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[styles.topicButton, selectedTopic === item.topic && styles.selectedTopicButton]}
                    onPress={() => handleSelectTopic(item.topic)}
                  >
                    <Text style={styles.topicButtonText}>{item.topic}</Text>
                    <Text style={styles.topicButtonDetails}>Words: {item.wordCount} | Ex: {item.exampleWords}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {isModelLoaded && recommendedTopics.otherTopics.length > 0 && (
              <View style={styles.topicSection}>
                <Text style={styles.topicSectionTitle}>Other Topics</Text>
                {recommendedTopics.otherTopics.map((item, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[styles.topicButton, selectedTopic === item.topic && styles.selectedTopicButton]}
                    onPress={() => handleSelectTopic(item.topic)}
                  >
                    <Text style={styles.topicButtonText}>{item.topic}</Text>
                    <Text style={styles.topicButtonDetails}>Words: {item.wordCount} | Ex: {item.exampleWords}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {isModelLoaded && (
              <View style={styles.customTopicSection}>
                <Text style={styles.topicSectionTitle}>Or Enter Your Own Topic</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Custom Topic (e.g., 'Space Exploration')"
                  value={customTopic}
                  onChangeText={(text) => {
                    setCustomTopic(text);
                    setSelectedTopic(null);
                  }}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Number of cards (1-20)"
                  keyboardType="numeric"
                  value={numberOfCards}
                  onChangeText={(text) => setNumberOfCards(text.replace(/[^0-9]/g, ''))}
                  maxLength={2}
                />
                <TouchableOpacity style={styles.generateButton} onPress={() => handleGenerateContent(customTopic)} disabled={isLoadingContent || !isModelLoaded}>
                  <Text style={styles.generateButtonText}>Generate Content</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fullPageContainer: {
    flex: 1,
    backgroundColor: '#f8f8f8',
    paddingTop: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  badgePlaceholder: {
    width: 24,
  },
  contentScrollView: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#555',
  },
  learningTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  topicSection: {
    marginBottom: 20,
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  topicSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    color: '#555',
  },
  topicButton: {
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
  },
  selectedTopicButton: {
    backgroundColor: '#E0E7FF',
    borderColor: '#6200EE',
    borderWidth: 2,
  },
  topicButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  topicButtonDetails: {
    fontSize: 13,
    color: '#777',
    marginTop: 5,
  },
  customTopicSection: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    marginBottom: 20,
  },
  input: {
    height: 50,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 10,
    paddingHorizontal: 15,
    fontSize: 16,
    width: '100%',
  },
  generateButton: {
    backgroundColor: '#6200EE',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 15,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

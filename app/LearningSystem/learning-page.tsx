import { AntDesign } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import LingoProMultimodal, { DueCardWithWord, SrsCard, TopicPreview } from 'lingopro-multimodal-module';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useModel } from '../context/ModelContext';
import { DEFAULT_MODEL_PATH } from "../initial-page";


interface GeneratedContentResult {
  cards: string; // JSON string of cards array
  content: string;
  translation: string;
}

interface CardWordPair {
  card: SrsCard;
  word: Word;
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
  const [isDbInitialized, setIsDbInitialized] = useState(false);
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
  // --- DATABASE INITIALIZATION ---
  useEffect(() => {
    const initializeDbStatus = async () => {
      setIsLoadingContent(true); // Use isLoadingContent for overall loading
      try {
        console.log("Checking database initialization status...");
        const dbAlreadyInitialized = await LingoProMultimodal.isDatabaseInitialized();

        if (!dbAlreadyInitialized) {
          console.log("Database not initialized. Proceeding with initialization...");
          const dbInitSuccess = await LingoProMultimodal.initializeDatabase();
          setIsDbInitialized(dbInitSuccess);
          if (!dbInitSuccess) {
            console.warn("Database initialization failed.");
            Alert.alert("Error", "Failed to initialize SRS database.");
            return;
          }
          console.log("SRS Database initialized successfully.");
        } else {
          console.log("SRS Database already initialized.");
          setIsDbInitialized(true);
        }
      } catch (error: any) {
        console.error("SRS Initialization error:", error);
        Alert.alert("Error", `Failed to initialize SRS: ${error.message}`);
      } finally {
        setIsLoadingContent(false);
      }
    };

    initializeDbStatus();
  }, []);

  // --- MODEL LOADING AND RELEASE ---
  useEffect(() => {
    if (!isModelLoaded && !isLoadingModel) {
      loadModel(DEFAULT_MODEL_PATH).catch(console.error);
    }
    loadUserSettings()
  }, [isModelLoaded, isLoadingModel, loadModel]);

  // --- LOAD USER SETTINGS & FETCH RECOMMENDATIONS (after DB and Model are ready) ---
  useEffect(() => {
    if (isDbInitialized && isModelLoaded && modelHandle !== null) {
      console.log("Database and Model confirmed ready. Loading user settings and fetching topics.");
      loadUserSettings(); // Load settings only once here
      fetchRecommendations(); // Fetch recommendations only when model and DB are ready
    }
  }, [isDbInitialized, isModelLoaded, modelHandle, selectedLanguage]); // Add modelHandle to dependencies

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
  const getTopicPreviews = async (
    topics: string[],
    language: string,
    options?: { batchSize?: number }
  ): Promise<TopicPreview[]> => {
    const batchSize = options?.batchSize ?? 3; // Default 3 concurrent requests

    const processSingleTopic = async (topic: string): Promise<TopicPreview> => {
      try {
        const previewJson = await LingoProMultimodal.getTopicPreview(topic, language);
        const preview: TopicPreview = JSON.parse(previewJson);

        // Validate response structure
        if (typeof preview.wordCount !== 'number' || !preview.exampleWords) {
          throw new Error('Invalid preview format');
        }

        return {
          topic: preview.topic || topic,
          wordCount: preview.wordCount || 0,
          exampleWords: preview.exampleWords,
        };
      } catch (error) {
        console.warn(`Topic preview failed for "${topic}":`, error);
        return {
          topic,
          wordCount: 0,
          exampleWords: ['Loading failed'],
        };
      }
    };

    // Process in batches to avoid overloading the bridge
    const results: TopicPreview[] = [];
    for (let i = 0; i < topics.length; i += batchSize) {
      const batch = topics.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(processSingleTopic));
      results.push(...batchResults);
    }

    return results;
  };

  const fetchRecommendations = useCallback(async () => {
    // This check is now redundant due to useEffect dependencies, but good for clarity
    if (!isModelLoaded || modelHandle === null) {
      console.log("Model not loaded or modelHandle is null, skipping recommendation fetch.");
      return;
    }

    setIsLoadingContent(true);
    try {
      const count = 10;
      const topicStringsRaw = await LingoProMultimodal.getRecommendedTopics(
        modelHandle,
        Math.floor(Math.random() * 1000000),
        selectedLanguage,
        count
      );

      // Safely parse topics
      const topicStrings = JSON.parse(topicStringsRaw) || [];

      if (!topicStrings.length) {
        console.log('No topics received from model');
        return;
      }

      // Process previews with error handling per topic
      const previews = await getTopicPreviews(topicStrings, selectedLanguage, { batchSize: 3 });

      setRecommendedTopics({
        priorityTopics: previews.slice(0, 3),
        otherTopics: previews.slice(3),
      });
    } catch (error) {
      console.error('Error in recommendation flow:', error);
      // No alert - empty state UI will handle it
    } finally {
      setIsLoadingContent(false);
    }
  }, [isModelLoaded, modelHandle, selectedLanguage]); // Add modelHandle to dependencies


  // --- HANDLE GENERATING CONTENT ---
  const handleGenerateContent = useCallback(async (topicToGenerate: string) => {
    if (!isDbInitialized || !modelHandle) {
      Alert.alert("Error", "System not ready");
      return;
    }

    const count = parseInt(numberOfCards, 10);
    if (!topicToGenerate || isNaN(count) || count < 1 || count > 20) {
      Alert.alert("Invalid Input", "Please enter 1-20 cards");
      return;
    }

    setIsLoadingContent(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Type the result explicitly
      const result: any = await LingoProMultimodal.generateTopicCards(
        modelHandle,
        Math.floor(Math.random() * 100000),
        topicToGenerate,
        selectedLanguage,
        count,
        "a1" // deckLevel
      );

      if (!result?.cards || !result.content) {
        Alert.alert("Error", "Failed to generate content. Please try again.");
        return;
      }

      // Parse the cards JSON string with error handling
      let cardsArray: Array<DueCardWithWord>;
      try {
        cardsArray = JSON.parse(result.cards);
      } catch (e) {
        console.error('Failed to parse cards JSON:', e);
        Alert.alert("Error", "Invalid data format received");
        return;
      }

      // Process words with proper type checking
      const wordsForDisplay: Word[] = cardsArray
        .filter((item): item is DueCardWithWord => {
          if (!item?.word) {
            console.warn('Undefined word encountered:', item);
            return false;
          }
          return true;
        })
        .map(item => ({
          id: item.word.id,
          language: item.word.language,
          word: item.word.word || "Generated Word",
          meaning: item.word.meaning || "Generated Meaning",
          writing: item.word.writing || item.word.word || "Generated Word",
          wordType: item.word.wordType || "noun",
          category1: item.word.category1 || topicToGenerate,
          category2: item.word.category2,
          tags: item.word.tags || [],
          phonetics: item.word.phonetics || "",
        }));

      if (wordsForDisplay.length !== cardsArray.length) {
        console.warn(`Filtered ${cardsArray.length - wordsForDisplay.length} invalid cards`);
      }

      // Navigate with validated data
      router.navigate({
        pathname: '/LearningSystem/generated-content-page',
        params: {
          generatedWords: JSON.stringify(wordsForDisplay),
          generatedStory: JSON.stringify({
            original: result.content,
            translation: result.translation || "No translation available"
          }),
        },
      });

    } catch (error: any) {
      if (error.name !== 'AbortError') {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Alert.alert(
          "Error",
          errorMessage.includes('Timeout')
            ? 'Generation took too long'
            : 'Content generation failed'
        );
        console.error('Generation error:', error);
      }
    } finally {
      setIsLoadingContent(false);
      abortControllerRef.current = null;
    }
  }, [isDbInitialized, modelHandle, numberOfCards, selectedLanguage]);

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

      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0} // Adjust this offset as needed
      >
        <ScrollView contentContainerStyle={styles.contentScrollView}>
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fullPageContainer: {
    flex: 1,
    backgroundColor: '#f8f8f8',
    paddingTop: 40,
  },
  keyboardAvoidingView: {
    flex: 1, // Ensure it takes up available space
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
    flexGrow: 1, // Allows content to grow and be scrollable
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 50, // Add padding at the bottom to ensure content isn't hidden by keyboard
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
  errorText: {
    marginTop: 10,
    fontSize: 16,
    color: '#D32F2F', // Red for errors
    textAlign: 'center',
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

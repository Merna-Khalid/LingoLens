import { AntDesign } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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

  const loadUserSettings = async () => {
    try {
      const storedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
      const storedLevel = await AsyncStorage.getItem(LEVEL_KEY);
      const storedProgressJson = await AsyncStorage.getItem(PROGRESS_KEY);

      if (storedLanguage) setSelectedLanguage(storedLanguage);
      console.log('Loaded settings:', { storedLanguage, storedLevel, storedProgressJson });
    } catch (error) {
      console.error('Failed to load user settings:', error);
    }
  };

  const [isDbInitialized, setIsDbInitialized] = useState(true); // Assuming true if navigated here
  const [selectedLanguage, setSelectedLanguage] = useState('English'); // Default, or get from params/AsyncStorage

  const [isLoadingContent, setIsLoadingContent] = useState(false);

  const [recommendedTopics, setRecommendedTopics] = useState<{ priorityTopics: TopicPreview[], otherTopics: TopicPreview[] }>({ priorityTopics: [], otherTopics: [] });
  const [customTopic, setCustomTopic] = useState('');
  const [numberOfCards, setNumberOfCards] = useState('5'); // Default to 5 cards

  useEffect(() => {
    if (!isModelLoaded && !isLoadingModel) {
      loadModel(DEFAULT_MODEL_PATH).catch(console.error);

    }
  }, [isModelLoaded, isLoadingModel, loadModel]);

  // release model when leaving this page
  useEffect(() => {
      const backAction = () => {
        releaseLoadedModel(); // Release model before exiting
        return false; // false lets the app continue exiting
      };

      const backHandler = BackHandler.addEventListener(
        'hardwareBackPress',
        backAction
      );

      return () => backHandler.remove(); // Cleanup
    }, []);

  // --- Fetch Recommendations Effect ---
  useEffect(() => {
    loadUserSettings();
    const fetchRecommendations = async () => {
      if (!isModelLoaded) {
        // If the model is not loaded, we simply wait for it.
        // The ModelProvider's useEffect is responsible for initiating loadModel().
        console.log("Model not loaded yet. Waiting for model to load...");
        return;
      }
      setIsLoadingContent(true);
      try {
        const count = 10;
        const topicStringsRaw: string = await LingoProMultimodal.getRecommendedTopics(modelHandle, Math.floor(Math.random() * 1000000), selectedLanguage, count);
        const topicStrings = topicStringsRaw
          .slice(1, -1) // remove brackets
          .split(",")   // split on commas
          .map(item => item.trim()); // trim spaces

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
        setIsLoadingContent(false); // End general loading
      }
    };
    fetchRecommendations();
  }, [isDbInitialized, selectedLanguage, isModelLoaded]);  // Re-fetch when language changes

  // --- Handle Generating Content ---
  const handleGenerateContent = async () => {
    if (!isDbInitialized) {
      Alert.alert("Error", "Database not initialized. Cannot generate content.");
      return;
    }
    if (!customTopic && recommendedTopics.priorityTopics.length === 0 && recommendedTopics.otherTopics.length === 0) {
      Alert.alert("Missing Topic", "Please select or enter a topic to generate content.");
      return;
    }

    const topicToUse = customTopic || recommendedTopics.priorityTopics[0]?.topic || recommendedTopics.otherTopics[0]?.topic;
    const count = parseInt(numberOfCards, 10);

    if (!topicToUse || isNaN(count) || count < 1 || count > 20) {
      Alert.alert("Invalid Input", "Please select or enter a valid topic and number of cards (1-20).");
      return;
    }

    setIsLoadingContent(true);

    try {
      const result = await LingoProMultimodal.generateTopicCards({
        handle: modelHandle,
        requestId: Math.floor(Math.random() * 1000000),
        topic: topicToUse,
        language: selectedLanguage,
        count: count,
        deckLevel: "a1"
      });


      const wordsForDisplay: Word[] = result.cards.map((card: any) => ({
        id: card.wordId,
        language: selectedLanguage,
        word: card.word || "Generated Word", // Assuming 'word' might be available in SrsCard JSON
        meaning: card.meaning || "Generated Meaning", // Assuming 'meaning' might be available
        writing: card.writing || card.word || "Generated Word",
        wordType: card.wordType || "unknown",
        category1: topicToUse,
        tags: card.tags || [],
      }));


      // Navigate to GeneratedContentPage, passing data as params
      router.navigate({
        pathname: '/LearningSystem/generated-content-page',
        params: {
          generatedWords: JSON.stringify(wordsForDisplay), // Pass the words
          generatedStory: JSON.stringify({ original: result.content, translation: result.translation }),
        },
      });

    } catch (error: any) {
      console.error('Error generating content:', error);
      Alert.alert('Error', `Failed to generate content: ${error.message}`);
    } finally {
      setIsLoadingContent(false);
    }
  };

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
                  <TouchableOpacity key={index} style={styles.topicButton} onPress={() => setCustomTopic(item.topic)}>
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
                  <TouchableOpacity key={index} style={styles.topicButton} onPress={() => setCustomTopic(item.topic)}>
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
                  onChangeText={setCustomTopic}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Number of cards (1-20)"
                  keyboardType="numeric"
                  value={numberOfCards}
                  onChangeText={(text) => setNumberOfCards(text.replace(/[^0-9]/g, ''))} // Restrict to numbers
                  maxLength={2}
                />
                <TouchableOpacity style={styles.generateButton} onPress={handleGenerateContent} disabled={isLoadingContent || !isModelLoaded}>
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
    paddingTop: 40, // Adjust for notch on iOS
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
    width: 24, // Match back icon size for alignment
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
    minHeight: 200, // Ensure it takes up some space
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

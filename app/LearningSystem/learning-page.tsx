import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, SafeAreaView } from 'react-native';
import { Ionicons, AntDesign } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';

import LingoProMultimodal from 'lingopro-multimodal-module';

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

export default function LearningPage() {
  const router = useRouter();
  const params = useLocalSearchParams(); // Access parameters if passed from previous screen

  // Assume isDbInitialized and selectedLanguage can be passed as params if needed,
  // or fetched internally if LearningPage is always initialized after SRSSystem.
  // For now, we'll assume SRSSystem ensures DB is initialized before navigating here.
  const [isDbInitialized, setIsDbInitialized] = useState(true); // Assuming true if navigated here
  const [selectedLanguage, setSelectedLanguage] = useState('English'); // Default, or get from params/AsyncStorage

  const [isLoading, setIsLoading] = useState(false);
  const [recommendedTopics, setRecommendedTopics] = useState<{ priorityTopics: TopicPreview[], otherTopics: TopicPreview[] }>({ priorityTopics: [], otherTopics: [] });
  const [customTopic, setCustomTopic] = useState('');
  const [numberOfCards, setNumberOfCards] = useState('5'); // Default to 5 cards

  // --- Fetch Recommendations Effect ---
  useEffect(() => {
    const fetchRecommendations = async () => {
      setIsLoading(true);
      try {
        const count= 20;
        const recommendations = await LingoProMultimodal.getRecommendedTopics(selectedLanguage, count);
        setRecommendedTopics(recommendations);
      } catch (error: any) {
        console.error('Error fetching recommendations:', error);
        Alert.alert('Error', `Failed to get learning recommendations: ${error.message}`);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRecommendations();
  }, [selectedLanguage]); // Re-fetch when language changes

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

    setIsLoading(true);

    try {
      const result = await LingoProMultimodal.generateTopicCards(topicToUse, selectedLanguage, count, "beginner");

      // Bulk insert generated words
      if (result.cards && result.cards.length > 0) {
        const insertSuccess = await LingoProMultimodal.bulkInsertWords(result.cards);
        if (insertSuccess) {
          Alert.alert("Words Added", `${result.cards.length} words added to your vocabulary!`);
          // Add them to SRS
          for (const word of result.cards) {
            await LingoProMultimodal.addToSRS(word.id, 'New'); // Add each new word to SRS
          }
          Alert.alert("SRS Updated", "New words added to your study queue!");
        } else {
          Alert.alert("Error", "Failed to bulk insert generated words.");
        }
      }

      // Navigate to GeneratedContentPage, passing data as params
      router.navigate({
        pathname: 'generated-content-page',
        params: {
          generatedWords: JSON.stringify(result.cards), // Stringify complex objects for params
          generatedStory: JSON.stringify({ original: result.content, translation: result.translation }),
        },
      });

    } catch (error: any) {
      console.error('Error generating content:', error);
      Alert.alert('Error', `Failed to generate content: ${error.message}`);
    } finally {
      setIsLoading(false);
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
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6200EE" />
            <Text style={styles.loadingText}>Loading topics or generating content...</Text>
          </View>
        ) : (
          <>
            <Text style={styles.learningTitle}>Choose a Topic to Learn</Text>

            {recommendedTopics.priorityTopics.length > 0 && (
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

            {recommendedTopics.otherTopics.length > 0 && (
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
              <TouchableOpacity style={styles.generateButton} onPress={handleGenerateContent} disabled={isLoading}>
                <Text style={styles.generateButtonText}>Generate Content</Text>
              </TouchableOpacity>
            </View>
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

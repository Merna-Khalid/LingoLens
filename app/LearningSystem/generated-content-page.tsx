import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { AntDesign } from '@expo/vector-icons'; // Assuming you have these icons
import { StackScreenProps } from '@react-navigation/stack'; // For type checking navigation props

// Define types for the route parameters
type RootStackParamList = {
  GeneratedContent: {
    generatedWords: Word[];
    generatedStory: { original: string; translation: string };
  };
  SRSSystem: undefined; // To navigate back to SRSSystem
};

type GeneratedContentPageProps = StackScreenProps<RootStackParamList, 'GeneratedContent'>;

// Define a type for a Word object (copied from SRSSystem/LearningPage for consistency)
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

export default function GeneratedContentPage({ route, navigation }: GeneratedContentPageProps) {
  // Extract data passed via route params
  const { generatedWords, generatedStory } = route.params;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header for Generated Content Page */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <AntDesign name="arrowleft" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Generated Content</Text>
        <View style={styles.badgePlaceholder} />
      </View>

      <ScrollView style={styles.contentScrollView}>
        <Text style={styles.sectionTitle}>Generated Story/Dialogue</Text>
        {generatedStory && (
          <View style={styles.contentBlock}>
            <Text style={styles.contentLabel}>Original:</Text>
            <Text style={styles.contentText}>{generatedStory.original}</Text>
            <Text style={styles.contentLabel}>Translation:</Text>
            <Text style={styles.contentText}>{generatedStory.translation}</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Words from Content</Text>
        {generatedWords.length > 0 ? (
          generatedWords.map((word, index) => (
            <View key={index} style={styles.generatedWordItem}>
              <Text style={styles.generatedWordText}>
                <Text style={{ fontWeight: 'bold' }}>{word.word}</Text>: {word.meaning}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.noContentText}>No words generated for this content.</Text>
        )}
        <TouchableOpacity style={styles.backToQuizButton} onPress={() => navigation.navigate('SRSSystem')}>
          <Text style={styles.backToQuizButtonText}>Back to Quiz</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
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
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  contentBlock: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 15,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  contentLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#555',
  },
  contentText: {
    fontSize: 16,
    marginBottom: 15,
    lineHeight: 24,
    color: '#333',
  },
  generatedWordItem: {
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  generatedWordText: {
    fontSize: 16,
    color: '#333',
  },
  noContentText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
  },
  backToQuizButton: {
    backgroundColor: '#007bff', // Blue
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  backToQuizButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

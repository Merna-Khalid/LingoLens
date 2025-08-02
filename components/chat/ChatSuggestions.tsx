import React from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Text } from 'react-native';

const SUGGESTIONS = [
  'Give a small description',
  'Describe the image',
  'Teach me a new word',
  'Ask me a question',
  'Correct my sentence',
  'Explain a grammar rule',
];

interface ChatSuggestionsProps {
  onSuggestionClick: (suggestion: string) => void;
}

const ChatSuggestions: React.FC<ChatSuggestionsProps> = ({ onSuggestionClick }) => {
  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {SUGGESTIONS.map((suggestion) => (
          <TouchableOpacity
            key={suggestion}
            style={styles.suggestionButton}
            onPress={() => onSuggestionClick(suggestion)}
            activeOpacity={0.7}
          >
            <Text style={styles.suggestionText}>{suggestion}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  suggestionButton: {
    backgroundColor: '#e0e7ef',
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 8,
    marginBottom: 4,
  },
  suggestionText: {
    color: '#1a1a1a',
    fontSize: 15,
    fontWeight: '500',
  },
});

export default ChatSuggestions;


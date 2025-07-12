import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator, Image, TextInput, Dimensions, Platform, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system'; // Import FileSystem for base64 conversion

const { width } = Dimensions.get('window');
const API_KEY = "";

// Define chat message interface
interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: string;
}

export default function TextChatScreen() {
  const { photoUri: paramImageUri } = useLocalSearchParams();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [aiThinking, setAiThinking] = useState(false);
  const [inputText, setInputText] = useState(''); // State for text input
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (paramImageUri) {
      setImageUri(paramImageUri as string);
      // Add initial AI message when the page loads with an image
      setMessages([
        {
          id: 'ai-initial',
          text: "I can see the image. What would you like to discuss about it?",
          sender: 'ai',
          timestamp: getTimestamp(),
        },
      ]);
    } else {
      console.warn("No photo URI provided for Text Chat. Redirecting to main page.");
      router.replace('/main-page');
    }
  }, [paramImageUri]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  // Function to get current timestamp
  const getTimestamp = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Function to send message to AI
  const sendMessageToAI = async () => {
    if (!inputText.trim()) return; // Don't send empty messages

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      text: inputText.trim(),
      sender: 'user',
      timestamp: getTimestamp(),
    };
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInputText(''); // Clear input field

    setAiThinking(true);

    try {
      // Prepare prompt for Gemini API with image
      if (!imageUri) {
        console.error("Image URI is missing for AI processing.");
        setMessages(prevMessages => [...prevMessages, {
          id: Date.now().toString(),
          text: "Error: Image is missing for AI processing.",
          sender: 'ai',
          timestamp: getTimestamp(),
        }]);
        setAiThinking(false);
        return;
      }

      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: userMessage.text }] });

      const payload: any = {
        contents: [
          {
            role: "user",
            parts: [
              { text: userMessage.text },
              {
                inlineData: {
                  mimeType: "image/jpeg", // Assuming JPEG, adjust if needed
                  data: await FileSystem.readAsStringAsync(imageUri!, { encoding: FileSystem.EncodingType.Base64 })
                }
              }
            ]
          }
        ],
      };

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      let aiResponseText = "I'm sorry, I couldn't process that. Please try again.";

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        aiResponseText = result.candidates[0].content.parts[0].text;
      } else {
        console.error("Unexpected AI response structure:", result);
      }

      setMessages(prevMessages => [...prevMessages, {
        id: (Date.now() + 1).toString(),
        text: aiResponseText,
        sender: 'ai',
        timestamp: getTimestamp(),
      }]);

    } catch (error) {
      console.error("Error calling AI:", error);
      setMessages(prevMessages => [...prevMessages, {
        id: Date.now().toString(),
        text: "Error: Could not get a response from AI.",
        sender: 'ai',
        timestamp: getTimestamp(),
      }]);
    } finally {
      setAiThinking(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Text Chat</Text>
        <TouchableOpacity style={styles.shareButton}>
          <Text style={styles.shareButtonText}>📤</Text>
        </TouchableOpacity>
      </View>

      {imageUri && (
        <View style={styles.imagePreviewContainer}>
          <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20} // Adjust as needed
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.chatContainer}
          contentContainerStyle={styles.chatContentContainer}
        >
          {messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.messageBubble,
                message.sender === 'user' ? styles.userBubble : styles.aiBubble,
              ]}
            >
              <Text style={styles.messageText}>{message.text}</Text>
              <Text style={styles.timestamp}>{message.timestamp}</Text>
            </View>
          ))}
          {aiThinking && (
            <View style={[styles.messageBubble, styles.aiBubble]}>
              <ActivityIndicator size="small" color="#333" />
              <Text style={styles.timestamp}>AI is thinking...</Text>
            </View>
          )}
        </ScrollView>

        {/* Input Toolbar */}
        <View style={styles.inputToolbar}>
          <TextInput
            style={styles.textInput}
            placeholder="Type your message..."
            placeholderTextColor="#999"
            value={inputText}
            onChangeText={setInputText}
            multiline
            returnKeyType="send"
            onSubmitEditing={sendMessageToAI} // Send on keyboard submit
          />
          <TouchableOpacity style={styles.sendButton} onPress={sendMessageToAI}>
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f0f4f8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  backButton: {
    padding: 10,
  },
  backButtonText: {
    fontSize: 24,
    color: '#555',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  shareButton: {
    padding: 10,
  },
  shareButtonText: {
    fontSize: 24,
    color: '#007AFF',
  },
  imagePreviewContainer: {
    width: '100%',
    height: 180, // Fixed height for image preview
    backgroundColor: '#eee',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 10,
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  chatContainer: {
    flex: 1,
    paddingHorizontal: 10,
  },
  chatContentContainer: {
    paddingVertical: 10,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF', // Blue for user
    borderBottomRightRadius: 5,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff', // White for AI
    borderBottomLeftRadius: 5,
  },
  messageText: {
    fontSize: 16,
    color: '#333',
  },
  timestamp: {
    fontSize: 10,
    color: '#777',
    alignSelf: 'flex-end',
    marginTop: 5,
  },
  inputToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: '#fff',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#f0f4f8',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 16,
    marginRight: 10,
    maxHeight: 100, // Prevent input from growing too large
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

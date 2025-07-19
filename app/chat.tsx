import { Recording } from 'expo-audio';
import LingoproMultimodalModule from './modules/lingopro-multimodal-module';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'system';
  timestamp: string;
}

// Waveform bar component
const WaveformBar: React.FC<{ height: number }> = ({ height }) => (
  <View style={[styles.waveformBar, { height: Math.max(5, height) }]} /> // Min height to always be visible
);

type InputMode = 'text' | 'voice';

export default function ChatScreen() {
  const { photoUri: paramImageUri, initialMode } = useLocalSearchParams<{ photoUri: string; initialMode?: InputMode }>();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<InputMode>(initialMode || 'text'); // Default to text
  const [recording, setRecording] = useState<Recording | undefined>();
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [aiThinking, setAiThinking] = useState(false);
  const [inputText, setInputText] = useState(''); // State for text input
  const [waveformHeights, setWaveformHeights] = useState<number[]>(Array(20).fill(5));
  const scrollViewRef = useRef<ScrollView>(null);
  const waveformIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const llamaServiceRef = useRef<LlamaService | null>(null);

  useEffect(() => {
    if (paramImageUri) {
      setImageUri(paramImageUri as string);
      // Add initial AI message when the page loads with an image
      setMessages([
        {
          id: 'ai-initial',
          text: "I can see the image. What would you like to discuss about it?",
          sender: 'system',
          timestamp: getTimestamp(),
        },
      ]);
    } else {
      console.warn("No photo URI provided for Chat. Redirecting to main page.");
      router.replace('/main-page');
    }

    // Request audio recording permission on mount
    (async () => {
      const { status } = await Audio.requestPermissionsAsync(); // Still from expo-av for permissions
      if (status !== 'granted') {
        console.error('Permission to access microphone is required!');
        // In a real app, you'd show a user-friendly message or redirect
      }
    })();


  // Scroll to bottom when messages change
  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  // Function to get current timestamp
  const getTimestamp = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Start recording
  async function startRecording() {
    try {
      setIsRecording(true);
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const newRecording = new Recording();
      await newRecording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await newRecording.startAsync();
      setRecording(newRecording);
      console.log('Recording started');

      // Start waveform simulation
      waveformIntervalRef.current = setInterval(() => {
        setWaveformHeights(prevHeights =>
          prevHeights.map(() => Math.floor(Math.random() * 50) + 5)
        );
      }, 100);

    } catch (err) {
      console.error('Failed to start recording', err);
      setIsRecording(false);
    }
  }

  // Stop recording
  async function stopRecording() {
    setIsRecording(false);
    if (waveformIntervalRef.current) {
      clearInterval(waveformIntervalRef.current);
      waveformIntervalRef.current = null;
      setWaveformHeights(Array(20).fill(5)); // Reset waveform
    }

    if (!recording) {
      console.warn('Recording object is null, cannot stop.');
      return;
    }

    console.log('Stopping recording');
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const uri = recording.getURI();
      if (uri) {
        console.log('Recording stopped and stored at', uri);
        const userMessage: ChatMessage = {
          id: Date.now().toString(),
          text: "Recording captured. Analyzing...", // Placeholder for actual transcription
          sender: 'user',
          timestamp: getTimestamp(),
        };
        setMessages(prevMessages => [...prevMessages, userMessage]);
        processMessageWithAI(uri, 'voice'); // Process as voice input
      } else {
        console.error('Recording URI is null.');
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
    } finally {
      setRecording(undefined);
    }
  }

  // Unified function to process messages (text or voice) and send to AI


  const handleSendText = () => {
    if (inputText.trim()) {
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        text: inputText.trim(),
        sender: 'user',
        timestamp: getTimestamp(),
      };
      setMessages(prevMessages => [...prevMessages, userMessage]);
      setInputText('');
      processMessageWithAI(userMessage.text, 'text'); // Process as text input
    }
  };

  // New function to play AI message audio
  const playAiMessageAudio = (textToSpeak: string) => {
    Speech.speak(textToSpeak, { language: 'en-US' });
  };

  const toggleInputMode = () => {
    // If recording, stop it before switching mode
    if (isRecording) {
      stopRecording();
    }
    setCurrentMode(prevMode => (prevMode === 'text' ? 'voice' : 'text'));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Chat</Text>
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
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
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
              {message.sender === 'system' && ( // Only show play button for AI messages
                <TouchableOpacity
                  style={styles.playButton}
                  onPress={() => playAiMessageAudio(message.text)}
                >
                  <Text style={styles.playButtonIcon}>🔊</Text>
                </TouchableOpacity>
              )}
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

        <View style={styles.inputAreaContainer}>
          {currentMode === 'text' ? (
            <View style={styles.textInputToolbar}>
              <TextInput
                style={styles.textInput}
                placeholder="Type your message..."
                placeholderTextColor="#999"
                value={inputText}
                onChangeText={setInputText}
                multiline
                returnKeyType="send"
                onSubmitEditing={handleSendText}
              />
              <TouchableOpacity style={styles.sendButton} onPress={handleSendText}>
                <Text style={styles.sendButtonText}>Send</Text>
              </TouchableOpacity>
            </View>
          ) : ( // Voice mode
            <View style={styles.voiceInputToolbar}>
              <View style={styles.waveformRow}>
                {waveformHeights.map((h, index) => (
                  <WaveformBar key={index} height={h} />
                ))}
              </View>

              <View style={styles.controlsRow}>
                <TouchableOpacity style={styles.controlButton}>
                  <Text style={styles.controlIcon}>🎤</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.recordButton}
                  onPress={isRecording ? stopRecording : startRecording}
                >
                  {isRecording ? (
                    <ActivityIndicator size="large" color="#fff" />
                  ) : (
                    <Text style={styles.recordButtonIcon}>●</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.controlButton}>
                  <Text style={styles.controlIcon}>⚙️</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <TouchableOpacity style={styles.modeToggleButton} onPress={toggleInputMode}>
            <Text style={styles.modeToggleButtonText}>
              {currentMode === 'text' ? '🎤' : '⌨️'}
            </Text>
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
    flexDirection: 'row', // To align text and play button
    alignItems: 'center',
  },
  messageText: {
    fontSize: 16,
    color: '#333',
    flexShrink: 1, // Allow text to wrap
  },
  timestamp: {
    fontSize: 10,
    color: '#777',
    alignSelf: 'flex-end',
    marginTop: 5,
  },
  playButton: {
    marginLeft: 8, // Space between text and button
    padding: 5,
    borderRadius: 15,
    backgroundColor: '#e0e0e0', // Light gray background
  },
  playButtonIcon: {
    fontSize: 16,
    color: '#007AFF', // Blue icon
  },
  inputAreaContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    paddingVertical: 15,
    paddingHorizontal: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
    alignItems: 'center',
    flexDirection: 'row', // To place toggle button next to input area
    justifyContent: 'space-between',
  },
  textInputToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1, // Take up available space
    marginRight: 10, // Space for the toggle button
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
  voiceInputToolbar: {
    flex: 1, // Take up available space
    alignItems: 'center',
    marginRight: 10, // Space for the toggle button
  },
  waveformRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    height: 60,
    width: '100%', // Use full width of its container
    marginBottom: 15,
  },
  waveformBar: {
    width: 4,
    backgroundColor: '#007AFF',
    marginHorizontal: 1,
    borderRadius: 2,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
  },
  controlButton: {
    backgroundColor: '#f0f4f8',
    borderRadius: 30,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlIcon: {
    fontSize: 28,
    color: '#555',
  },
  recordButton: {
    backgroundColor: '#dc3545',
    borderRadius: 40,
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#dc3545',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  recordButtonIcon: {
    fontSize: 40,
    color: '#fff',
  },
  modeToggleButton: {
    backgroundColor: '#e0eaff', // Light blue for toggle button
    borderRadius: 30,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  modeToggleButtonText: {
    fontSize: 28,
  },
  saveTranscriptButton: { // This button is now within the main chat area, not the toolbar
    backgroundColor: '#e0eaff',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 25,
    width: '80%',
    alignSelf: 'center', // Center it
    alignItems: 'center',
    marginTop: 20, // Add some space from chat
    marginBottom: 10, // Space from bottom of scrollview
  },
  saveTranscriptButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
});

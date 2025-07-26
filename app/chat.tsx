import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator, Image, TextInput, Dimensions, Platform, KeyboardAvoidingView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Audio } from 'expo-av';
import { Recording } from 'expo-audio';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';
import { requireNativeModule } from 'expo-modules-core';
import { useModel } from './context/ModelContext';

// Get the native module instance
const LingoProMultimodal = requireNativeModule('LingoproMultimodal');

const { width } = Dimensions.get('window');

// Define chat message interface
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
  // Receive modelHandle along with photoUri and initialMode
  const { photoUri: paramImageUri, initialMode } = useLocalSearchParams<{ photoUri: string; initialMode?: InputMode }>();

  const { modelHandle, isModelLoaded } = useModel();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<InputMode>(initialMode || 'text');
  const [recording, setRecording] = useState<Recording | undefined>();
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [aiThinking, setAiThinking] = useState(false);
  const [inputText, setInputText] = useState('');
  const [waveformHeights, setWaveformHeights] = useState<number[]>(Array(20).fill(5));
  const scrollViewRef = useRef<ScrollView>(null);
  const waveformIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const isModelReady = isModelLoaded;
  const [modelLoadError, setModelLoadError] = useState<string | null>(
      isModelReady ? null : "AI model not loaded. Please go back to setup."
  );


  // Function to get current timestamp
  const getTimestamp = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };


  useEffect(() => {
    if (paramImageUri) {
      setImageUri(paramImageUri as string);
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
      return; // Exit early if no image URI
    }

    // If modelHandle is not valid, immediately show error and redirect
    if (!isModelReady) {
      Alert.alert(
        "Model Not Loaded",
        "The AI model was not properly loaded. Please go back to the initial setup screen to load or download the model.",
        [{ text: "OK", onPress: () => router.replace('/') }] // Go back to initial page
      );
      return; // Exit early if model not ready
    }

    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Permission to access microphone is required for voice input.');
      }
    })();

    return () => {
      if (recording) {
        recording.stopAndUnloadAsync();
      }
      if (waveformIntervalRef.current) {
        clearInterval(waveformIntervalRef.current);
      }
      Speech.stop();
    };
  }, [paramImageUri, isModelReady]); // Depend on isModelReady

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  // --- Audio Recording Functions ---
  async function startRecording() {
    if (!isModelReady) {
      Alert.alert('AI Not Ready', 'The AI model is not loaded. Please load it first.');
      return;
    }
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

      waveformIntervalRef.current = setInterval(() => {
        setWaveformHeights(prevHeights =>
          prevHeights.map(() => Math.floor(Math.random() * 50) + 5)
        );
      }, 100);

    } catch (err) {
      console.error('Failed to start recording', err);
      setIsRecording(false);
      Alert.alert('Recording Error', 'Failed to start recording. Please check microphone permissions.');
    }
  }

  async function stopRecording() {
    setIsRecording(false);
    if (waveformIntervalRef.current) {
      clearInterval(waveformIntervalRef.current);
      waveformIntervalRef.current = null;
      setWaveformHeights(Array(20).fill(5));
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
          text: "Recording captured. Analyzing...",
          sender: 'user',
          timestamp: getTimestamp(),
        };
        setMessages(prevMessages => [...prevMessages, userMessage]);
        processMessageWithAI(userMessage.text, uri, 'voice');
      } else {
        console.error('Recording URI is null.');
        Alert.alert('Recording Error', 'Could not get recorded audio. Please try again.');
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
      Alert.alert('Recording Error', 'Failed to stop recording.');
    } finally {
      setRecording(undefined);
    }
  }

  // --- AI Message Processing ---
  const processMessageWithAI = async (textInput: string, audioUri: string | null, mode: InputMode) => {
    if (!isModelReady || modelHandle === undefined) { // Ensure modelHandle is valid
      Alert.alert('AI Not Ready', 'The AI model is not loaded or its handle is missing. Please load it first.');
      return;
    }

    setAiThinking(true);

    // Update the "Analyzing..." message for voice input
    if (mode === 'voice' && textInput === "Recording captured. Analyzing...") {
      setMessages(prevMessages => {
        const lastMessage = prevMessages[prevMessages.length - 1];
        if (lastMessage && lastMessage.text === "Recording captured. Analyzing...") {
          return prevMessages.map((msg, index) =>
            index === prevMessages.length - 1 ? { ...msg, text: "User spoke: (audio input)" } : msg
          );
        }
        return prevMessages;
      });
    }

    try {
      if (!imageUri) {
        throw new Error("Image URI is missing for AI processing.");
      }

      console.log("Calling native module with:", { modelHandle, textInput, imageUri, audioUri });
      // Pass the modelHandle to the native module
      const aiResponseText: string = await LingoProMultimodal.generateResponse(
        modelHandle, // Pass the loaded model handle
        Math.floor(Math.random() * 1000000), // Generate a random request ID
        textInput,
        imageUri
        // Note: The native generateResponse currently doesn't take audioUri.
        // TODO: Update generateResponse
      );
      console.log("MediaPipe AI response:", aiResponseText);

      setMessages(prevMessages => [...prevMessages, {
        id: (Date.now() + 1).toString(),
        text: aiResponseText,
        sender: 'system',
        timestamp: getTimestamp(),
      }]);

      if (mode === 'voice') {
        Speech.speak(aiResponseText, { language: 'en-US' });
      }

    } catch (error: any) {
      console.error("Error calling MediaPipe AI:", error);
      setMessages(prevMessages => [...prevMessages, {
        id: Date.now().toString(),
        text: `Error: Could not get a response from local AI model. ${error.message || 'Please try again.'}`,
        sender: 'system',
        timestamp: getTimestamp()
      }]);
    } finally {
      setAiThinking(false);
    }
  };

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
      processMessageWithAI(userMessage.text, null, 'text');
    }
  };

  // Function to play AI message audio
  const playAiMessageAudio = (textToSpeak: string) => {
    Speech.speak(textToSpeak, { language: 'en-US' });
  };

  const toggleInputMode = () => {
    if (isRecording) {
      stopRecording(); // Stop recording before switching mode
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

      {/* Display model status/error if not ready */}
      {!isModelReady && modelLoadError && (
        <View style={styles.modelStatusContainer}>
          <Text style={styles.modelErrorText}>{modelLoadError}</Text>
          <TouchableOpacity
            onPress={() => router.replace('/')} // Go back to initial page
            style={[styles.downloadControl, styles.retryButton]}
          >
            <Text style={styles.downloadControlText}>Go to Setup</Text>
          </TouchableOpacity>
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
              <Text style={[styles.messageText, message.sender === 'user' && { color: 'white' }]}>{message.text}</Text>
              {message.sender === 'system' && (
                <TouchableOpacity
                  style={styles.playButton}
                  onPress={() => playAiMessageAudio(message.text)}
                >
                  <Text style={styles.playButtonIcon}>🔊</Text>
                </TouchableOpacity>
              )}
              <Text style={[styles.timestamp, message.sender === 'user' && { color: 'rgba(255,255,255,0.7)' }]}>{message.timestamp}</Text>
            </View>
          ))}
          {aiThinking && (
            <View style={[styles.messageBubble, styles.aiBubble, styles.aiThinkingBubble]}>
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
                editable={isModelReady} // Only editable if model is ready
              />
              <TouchableOpacity
                style={[styles.sendButton, !isModelReady && styles.disabledButton]}
                onPress={handleSendText}
                disabled={!isModelReady}
              >
                <Text style={styles.sendButtonText}>Send</Text>
              </TouchableOpacity>
            </View>
          ) : (
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
                  style={[styles.recordButton, !isModelReady && styles.disabledButton]}
                  onPress={isRecording ? stopRecording : startRecording}
                  disabled={!isModelReady}
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

          <TouchableOpacity
            style={styles.modeToggleButton}
            onPress={toggleInputMode}
            disabled={isRecording || !isModelReady} // Disable mode toggle if not ready
          >
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
    height: 180,
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
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 5,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderBottomLeftRadius: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiThinkingBubble: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  messageText: {
    fontSize: 16,
    color: '#333',
    flexShrink: 1,
  },
  timestamp: {
    fontSize: 10,
    color: '#777',
    alignSelf: 'flex-end',
    marginTop: 5,
    marginLeft: 'auto',
  },
  playButton: {
    marginLeft: 8,
    padding: 5,
    borderRadius: 15,
    backgroundColor: '#e0e0e0',
  },
  playButtonIcon: {
    fontSize: 16,
    color: '#007AFF',
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
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  textInputToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#f0f4f8',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 16,
    marginRight: 10,
    maxHeight: 100,
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
    flex: 1,
    alignItems: 'center',
    marginRight: 10,
  },
  waveformRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    height: 60,
    width: '100%',
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
    backgroundColor: '#e0eaff',
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
  disabledButton: {
    opacity: 0.5,
  },

  // Model Status Styles
  modelStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  modelStatusText: {
    marginLeft: 10,
    fontSize: 14,
    color: '#333',
    flexShrink: 1,
  },
  modelErrorText: {
    color: 'red',
    fontSize: 14,
    flexShrink: 1,
    marginRight: 10,
  },
  downloadControls: {
    flexDirection: 'row',
    marginLeft: 'auto',
    gap: 8,
    marginTop: 5,
  },
  downloadControl: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pauseButton: {
    backgroundColor: '#ff9500',
  },
  resumeButton: {
    backgroundColor: '#34c759',
  },
  cancelButton: {
    backgroundColor: '#ff3b30',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    marginLeft: 10,
  },
  downloadControlText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'space-between',
  },
  progressBarContainer: {
    height: 4,
    width: '100%',
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2,
  },
});

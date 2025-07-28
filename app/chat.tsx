import { AudioRecorder, RecorderState, setAudioModeAsync, RecordingPresets, useAudioRecorder, useAudioRecorderState, AudioModule, useAudioPlayer } from "expo-audio";
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useModel } from './context/ModelContext';
import { DEFAULT_MODEL_PATH } from "./initial-page";
import LingoProMultimodal from 'lingopro-multimodal-module';


// Define chat message interface
interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'system';
  timestamp: string;
  imageUrl?: string;
  audioUri?: string;
}

// Waveform bar component
const WaveformBar: React.FC<{ height: number }> = ({ height }) => (
  <View style={[styles.waveformBar, { height: Math.max(5, height) }]} /> // Min height to always be visible
);

type InputMode = 'text' | 'voice';

export default function ChatScreen() {
  // Receive modelHandle along with photoUri and initialMode
  const { photoUri: paramImageUri, initialMode } = useLocalSearchParams<{ photoUri: string; initialMode?: InputMode }>();

  const { modelHandle, isModelLoaded, setModelHandle, releaseLoadedModel } = useModel();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<InputMode>('text');
  const [recording, setRecording] = useState<AudioRecorder | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [aiThinking, setAiThinking] = useState(false);
  const [inputText, setInputText] = useState('');
  const [waveformHeights, setWaveformHeights] = useState<number[]>(Array(20).fill(5));
  const scrollViewRef = useRef<ScrollView>(null);
  const waveformIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStateRef = useRef<RecorderState>(null);



  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  recordingStateRef.current = useAudioRecorderState(audioRecorder);
  const [uri, setUri] = useState<string>('');
  const audioPlayer = useAudioPlayer(uri);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const isModelReady = isModelLoaded && modelHandle !== null;

  const loadModel = async () => {
    if (modelHandle !== null) {
      console.log("modelHandle is not null")
      return; // Model already loaded
    }
    setIsLoadingModel(true);
    setModelLoadError(null);
    try {
      if (!DEFAULT_MODEL_PATH) {
        throw new Error("Model path is not set");
      }
      let modelPath = DEFAULT_MODEL_PATH;
      if (modelPath.startsWith('file://')) {
        modelPath = modelPath.slice(7);
      }
      const handle = await LingoProMultimodal.createModel(
        modelPath,
        1024, // maxTokens
        3,    // topK
        0.7,  // temperature
        123, // random seed
        true, // multimodal
      );
      setModelHandle(handle);
      console.log("Model loaded successfully with handle:", handle);
    } catch (error: any) {
      setModelLoadError(`Failed to load AI model: ${error.message || 'Please go back to setup.'}`);
      setModelHandle(null);
    } finally {
      setIsLoadingModel(false);
    }
  };
  useEffect(() => {
    loadModel();
  }, []);



  const getTimestamp = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };


  useEffect(() => {
    if (paramImageUri) {
      console.log('Received image URI:', paramImageUri);
      setImageUri(paramImageUri as string);
      setMessages([
        {
          id: 'ai-initial',
          text: "I can see the image. What would you like to discuss about it?",
          sender: 'system',
          timestamp: getTimestamp(),
          imageUrl: paramImageUri,
        },
      ]);
    } else {
      console.warn("No photo URI provided for Chat. Redirecting to main page.");
      router.replace('/main-page');
      return; // Exit early if no image URI
    }

    // If modelHandle is not valid, immediately show error and redirect
    if (!isModelReady) {
      return; // Exit early if model not ready
    }

    (async () => {
      const status = await AudioModule.requestRecordingPermissionsAsync();

      if (!status.granted) {
        Alert.alert('Permission Required', 'Permission to access microphone is required for voice input.');
      }
    })();

    return () => {
      if (recording) {
        recording.stop();
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
      // setIsRecording(true);
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setRecording(audioRecorder);

      waveformIntervalRef.current = setInterval(() => {
        setWaveformHeights(prevHeights =>
          prevHeights.map(() => Math.floor(Math.random() * 50) + 5)
        );
      }, 100) as any;

    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Recording Error', 'Failed to start recording. Please check microphone permissions.');
    }
  }

  async function stopRecording() {
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
      await recording.stop();
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      const uri = recording.uri;
      if (uri) {
        setUri(uri);
        console.log('Recording stopped and stored at', uri);

        const userMessage: ChatMessage = {
          id: Date.now().toString(),
          text: "Voice message",
          sender: 'user',
          timestamp: getTimestamp(),
          audioUri: uri,
        };
        setMessages(prevMessages => [...prevMessages, userMessage]);
        processMessageWithAI("Voice message", uri, 'voice');

        // Switch back to text mode after recording
        setCurrentMode('text');
      } else {
        console.error('Recording URI is null.');
        Alert.alert('Recording Error', 'Could not get recorded audio. Please try again.');
      }
    } catch (err) {
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

    // No need to update voice message text since it's already showing as "Voice message"

    try {
      if (!imageUri || !modelHandle) {
        throw new Error("Image URI is missing for AI processing.");
      }

      console.log("Calling native module with:", { modelHandle, textInput, imageUri, audioUri });
      // Pass the modelHandle to the native module
      const aiResponseText: string = await LingoProMultimodal.generateResponse(
        modelHandle ?? 0,
        Math.floor(Math.random() * 1000000), // Generate a random request ID
        textInput,
        imageUri ?? ''
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

  // Function to play voice message audio
  const playVoiceMessage = (audioUri: string) => {
    setUri(audioUri);
    audioPlayer.play();
  };

  const toggleInputMode = () => {
    if (recording && recording.isRecording) {
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

      {isLoadingModel && (
        <View style={styles.modelLoadingOverlay}>
          <View style={styles.modelLoadingCard}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.modelLoadingTitle}>Loading AI Model</Text>
            <Text style={styles.modelLoadingSubtitle}>Please wait while we prepare the AI...</Text>
          </View>
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
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
              {message.imageUrl && (
                <Image source={{ uri: message.imageUrl }} style={styles.messageImage} resizeMode="cover" onError={(e) => console.log('Image Error:', e.nativeEvent.error)} />
              )}
              {message.audioUri ? (
                <View style={styles.voiceMessageContainer}>
                  <TouchableOpacity
                    style={styles.voicePlayButton}
                    onPress={() => playVoiceMessage(message.audioUri!)}
                  >
                    <Icon name="play" size={20} color="#007AFF" />
                  </TouchableOpacity>
                  <Text style={styles.voiceMessageText}>Voice message</Text>
                </View>
              ) : (
                <Text style={[styles.messageText]}>
                  {message.sender === 'user' ? (
                    message.text
                  ) : (
                    <Markdown>
                      {message.text}
                    </Markdown>
                  )}
                </Text>
              )}
              <View style={styles.messageFooter}>
                {message.sender === 'system' && (
                  <TouchableOpacity
                    style={styles.playButton}
                    onPress={() => playAiMessageAudio(message.text)}
                  >
                    <Text style={styles.playButtonIcon}>🔊</Text>
                  </TouchableOpacity>
                )}
                <Text style={[styles.timestamp]}>{message.timestamp}</Text>
              </View>
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
                editable={isModelReady && !isLoadingModel} // Only editable if model is ready
              />
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => {
                  // TODO: Implement clipboard functionality
                }}
                disabled={!isModelReady || isLoadingModel}
              >
                <Icon name="clipboard-outline" size={20} color="#007AFF" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => {
                  // TODO: Implement camera functionality
                }}
                disabled={!isModelReady || isLoadingModel}
              >
                <Icon name="camera-outline" size={20} color="#007AFF" />
              </TouchableOpacity>
              {inputText.trim() ? (
                <TouchableOpacity
                  style={[styles.sendButton, (!isModelReady || isLoadingModel) && styles.disabledButton]}
                  onPress={handleSendText}
                  disabled={!isModelReady || isLoadingModel}
                >
                  <Text style={styles.sendButtonText}>Send</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.modeToggleButton, (!isModelReady || isLoadingModel) && styles.disabledButton]}
                  onPress={toggleInputMode}
                  disabled={!isModelReady || isLoadingModel}
                >
                  <Text style={styles.modeToggleButtonText}>🎤</Text>
                </TouchableOpacity>
              )}
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
                  style={[styles.recordButton, (!isModelReady || isLoadingModel) && styles.disabledButton]}
                  onPress={
                    !recording || !recording.isRecording
                      ? startRecording
                      : stopRecording
                  }
                  disabled={!isModelReady || isLoadingModel}
                >
                  {recording && recording.isRecording ? (
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
    // paddingHorizontal: 15,
    paddingVertical: 10,
  },
  backButton: {
    padding: 10,
  },
  backButtonText: {
    fontSize: 25,
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
    fontSize: 20,
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
  },
  chatContentContainer: {
    flexGrow: 1,
    paddingHorizontal: 10,
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
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#f1ecf1',
    // borderBottomRightRadius: 5,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    // borderBottomLeftRadius: 5,
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
    marginLeft: 8,
  },
  playButton: {
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
    paddingVertical: 10,
    paddingHorizontal: 10,
    // shadowColor: '#000',
    // shadowOffset: { width: 0, height: -5 },
    // shadowOpacity: 0.1,
    // shadowRadius: 10,
    // elevation: 10,
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
  iconButton: {
    padding: 10,
    marginRight: 5,
    justifyContent: 'center',
    alignItems: 'center',
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
  modelLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(240, 244, 248, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modelLoadingCard: {
    backgroundColor: '#fff',
    padding: 30,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 200,
  },
  modelLoadingTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 15,
    textAlign: 'center',
  },
  modelLoadingSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
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
  messageImage: {
    width: 150,
    height: 150,
    borderRadius: 10,
    marginBottom: 10,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
    marginTop: 5,
  },
  voiceMessageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f4f8',
    borderRadius: 20,
    padding: 10,
    minWidth: 120,
  },
  voicePlayButton: {
    backgroundColor: '#e0eaff',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  voiceMessageText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
});

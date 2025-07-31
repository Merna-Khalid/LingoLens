import { ChatHeader, InputMode, MessageInput, MessageList, ModelLoadingOverlay } from '@/components/chat';
import { ChatMessage as ChatMessageType } from '@/components/chat/types';
import { AudioModule, AudioRecorder, RecorderState, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import LingoProMultimodal from 'lingopro-multimodal-module';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useModel } from './context/ModelContext';
import { DEFAULT_MODEL_PATH } from "./initial-page";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LANGUAGE_KEY, LEVEL_KEY, PROGRESS_KEY } from './main-page'

const ToolsToggle = ({ useAgenticTools, onToggle }: { useAgenticTools: boolean, onToggle: () => void }) => {
  return (
    <TouchableOpacity
      style={[styles.toolsButton, useAgenticTools && styles.toolsButtonActive]}
      onPress={onToggle}
    >
      <Text style={[styles.toolsButtonText, useAgenticTools && styles.toolsButtonTextActive]}>
        {useAgenticTools ? '🔧 ON' : '🔧 OFF'}
      </Text>
    </TouchableOpacity>
  );
};

export default function ChatScreen() {
  // Receive modelHandle along with photoUri and initialMode
  const { photoUri: paramImageUri, initialMode } = useLocalSearchParams<{ photoUri: string; initialMode?: InputMode }>();

  const {
    modelHandle,
    isModelLoaded,
    isLoadingModel,
    modelLoadError,
    loadModel
  } = useModel();

  // This variable has the newest uploaded image by the user.
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<InputMode>('text');
  const [recording, setRecording] = useState<AudioRecorder | undefined>();
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [aiThinking, setAiThinking] = useState(false);
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [waveformHeights, setWaveformHeights] = useState<number[]>(Array(20).fill(5));
  const waveformIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStateRef = useRef<RecorderState>(null);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  recordingStateRef.current = useAudioRecorderState(audioRecorder);
  const [uri, setUri] = useState<string>('');
  const audioPlayer = useAudioPlayer(uri);

  // Agentic mode activation
  const [useAgenticTools, setUseAgenticTools] = useState(false);

  useEffect(() => {
    if (!isModelLoaded && !isLoadingModel) {
      loadModel(DEFAULT_MODEL_PATH).catch(console.error);
    }
  }, [isModelLoaded, isLoadingModel, loadModel]);

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
    if (!isModelLoaded) {
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
  }, [paramImageUri, isModelLoaded]);


  // --- Audio Recording Functions ---
  async function startRecording() {
    if (!isModelLoaded) {
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

        const userMessage: ChatMessageType = {
          id: Date.now().toString(),
          text: "Voice message",
          sender: 'user',
          timestamp: getTimestamp(),
          audioUri: uri,
        };
        setMessages(prevMessages => [...prevMessages, userMessage]);
        processMessageWithAI("Voice message", uri, null, 'voice');

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
  const processMessageWithAI = async (textInput: string, audioUri: string | null, msgImageUri: string | null, mode: InputMode) => {
    if (!isModelLoaded) {
      Alert.alert('AI Not Ready', 'The AI model is not loaded or its handle is missing. Please load it first.');
      return;
    }

    setAiThinking(true);
    // No need to update voice message text since it's already showing as "Voice message"
    try {
      if (!modelHandle) {
        throw new Error("Image URI is missing for AI processing.");
      }

      // Since gemma-3n only has a maximum of 1 image per session
      // we set the last uploaded image as the imageUri
      if (msgImageUri) {
        setImageUri(msgImageUri);
      }

      console.log("Calling native module with:", { modelHandle, textInput, imageUri, audioUri });
      // Pass the modelHandle to the native module
      const storedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
      const storedLevel = await AsyncStorage.getItem(LEVEL_KEY);
      // const storedProgressJson = await AsyncStorage.getItem(PROGRESS_KEY);
      const promptAddition = "The language to learn:" + storedLanguage + ", The level of the user learning the language:" + storedLevel + " "
      const aiResponseText: string = await LingoProMultimodal.generateResponse(
        modelHandle,
        Math.floor(Math.random() * 1000000),
        promptAddition + textInput,
        msgImageUri ?? imageUri ?? '',
        useAgenticTools,
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
    if (inputText.trim() || selectedImage) {
      const userMessage: ChatMessageType = {
        id: Date.now().toString(),
        text: inputText.trim() || 'Image',
        sender: 'user',
        timestamp: getTimestamp(),
        attachedImageUrl: selectedImage || undefined,
      };
      setMessages(prevMessages => [...prevMessages, userMessage]);
      setInputText('');
      setSelectedImage(null);
      processMessageWithAI(userMessage.text, null, selectedImage, 'text');
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


  // Function to handle image selection
  const handleImageSelection = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Permission to access photos is required.');
        return;
      }


      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to select image. Please try again.');
    }
  };

  const toggleInputMode = () => {
    if (recording && recording.isRecording) {
      stopRecording(); // Stop recording before switching mode
    }
    setCurrentMode(prevMode => (prevMode === 'text' ? 'voice' : 'text'));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ChatHeader
        title="AI Chat"
        onBack={() => router.back()}
        rightComponents={[
          <ToolsToggle
            key="tools-toggle"
            useAgenticTools={useAgenticTools}
            onToggle={() => setUseAgenticTools(!useAgenticTools)}
          />
        ]

        }
      />

      <ModelLoadingOverlay isVisible={isLoadingModel} />

      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <MessageList
          messages={messages}
          aiThinking={aiThinking}
          onPlayVoiceMessage={playVoiceMessage}
          onPlayAiAudio={playAiMessageAudio}
        />

        <MessageInput
          currentMode={currentMode}
          inputText={inputText}
          selectedImage={selectedImage}
          isRecording={!!recording?.isRecording}
          waveformHeights={waveformHeights}
          isModelReady={isModelLoaded}
          isLoadingModel={isLoadingModel}
          onTextChange={setInputText}
          onSendText={handleSendText}
          onImageSelect={handleImageSelection}
          onRemoveImage={() => setSelectedImage(null)}
          onToggleMode={toggleInputMode}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f0f4f8',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  toolsButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    backgroundColor: '#e0e0e0',
    marginRight: 10,
  },
  toolsButtonActive: {
    backgroundColor: '#007AFF',
  },
  toolsButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  toolsButtonTextActive: {
    color: '#fff',
  }
});

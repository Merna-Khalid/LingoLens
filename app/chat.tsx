import { ChatHeader, InputMode, MessageInput, MessageList, ModelLoadingOverlay } from '@/components/chat';
import { ChatMessage as ChatMessageType } from '@/components/chat/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioModule, AudioRecorder, RecorderState, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { default as ExpoLlmMediapipe, default as LingoProMultimodal, NativeModuleSubscription, PartialResponseEventPayload } from 'lingopro-multimodal-module';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useModel } from './context/ModelContext';
import { DEFAULT_MODEL_PATH } from "./initial-page";
import { LANGUAGE_KEY, LEVEL_KEY } from './main-page';

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
    loadModel,
    releaseLoadedModel
  } = useModel();

  // This variable has the newest uploaded image by the user.
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<InputMode>('text');
  const [recording, setRecording] = useState<AudioRecorder | undefined>();
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [iSStreamingMessage, setIsStreamingMessage] = useState<boolean>(false);
  const [streamedMessage, setStreamedMessage] = useState<ChatMessageType | null>(null);

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

  const nextRequestIdRef = useRef(0);
  const streamingListenersRef = useRef<NativeModuleSubscription[]>([]);

  const initialPromptSentRef = useRef(false);


  const clearStreamingListeners = useCallback(() => {
    streamingListenersRef.current.forEach(sub => sub.remove());
    streamingListenersRef.current = [];
  }, [streamingListenersRef]);

  useEffect(() => {
    if (!isModelLoaded && !isLoadingModel) {
      loadModel(DEFAULT_MODEL_PATH).catch(console.error);
    }
  }, [isModelLoaded, isLoadingModel, loadModel]);

  const getTimestamp = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };





  // --- Audio Recording Functions ---
  const startRecording = useCallback(async () => {
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
  }, [isModelLoaded, audioRecorder]);


  const processMessageWithAI = useCallback(async (textInput: string, audioUri: string | null, msgImageUri: string | null, mode: InputMode) => {
    if (!isModelLoaded) {
      Alert.alert('AI Not Ready', 'The AI model is not loaded or its handle is missing. Please load it first.');
      return;
    }

    setAiThinking(true);
    try {
      if (!modelHandle) throw new Error("modelHandle is null.");

      clearStreamingListeners();
      if (msgImageUri) setImageUri(msgImageUri);

      const storedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
      const storedLevel = await AsyncStorage.getItem(LEVEL_KEY);
      const promptAddition = `The language to learn: ${storedLanguage}, The level: ${storedLevel} `;

      const currentRequestId = nextRequestIdRef.current++;

      // State machine variables
      let buffer = '';
      let state: 'SEEKING_AI' | 'IN_AI' | 'SEEKING_CLOSE' = 'SEEKING_AI';
      let aiTagCharsMatched = 0;
      let closeTagCharsMatched = 0;

      const partialSub = ExpoLlmMediapipe.addListener("onPartialResponse", (ev: PartialResponseEventPayload) => {
        if (ev.handle === modelHandle && ev.requestId === currentRequestId) {
          setAiThinking(false);
          setIsStreamingMessage(true);

          let cleanText = '';

          for (const char of ev.response) {
            buffer += char;

            // State machine logic
            switch (state) {
              case 'SEEKING_AI':
                if (char === '<') {
                  aiTagCharsMatched = 1;
                } else if (aiTagCharsMatched === 1 && char === 'A') {
                  aiTagCharsMatched = 2;
                } else if (aiTagCharsMatched === 2 && char === 'I') {
                  aiTagCharsMatched = 3;
                } else if (aiTagCharsMatched === 3 && char === '>') {
                  state = 'IN_AI';
                  buffer = '';
                } else {
                  aiTagCharsMatched = 0;
                }
                break;

              case 'IN_AI':
                if (char === '<') {
                  closeTagCharsMatched = 1;
                  state = 'SEEKING_CLOSE';
                } else {
                  cleanText += char;
                }
                break;

              case 'SEEKING_CLOSE':
                if (closeTagCharsMatched === 1 && char === '/') {
                  closeTagCharsMatched = 2;
                } else if (closeTagCharsMatched === 2 && char === 'A') {
                  closeTagCharsMatched = 3;
                } else if (closeTagCharsMatched === 3 && char === 'I') {
                  closeTagCharsMatched = 4;
                } else if (closeTagCharsMatched === 4 && char === '>') {
                  state = 'SEEKING_AI';
                  buffer = '';
                } else {
                  // Wasn't a closing tag - return to IN_AI state
                  cleanText += buffer;
                  buffer = '';
                  state = 'IN_AI';
                }
                break;
            }
          }

          // Update UI with new content
          setStreamedMessage(prev => {
            if (!prev) {
              return {
                id: Date.now().toString(),
                text: cleanText,
                sender: 'system',
                timestamp: getTimestamp()
              };
            }
            const updated = {
              ...prev,
              text: prev.text + cleanText
            };

            // Also update in messages array
            //             setMessages(prevMsgs =>
            //               prevMsgs.map(msg =>
            //                 msg.id === updated.id ? updated : msg
            //               )
            //             );

            return updated;
          });
        }
      });

      streamingListenersRef.current.push(partialSub);

      await LingoProMultimodal.generateResponseAsync(
        modelHandle,
        currentRequestId,
        promptAddition + textInput,
        msgImageUri ?? imageUri ?? '',
        useAgenticTools,
      );

    } catch (error: any) {
      console.error("Error calling MediaPipe AI:", error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: `Error: ${error.message || 'Please try again.'}`,
        sender: 'system',
        timestamp: getTimestamp()
      }]);
    } finally {
      setStreamedMessage(currentStreamedMessage => {
        if (currentStreamedMessage && currentStreamedMessage.text) {
          setMessages(prev => [...prev, currentStreamedMessage]);
        }
        return null;
      });
      setIsStreamingMessage(false);
      setAiThinking(false);
    }
  }, [
    isModelLoaded,
    modelHandle,
    clearStreamingListeners,
    setMessages,
    setAiThinking,
    setStreamedMessage,
    setIsStreamingMessage,
    setImageUri,
    imageUri,
    useAgenticTools,
    nextRequestIdRef,
    streamingListenersRef
  ]);

  const stopRecording = useCallback(async () => {
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
  }, [
    recording,
    processMessageWithAI,
  ]);

  // --- AI Message Processing ---

  const handleSendText = useCallback(() => {
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
  }, [inputText, selectedImage, processMessageWithAI]);


  // Function to play AI message audio
  const playAiMessageAudio = useCallback((textToSpeak: string) => {
    Speech.speak(textToSpeak, { language: 'en-US' });
  }, []);


  // Function to play voice message audio
  const playVoiceMessage = useCallback((audioUri: string) => {
    setUri(audioUri);
    audioPlayer.play();
  }, [audioPlayer]);


  // Function to handle image selection
  const handleImageSelection = useCallback(async () => {
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
  }, []);

  const handleImageRemoval = useCallback(() => {
    setSelectedImage(null);
  }, []);


  const toggleInputMode = useCallback(() => {
    if (recording && recording.isRecording) {
      stopRecording(); // Stop recording before switching mode
    }
    setCurrentMode(prevMode => (prevMode === 'text' ? 'voice' : 'text'));
  }, [recording]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleToggleTools = useCallback(() => {
    setUseAgenticTools(prev => !prev);
  }, []);
  const rightComponents = React.useMemo(() => [
    <ToolsToggle
      key="tools-toggle"
      useAgenticTools={useAgenticTools}
      onToggle={handleToggleTools}
    />
  ], [useAgenticTools, handleToggleTools]);

  // Handle initial image prompt and message display
  useEffect(() => {
    if (paramImageUri && isModelLoaded && !initialPromptSentRef.current) {
      initialPromptSentRef.current = true;
      console.log('Received image URI:', paramImageUri);
      setImageUri(paramImageUri as string);

      setMessages(prevMessages => [...prevMessages, {
        id: Date.now().toString(),
        text: "Here is an image for us to discuss.",
        sender: 'user',
        timestamp: getTimestamp(),
        attachedImageUrl: paramImageUri,
      }]);

      const initialPrompt = "Can you describe the image in English and in the learning language, in between <sumImage></sumImage> put only English description";
      processMessageWithAI(initialPrompt, null, paramImageUri, 'text');
    } else if (!paramImageUri) {
      console.warn("No photo URI provided for Chat. Redirecting to main page.");
      router.replace('/main-page');
    }
  }, [paramImageUri, isModelLoaded, processMessageWithAI]);


  // Unload the model when leaving chat
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
  }, [releaseLoadedModel, router]);

  // Request audio permissions
  useEffect(() => {
    (async () => {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        Alert.alert('Permission Required', 'Permission to access microphone is required for voice input.');
      }
    })();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ChatHeader
        title="AI Chat"
        onBack={handleBack}
        rightComponents={rightComponents}
      />

      <ModelLoadingOverlay isVisible={isLoadingModel} />

      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <MessageList
          messages={messages}
          streamedMessage={streamedMessage}
          isStreamingMessage={iSStreamingMessage}
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
          isStreamingMessage={iSStreamingMessage || aiThinking}
          onTextChange={setInputText}
          onSendText={handleSendText}
          onImageSelect={handleImageSelection}
          onRemoveImage={handleImageRemoval}
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
import { ChatHeader, InputMode, MessageInput, MessageList, ModelLoadingOverlay } from '@/components/chat';
import { ChatMessage as ChatMessageType } from '@/components/chat/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioModule, AudioRecorder, RecorderState, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import { default as ExpoLlmMediapipe, default as LingoProMultimodal, NativeModuleSubscription, PartialResponseEventPayload } from 'lingopro-multimodal-module';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useModel } from './context/ModelContext';
import { DEFAULT_MODEL_PATH } from "./initial-page";
import { LANGUAGE_KEY, LEVEL_KEY } from './main-page';

export default function ChatScreen() {
  // Receive modelHandle from context
  const {
    modelHandle,
    isModelLoaded,
    isLoadingModel,
    modelLoadError,
    loadModel,
    releaseLoadedModel
  } = useModel();

  const [currentMode, setCurrentMode] = useState<InputMode>('text');
  const [recording, setRecording] = useState<AudioRecorder | undefined>();
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [iSStreamingMessage, setIsStreamingMessage] = useState<boolean>(false);
  const [streamedMessage, setStreamedMessage] = useState<ChatMessageType | null>(null);

  const [aiThinking, setAiThinking] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);

  const [inputText, setInputText] = useState('');
  const [waveformHeights, setWaveformHeights] = useState<number[]>(Array(20).fill(5));
  const waveformIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStateRef = useRef<RecorderState>(null);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  recordingStateRef.current = useAudioRecorderState(audioRecorder);
  const [uri, setUri] = useState<string>('');
  const audioPlayer = useAudioPlayer(uri);

  const nextRequestIdRef = useRef(0);
  const streamingListenersRef = useRef<NativeModuleSubscription[]>([]);
  // A ref to track if streaming has started for the current request
  const hasStartedStreamingRef = useRef(false);
  // A ref to store the full streamed text as it arrives
  const streamedTextRef = useRef('');
  const fullResponseRef = useRef('');

  const initialPromptSentRef = useRef(false); // Flag to ensure initial message is sent only once

  // --- Suggestions state and handlers ---
  const [showSuggestions, setShowSuggestions] = useState<boolean>(true);
  const handleSuggestionClick = useCallback((suggestion: string) => {
    setInputText(suggestion);
    setShowSuggestions(false);
  }, []);

  // Always show suggestions when inputText is null or empty
  useEffect(() => {
    if (!inputText || inputText.trim() === "") setShowSuggestions(true);
    else setShowSuggestions(false);
  }, [inputText]);

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

  const processMessageWithAI = useCallback(async (textInput: string, audioUri: string | null, mode: InputMode) => {
    if (!isModelLoaded) {
      Alert.alert('AI Not Ready', 'The AI model is not loaded or its handle is missing. Please load it first.');
      return;
    }

    setAiThinking(true);          // AI is thinking
    setIsStreamingMessage(false); // Not yet streaming
    setIsSummarizing(false);      // Not summarizing yet

    hasStartedStreamingRef.current = false; // Reset the ref for a new request
    streamedTextRef.current = ''; // Reset the text ref for a new request
    let seenClosingAI = false;

    try {
      if (!modelHandle) throw new Error("modelHandle is null.");

      clearStreamingListeners();

      const storedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
      const storedLevel = await AsyncStorage.getItem(LEVEL_KEY);
      const promptAddition = `The language to learn: ${storedLanguage || 'English'}, The level: ${storedLevel || 'beginner'} `;

      const currentRequestId = nextRequestIdRef.current++;

      // State machine variables for parsing AI response tags
      let buffer = '';
      let state: 'SEEKING_AI' | 'IN_AI' | 'SEEKING_CLOSE' = 'SEEKING_AI';
      let aiTagCharsMatched = 0;
      let closeTagCharsMatched = 0;


      const partialSub = ExpoLlmMediapipe.addListener("onPartialResponse", (ev: PartialResponseEventPayload) => {
        if (ev.handle === modelHandle && ev.requestId === currentRequestId) {
          // This check ensures we only transition states once per request
          if (!hasStartedStreamingRef.current) {
            setIsStreamingMessage(true);
            setAiThinking(false);
            hasStartedStreamingRef.current = true;
          }

          let cleanText = '';

          for (const char of ev.response) {
            buffer += char;
            fullResponseRef.current += char;

            if (seenClosingAI && !isSummarizing && !char.match(/\s/) && char !== '<') {
              setIsSummarizing(true);
            }

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
                  seenClosingAI = true;
                } else {
                  cleanText += buffer;
                  buffer = '';
                  state = 'IN_AI';
                }
                break;
            }
          }

          // Update the ref with the new text
          streamedTextRef.current += cleanText;

          // Update UI with the full content from the ref
          setStreamedMessage({
            id: Date.now().toString(),
            text: streamedTextRef.current,
            sender: 'system',
            timestamp: getTimestamp()
          });
        }
      });

      streamingListenersRef.current.push(partialSub);

      const logSub = ExpoLlmMediapipe.addListener("logging", (ev) => {
        console.log("[", ev.handle, "] ", ev.message)
      });
      streamingListenersRef.current.push(logSub);

      // Call generateResponseAsync without imageUri
      await LingoProMultimodal.generateResponseAsync(
        modelHandle,
        currentRequestId,
        promptAddition + textInput,
        '', // No image URI
        false, // No agentic tools
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
      // Use the final buffered text for summarization
      await LingoProMultimodal.updateSummaries(fullResponseRef.current);

      // This is the final cleanup block that runs after the response is complete
      setStreamedMessage(currentStreamedMessage => {
        if (currentStreamedMessage && currentStreamedMessage.text) {
          setMessages(prev => [...prev, currentStreamedMessage]);
        }
        return null;
      });
      // Reset the states for the next message
      setIsStreamingMessage(false);
      setAiThinking(false);
      setIsSummarizing(false);

      streamedTextRef.current = '';
      fullResponseRef.current = '';
    }
  }, [
    isModelLoaded,
    modelHandle,
    clearStreamingListeners,
    setMessages,
    setAiThinking,
    setStreamedMessage,
    setIsStreamingMessage,
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

    try {
      await recording.stop();
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      const uri = recording.uri;
      if (uri) {
        setUri(uri);

        const userMessage: ChatMessageType = {
          id: Date.now().toString(),
          text: "Voice message",
          sender: 'user',
          timestamp: getTimestamp(),
          audioUri: uri,
        };

        setMessages(prevMessages => [...prevMessages, userMessage]);
        processMessageWithAI("Voice message", uri, 'voice');
        setCurrentMode('text');
      } else {
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

  const handleSendText = useCallback(() => {
    if (inputText.trim()) {
      const userMessage: ChatMessageType = {
        id: Date.now().toString(),
        text: inputText.trim(),
        sender: 'user',
        timestamp: getTimestamp(),
      };

      setMessages(prevMessages => [...prevMessages, userMessage]);
      setInputText('');
      processMessageWithAI(userMessage.text, null, 'text');
    }
  }, [inputText, processMessageWithAI]);

  // Track if audio is currently playing
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Function to play AI message audio
  const playAiMessageAudio = useCallback((textToSpeak: string) => {
    setIsPlayingAudio(true);
    Speech.speak(textToSpeak, {
      language: 'en-US', // Default to English for TTS
      onDone: () => setIsPlayingAudio(false),
      onStopped: () => setIsPlayingAudio(false),
      onError: () => setIsPlayingAudio(false),
    });
  }, []);

  // Function to play voice message audio
  const playVoiceMessage = useCallback((audioUri: string) => {
    setUri(audioUri);
    setIsPlayingAudio(true);
    audioPlayer.play();
    // You may want to add a listener to setIsPlayingAudio(false) when playback ends
  }, [audioPlayer]);

  // Function to stop TTS audio
  const handleCancelAudio = useCallback(() => {
    Speech.stop();
    setIsPlayingAudio(false);
  }, []);

  const toggleInputMode = useCallback(() => {
    if (recording && recording.isRecording) {
      stopRecording();
    }
    setCurrentMode(prevMode => (prevMode === 'text' ? 'voice' : 'text'));
  }, [recording]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  // Handle initial dummy message and model loading
  useEffect(() => {
    if (isModelLoaded && !initialPromptSentRef.current) {
      initialPromptSentRef.current = true;
      const initialMessage: ChatMessageType = {
        id: Date.now().toString(),
        text: "Hello! How can I help you learn today?",
        sender: 'system',
        timestamp: getTimestamp(),
      };
      setMessages(prevMessages => [...prevMessages, initialMessage]);
    }
  }, [isModelLoaded]);


  // Unload the model when leaving chat
  useEffect(() => {
    const backAction = () => {
      releaseLoadedModel();
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
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

  // ====== MAIN VIEW REGION START ======
  return (
    <SafeAreaView style={styles.safeArea}>
      <ChatHeader
        title="AI Chat"
        onBack={handleBack}
      // No rightComponents for tools toggle
      />
      <ModelLoadingOverlay isVisible={isLoadingModel} />
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* ====== DISPLAY: Main Chat View ====== */}
        <MessageList
          messages={messages}
          streamedMessage={streamedMessage}
          isStreamingMessage={iSStreamingMessage}
          aiThinking={aiThinking}
          isSummarizing={isSummarizing}
          onPlayVoiceMessage={playVoiceMessage}
          onPlayAiAudio={playAiMessageAudio}
          showSuggestions={showSuggestions}
          onSuggestionClick={handleSuggestionClick}
          isPlayingAudio={isPlayingAudio}
          onCancelAudio={handleCancelAudio}
        />
        {/* ====== DISPLAY: Message Input ====== */}
        <MessageInput
          currentMode={currentMode}
          inputText={inputText}
          // selectedImage removed
          isRecording={!!recording?.isRecording}
          waveformHeights={waveformHeights}
          isModelReady={isModelLoaded}
          isLoadingModel={isLoadingModel}
          isStreamingMessage={iSStreamingMessage || aiThinking}
          onTextChange={setInputText}
          onSendText={handleSendText}
          // onImageSelect removed
          // onRemoveImage removed
          onToggleMode={toggleInputMode}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
          isPlayingAudio={isPlayingAudio}
          onCancelAudio={handleCancelAudio} selectedImage={null} onImageSelect={function (): void {}}
          onRemoveImage={function (): void { }} />
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
  toolsButton: { // Kept for reference, but not used in this version
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    backgroundColor: '#e0e0e0',
    marginRight: 10,
  },
  toolsButtonActive: { // Kept for reference
    backgroundColor: '#007AFF',
  },
  toolsButtonText: { // Kept for reference
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  toolsButtonTextActive: { // Kept for reference
    color: '#fff',
  },
  suggestionsContainer: { // Kept for reference
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 70, // adjust as needed to sit above input
    zIndex: 100,
    backgroundColor: '#f0f4f8',
    paddingTop: 10,
    paddingBottom: 8,
  },
});

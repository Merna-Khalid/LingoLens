import { Audio } from 'expo-av'; // Still needed for Audio.setAudioModeAsync (global audio settings)
import * as FileSystem from 'expo-file-system'; // Import FileSystem for base64 conversion
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech'; // For text-to-speech
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const API_KEY = ""; // Your Gemini API Key here (or leave empty for Canvas runtime)

// Define chat message interface
interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: string;
}

// Waveform bar component
const WaveformBar: React.FC<{ height: number }> = ({ height }) => (
  <View style={[styles.waveformBar, { height: Math.max(5, height) }]} /> // Min height to always be visible
);

export default function VoiceChatScreen() {
  const { photoUri: paramImageUri } = useLocalSearchParams();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | undefined>(); // Changed type to Recording from expo-audio
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [aiThinking, setAiThinking] = useState(false);
  const [waveformHeights, setWaveformHeights] = useState<number[]>(Array(20).fill(5)); // For waveform visualization
  const scrollViewRef = useRef<ScrollView>(null);
  const waveformIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
      console.warn("No photo URI provided for Voice Chat. Redirecting to main page.");
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

    return () => {
      // Clean up recording if component unmounts while recording
      if (recording) {
        recording.stopAndUnloadAsync();
      }
      if (waveformIntervalRef.current) {
        clearInterval(waveformIntervalRef.current);
      }
    };
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

  // Start recording
  async function startRecording() {
    try {
      setIsRecording(true);
      await Audio.setAudioModeAsync({ // Still from expo-av for audio mode settings
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // --- CORRECTED: Use new Recording() and prepare/start methods ---
      const newRecording = new Audio.Recording();
      await newRecording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await newRecording.startAsync();
      setRecording(newRecording); // Set the new recording instance
      // --- END CORRECTED ---

      console.log('Recording started');

      // Start waveform simulation
      waveformIntervalRef.current = setInterval(() => {
        setWaveformHeights(prevHeights =>
          prevHeights.map(() => Math.floor(Math.random() * 50) + 5) // Random heights for simulation
        );
      }, 100) as any; // Update every 100ms

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
      await Audio.setAudioModeAsync({ // Still from expo-av for audio mode settings
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const uri = recording.getURI();
      if (uri) {
        console.log('Recording stopped and stored at', uri);
        const newMessages: ChatMessage[] = [...messages, {
          id: Date.now().toString(),
          text: "Recording captured. Analyzing...", // Placeholder for actual transcription
          sender: 'user',
          timestamp: getTimestamp(),
        }];
        setMessages(newMessages);

        // Process audio and send to AI
        processAudioForAI(uri);
      } else {
        console.error('Recording URI is null.');
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
    } finally {
      setRecording(undefined); // Clear recording object
    }
  }

  // Function to process audio (e.g., transcribe and send to AI)
  const processAudioForAI = async (audioUri: string) => {
    setAiThinking(true);
    try {
      // In a real scenario, you'd send the audio file to a transcription service
      // or directly to a multimodal AI if it supports audio input.
      // For this example, we'll simulate transcription and then send a text prompt with the image.

      // Convert audio to base64 if needed for some APIs (not directly for Gemini 2.0 Flash text generation)
      // const base64Audio = await FileSystem.readAsStringAsync(audioUri, { encoding: FileSystem.EncodingType.Base64 });

      // Simulate transcription
      const simulatedTranscript = "Can you describe the main elements you see in this image?";
      const aiMessageId = (Date.now() + 1).toString();

      // Update the "Recording captured. Analyzing..." message with the simulated transcript
      setMessages(prevMessages => {
        const lastMessage = prevMessages[prevMessages.length - 1];
        if (lastMessage && lastMessage.text === "Recording captured. Analyzing...") {
          return prevMessages.map((msg, index) =>
            index === prevMessages.length - 1 ? { ...msg, text: simulatedTranscript } : msg
          );
        }
        return prevMessages; // If the placeholder message wasn't the last one, just return prevMessages
      });


      // Prepare prompt for Gemini API with image
      // Ensure imageUri is not null before proceeding
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
      chatHistory.push({ role: "user", parts: [{ text: simulatedTranscript }] });

      const payload: any = {
        contents: [
          {
            role: "user",
            parts: [
              { text: simulatedTranscript },
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
        id: aiMessageId,
        text: aiResponseText,
        sender: 'ai',
        timestamp: getTimestamp(),
      }]);

      // Speak the AI response
      Speech.speak(aiResponseText, { language: 'en-US' });

    } catch (error) {
      console.error("Error processing audio or calling AI:", error);
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Voice Chat</Text>
        <TouchableOpacity style={styles.shareButton}>
          <Text style={styles.shareButtonText}>📤</Text>
        </TouchableOpacity>
      </View>

      {/* Image Preview */}
      {imageUri && (
        <View style={styles.imagePreviewContainer}>
          <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
        </View>
      )}

      {/* Chat Messages */}
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

      {/* Bottom Toolbar */}
      <View style={styles.toolbarContainer}>
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

        <TouchableOpacity style={styles.saveTranscriptButton}>
          <Text style={styles.saveTranscriptButtonText}>Save Transcript</Text>
        </TouchableOpacity>
      </View>
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
  toolbarContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    paddingVertical: 15,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
    alignItems: 'center',
  },
  waveformRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end', // Align bars to the bottom
    height: 60, // Fixed height for waveform area
    width: '80%', // Adjust width as needed
    marginBottom: 15,
  },
  waveformBar: {
    width: 4, // Width of each bar
    backgroundColor: '#007AFF',
    marginHorizontal: 1,
    borderRadius: 2,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
    marginBottom: 15,
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
    backgroundColor: '#dc3545', // Red for record
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
  saveTranscriptButton: {
    backgroundColor: '#e0eaff', // Light blue for save transcript
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 25,
    width: '80%',
    alignItems: 'center',
  },
  saveTranscriptButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
});

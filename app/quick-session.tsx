import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

export default function QuickSessionScreen() {
  const { photoUri } = useLocalSearchParams();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false); // New state to track image loading errors

  useEffect(() => {
    if (photoUri) {
      setImageUri(photoUri as string);
      setLoading(false);
      setImageError(false); // Reset error state when a new URI is set
    } else {
      console.warn("No photo URI provided for Quick Session. Redirecting to main page.");
      router.replace('/main-page'); // Go back to main page if no image URI
    }
  }, [photoUri]);

  const handleImageError = (error: any) => {
    console.error("Image loading error:", error.nativeEvent.error);
    setImageError(true); // Set error state
    setLoading(false); // Stop loading indicator
  };

  const handleBack = () => {
    router.back(); // Go back to the previous screen (camera page)
  };

  const handleRetake = () => {
    router.replace('/camera-page'); // Go back to camera to retake
  };

  const handleChatAI = () => {
    console.log("Chat AI button pressed!");
    // Implement Chat AI functionality here, potentially passing the imageUri
    router.push({ pathname: '/text-chat', params: { photoUri: imageUri } });
  };

  const handleVoiceAI = () => {
    console.log("Voice AI button pressed!");
    router.push({ pathname: '/voice-chat', params: { photoUri: imageUri } });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading image...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Photo Preview</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.imageContainer}>
        {imageUri && !imageError ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.capturedImage}
            resizeMode="contain"
            onError={handleImageError} // Add onError handler
          />
        ) : (
          <View style={styles.imageErrorContainer}>
            <Text style={styles.imageErrorText}>Failed to load image.</Text>
            <Text style={styles.imageErrorSubText}>Please try retaking the photo.</Text>
          </View>
        )}
      </View>

      <View style={styles.bottomControls}>
        <TouchableOpacity style={styles.controlButton} onPress={handleBack}>
          <Text style={styles.controlIcon}>←</Text>
          <Text style={styles.controlText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlButton} onPress={handleRetake}>
          <Text style={styles.controlIcon}>📸</Text>
          <Text style={styles.controlText}>Retake</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlButton} onPress={handleChatAI}>
          <Text style={styles.controlIcon}>💬</Text>
          <Text style={styles.controlText}>Chat AI</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlButton} onPress={handleVoiceAI}>
          <Text style={styles.controlIcon}>🎤</Text>
          <Text style={styles.controlText}>Voice AI</Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f4f8',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#555',
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
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000', // Black background for image preview
    marginVertical: 10, // Some margin
    borderRadius: 15, // Rounded corners for the image container
    overflow: 'hidden', // Ensures image respects border radius
  },
  capturedImage: {
    width: '100%',
    height: '100%',
  },
  imageErrorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#333', // Dark background for error message
    width: '100%',
    height: '100%',
  },
  imageErrorText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  imageErrorSubText: {
    color: '#ccc',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  bottomControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    paddingVertical: 15,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  controlButton: {
    alignItems: 'center',
    padding: 10,
  },
  controlIcon: {
    fontSize: 30,
    color: '#555',
    marginBottom: 5,
  },
  controlText: {
    fontSize: 12,
    color: '#555',
  },
});

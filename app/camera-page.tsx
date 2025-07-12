import { CameraType, CameraView, FlashMode, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system'; // Import FileSystem
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

export default function CameraPageScreen() {
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [isNightMode, setIsNightMode] = useState(false); // State for night mode button visual
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission]);

  const toggleCameraFacing = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  const toggleFlashMode = () => {
    setFlashMode(current => {
      if (current === 'off') return 'on';
      if (current === 'on') return 'auto';
      return 'off';
    });
  };

  const toggleNightMode = () => {
    // This currently just toggles the button's visual state.
    // True "night mode" (low-light enhancement) requires advanced camera APIs or image processing
    // that is not directly available via a simple filter in expo-image-manipulator.
    setIsNightMode(current => !current);
    console.log("Night Mode toggled:", !isNightMode);
  };

  const takePicture = async () => {
    if (cameraRef.current && !isCapturing) {
      setIsCapturing(true);
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          base64: false,
          exif: false,
        });

        console.log("Captured temporary photo URI:", photo.uri);

        // Define a new, permanent URI in the app's document directory
        const fileName = photo.uri.split('/').pop(); // Get original file name
        const newPhotoUri = FileSystem.documentDirectory + 'photos/' + fileName;

        // Ensure the 'photos' directory exists
        const dirInfo = await FileSystem.getInfoAsync(FileSystem.documentDirectory + 'photos/');
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(FileSystem.documentDirectory + 'photos/', { intermediates: true });
        }

        // Copy the captured photo to the new, permanent location
        await FileSystem.copyAsync({
          from: photo.uri,
          to: newPhotoUri,
        });

        console.log("Copied photo to permanent URI:", newPhotoUri);

        router.replace({
          pathname: '/quick-session',
          params: { photoUri: newPhotoUri }, // Pass the permanent URI
        });
      } catch (error) {
        console.error("Failed to take picture or save file:", error);
      } finally {
        setIsCapturing(false);
      }
    }
  };

  if (!permission) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Requesting camera permission...</Text>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionDeniedContainer}>
        <Text style={styles.permissionDeniedText}>We need your permission to show the camera.</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.permissionButton, {marginTop: 10, backgroundColor: '#6c757d'}]} onPress={() => router.back()}>
          <Text style={styles.permissionButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.cameraContainer}> 
        <CameraView
          style={StyleSheet.absoluteFillObject} // Make CameraView fill the container
          facing={facing}
          flash={flashMode}
          ref={cameraRef}
        />

        <View style={styles.topControls}>
          <TouchableOpacity style={styles.controlButton} onPress={() => router.back()}>
            <Text style={styles.controlButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.cameraTitle}>Camera</Text>
          <TouchableOpacity style={styles.controlButton} onPress={toggleCameraFacing}>
            <Text style={styles.controlButtonText}>🔄</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomControls}>
          <TouchableOpacity style={[styles.controlButton, isNightMode && styles.activeControlButton]} onPress={toggleNightMode}>
            <Text style={styles.controlButtonText}>🌙</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.captureButton} onPress={takePicture} disabled={isCapturing}>
            {isCapturing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.captureButtonIcon}>◎</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.controlButton, flashMode !== 'off' && styles.activeControlButton]} onPress={toggleFlashMode}>
            <Text style={styles.controlButtonText}>
              {flashMode === 'off' ? '⚡' : flashMode === 'on' ? '⚡' : 'A'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
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
  permissionDeniedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8d7da', // Light red background
    padding: 20,
  },
  permissionDeniedText: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
    color: '#721c24', // Dark red text
  },
  permissionButton: {
    backgroundColor: '#dc3545', // Red button
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cameraContainer: { // New style for the container holding CameraView and controls
    flex: 1,
  },
  camera: { // This style is now applied via StyleSheet.absoluteFillObject
    // flex: 1, // Removed as absoluteFillObject handles sizing
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 30 : 0, // Adjust for Android status bar
    backgroundColor: 'rgba(0,0,0,0.4)', // Semi-transparent background
    paddingBottom: 10,
    position: 'absolute', // Absolute positioning
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10, // Ensure it's above the camera view
  },
  cameraTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  controlButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 30,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 10,
  },
  activeControlButton: {
    backgroundColor: '#007AFF', // Highlight active state
  },
  controlButtonText: {
    fontSize: 24,
    color: '#fff',
  },
  bottomControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingBottom: 40, // More padding for bottom controls
    backgroundColor: 'rgba(0,0,0,0.4)', // Semi-transparent background
    paddingTop: 10,
    position: 'absolute', // Absolute positioning
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10, // Ensure it's above the camera view
  },
  captureButton: {
    backgroundColor: '#fff',
    borderRadius: 45,
    width: 90,
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 5,
    borderColor: 'rgba(255,255,255,0.5)',
    marginHorizontal: 20,
  },
  captureButtonIcon: {
    fontSize: 40,
    color: '#007AFF', // Blue dot inside
  },
});

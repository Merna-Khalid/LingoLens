import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { router } from 'expo-router';
import ExpoLlmMediapipe, { DownloadProgressEvent, NativeModuleSubscription } from 'lingopro-multimodal-module';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useModel } from './context/ModelContext';

// const DOWNLOADABLE_MODEL_URL = 'https://huggingface.co/t-ghosh/gemma-tflite/resolve/main/gemma-1.1-2b-it-cpu-int4.bin';
// const DOWNLOADABLE_MODEL_NAME = 'gemma-1.1-2b-it-cpu-int4.bin';

// const DOWNLOADABLE_MODEL_URL = "https://huggingface.co/MrZeggers/gemma-3n-mobile/resolve/main/gemma-3n-E4B-it-int4.task?download=true";
const DOWNLOADABLE_MODEL_URL = "http://192.168.1.9:8069/gemma-3n-E4B-it-int4.task";
const DOWNLOADABLE_MODEL_NAME = "gemma-3n-E4B-it-int4.task";

const MODELS_BASE_DIR = `${FileSystem.documentDirectory}`;
export const DEFAULT_MODEL_PATH = MODELS_BASE_DIR + DOWNLOADABLE_MODEL_NAME;
const USER_FILES_DIR = `${MODELS_BASE_DIR}`;

// Define possible states for the UI flow of this page
type AppUIState = "not_downloaded" | "downloading" | "downloaded" | "error" | "checking" | 'loading' | 'ready' | 'options';
type ActiveModelType = 'default-downloadable' | 'user-file' | null;

export default function InitialPage() {
  const [appUIState, setAppUIState] = useState<AppUIState>('checking');

  const [logs, setLogs] = useState<string[]>([]);
  const [activeModelType, setActiveModelType] = useState<ActiveModelType>(null);

  const downloadProgressListenerRef = useRef<NativeModuleSubscription | null>(null);
  const streamingListenersRef = useRef<NativeModuleSubscription[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [isLoadingAction, setIsLoadingAction] = useState<boolean>(false);

  const { loadModel, isModelLoaded, isLoadingModel, modelLoadError, releaseLoadedModel } = useModel();

  // Logging helper: Adds a timestamped message to the logs state and console
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const logMessage = '[' + timestamp + '] ' + message;
    setLogs(prev => [...prev.slice(-100), logMessage]); // Keep last 100 logs
    console.log(logMessage);
  }, []);

  // Function to navigate to the welcome screen
  const navigateToWelcomeScreen = useCallback(() => {
    addLog("Navigating to welcome screen...");
    setTimeout(() => router.replace('/welcome-screen'), 100);
  }, [addLog]);


  const doesModelExistAtDefaultLocation = async (): Promise<boolean> => {
    const info = await FileSystem.getInfoAsync(DEFAULT_MODEL_PATH);
    return info.exists;
  };

  // Initial check on component mount to determine appUIState
    useEffect(() => {
      const checkIfReadyOrOptions = async () => {
        if (appUIState === 'checking') {
          if (isModelLoaded) {
            // If model is already loaded in context, navigate to welcome screen
            addLog("Model already loaded in memory. Navigating to welcome screen.");
            navigateToWelcomeScreen();
          } else {
            // If not loaded, check if the default model file exists on disk
            const exists = await doesModelExistAtDefaultLocation();
            if (exists) {
              // If file exists, set state to 'downloaded' (meaning file is present, but not loaded into memory)
              setAppUIState('downloaded');
              addLog("Default model file found on disk. Ready to load.");
            } else {
              // If file doesn't exist, offer options to download or load from file
              setAppUIState('options');
              addLog("Default model file not found. Presenting options.");
            }
          }
        }
      };
      checkIfReadyOrOptions();
    }, [appUIState, isModelLoaded, navigateToWelcomeScreen]); // Depend on appUIState and isModelLoaded

    // Effect to handle model loading status changes from context
  useEffect(() => {
    if (isLoadingModel) {
      setAppUIState('loading');
    } else if (isModelLoaded) {
      setAppUIState('ready');
      navigateToWelcomeScreen(); // Navigate once model is confirmed loaded
    } else if (modelLoadError) {
      setAppUIState('error');
      addLog(`Model loading error from context: ${modelLoadError}`);
    }
  }, [isLoadingModel, isModelLoaded, modelLoadError, navigateToWelcomeScreen, addLog]);

  const clearStreamingListeners = () => {
    streamingListenersRef.current.forEach(sub => sub.remove());
    streamingListenersRef.current = [];
  };

  // Effect for setting up and cleaning up download progress listener
    useEffect(() => {
      if (!downloadProgressListenerRef.current) {
        downloadProgressListenerRef.current = ExpoLlmMediapipe.addListener(
          "downloadProgress",
          async (event: DownloadProgressEvent) => {
            addLog("Download event status: " + event.status);
            if (event.status === "downloading") {
              setAppUIState("downloading");
              setDownloadProgress(event.progress ?? 0);
              setIsLoadingAction(true);
            } else if (event.status === "completed") {
              setDownloadProgress(1);
              addLog("Download completed, now attempting to load model via context...");
              // Trigger model loading via ModelContext after download completes
              await loadModel(DEFAULT_MODEL_PATH);
              setIsLoadingAction(false); // Action completed (download finished)
            } else if (event.status === "error") {
              setAppUIState("error");
              addLog(`Download Error: ${event.error || "Unknown download error"}`);
              setIsLoadingAction(false); // Stop loading indicator
            } else if (event.status === "cancelled") {
              setAppUIState("options"); // Go back to options if cancelled
              setDownloadProgress(0);
              Alert.alert("Download Cancelled");
              setIsLoadingAction(false); // Stop loading indicator
            }
          }
        );
      }

      return () => {
        // Cleanup for component unmount
        clearStreamingListeners();
        downloadProgressListenerRef.current?.remove();
        downloadProgressListenerRef.current = null;
      };
    }, [addLog, loadModel]);

  // Handler for loading model from a user-selected file
  const handleLoadFromFile = useCallback(async () => {
      setIsLoadingAction(true); // Start loading indicator for file selection/copy
      try {
        addLog("Opening document picker to select model file...");
        const result = await DocumentPicker.getDocumentAsync({
          type: Platform.OS === 'ios' ? 'public.data' : '*/*', // Universal type for Android
          copyToCacheDirectory: false, // We will copy manually
          multiple: false,
        });

        if (result.canceled || !result.assets?.[0]) {
          addLog("File selection cancelled by user.");
          setAppUIState('options'); // Go back to options if cancelled
          setIsLoadingAction(false);
          return;
        }

        const file = result.assets[0];
        setAppUIState('loading'); // Set UI state to loading while copying
        addLog(`Selected file: ${file.name} (URI: ${file.uri})`);

        // Ensure the target directory exists
        const dirInfo = await FileSystem.getInfoAsync(USER_FILES_DIR);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(USER_FILES_DIR, { intermediates: true });
          addLog("Created user files directory for file copy.");
        }

        const targetFilePath = `${USER_FILES_DIR}${file.name}`;
        addLog(`Copying selected file to ${targetFilePath}...`);

        await FileSystem.copyAsync({
          from: file.uri,
          to: targetFilePath,
        });
        addLog("File copied successfully. Now loading the model via context...");

        const fileInfo = await FileSystem.getInfoAsync(targetFilePath);
        if (fileInfo.exists && fileInfo.size > 0) {
          addLog(`✅ File exists at ${targetFilePath}, size: ${fileInfo.size} bytes`);
        } else {
          throw new Error("❌ File missing or size is 0 bytes.");
        }

        // Load the model using the context's loadModel function
        await loadModel(targetFilePath.replace("file://", ""));
        setActiveModelType('user-file');
        // appUIState will be set to 'ready' by the useEffect listening to isModelLoaded

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        addLog(`Error during file selection or copy/load: ${errorMsg}`);
        Alert.alert(
          "File Load Error",
          `Failed to load model from selected file: ${errorMsg}. Please ensure it's a valid model file and try again.`
        );
        setAppUIState('error');
      } finally {
        setIsLoadingAction(false);
      }
    }, [addLog, loadModel]);

  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

    // Handler for initiating default model download
    const handleDownloadDefaultModel = useCallback(async () => {
      if (await doesModelExistAtDefaultLocation()) {
        addLog("Default model already exists on disk. Attempting to load.");
        setAppUIState('downloaded'); // Set state to downloaded if file exists
        await loadModel(DEFAULT_MODEL_PATH); // Attempt to load it
        return;
      }

      if (appUIState === 'downloading') {
        addLog("Download already in progress.");
        return;
      }

      const MAX_RETRIES = 3;
      setActiveModelType('default-downloadable');

      setIsLoadingAction(true);
      setAppUIState('downloading');
      setDownloadProgress(0);

      try {
        let attempt = 0;
        let success = false;
        let lastError = null;

        while (attempt < MAX_RETRIES && !success) {
          try {
            const downloadResumable = FileSystem.createDownloadResumable(
              DOWNLOADABLE_MODEL_URL,
              FileSystem.documentDirectory + DOWNLOADABLE_MODEL_NAME,
              {},
              (downloadProgress) => {
                const progress =
                  downloadProgress.totalBytesWritten /
                  downloadProgress.totalBytesExpectedToWrite;
                setDownloadProgress(progress);
              }
            );

            const res = await downloadResumable.downloadAsync();
            if (!res) {
              throw new Error("Download failed");
            }
            console.log('Finished downloading to ', res.uri);
            success = true;
            // After successful download, trigger load via context
            addLog("Download successful. Now loading model via context...");
            await loadModel(DEFAULT_MODEL_PATH);
            // appUIState will transition to 'loading' and then 'ready' via the useEffect watching isModelLoaded
          } catch (error: any) {
            attempt++;
            lastError = error;
            addLog(`Attempt ${attempt} failed: ${error.message}`);
            if (attempt < MAX_RETRIES) {
              const backoff = Math.pow(2, attempt) * 500; // 500ms, 1s, 2s...
              addLog(`Retrying in ${backoff}ms...`);
              await delay(backoff);
            }
          }
        }
        if (!success) {
          throw lastError;
        }
      } catch (e: any) {
        console.error('Download failed:', e);
        addLog(`Download failed: ${e.message}`);
        setAppUIState('error');
      } finally {
        setIsLoadingAction(false);
      }
    }, [addLog, loadModel]);


  // Render a loading screen until the initial check is complete
  if (appUIState === 'checking') {
    return (
      <View style={styles.fullscreenCenter}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Initializing app...</Text>
        <Text style={styles.loadingSubText}>Checking for model status.</Text>
      </View>
    );
  }

  return (
      <ScrollView contentContainerStyle={styles.scrollViewContent} style={styles.container}>
        <Text style={styles.mainTitle}>LingoLens AI Model Setup</Text>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Model Status</Text>
          <Text style={styles.statusText}>Current State: <Text style={styles.statusValue}>{appUIState.toUpperCase()}</Text></Text>
          <Text style={styles.statusText}>Model Loaded: <Text style={styles.statusValue}>{isModelLoaded ? 'Yes' : 'No'}</Text></Text>
          {modelLoadError && (
            <Text style={styles.errorMessage}>Error: {modelLoadError}</Text>
          )}

          {(appUIState === 'options' || appUIState === 'downloaded' || appUIState === 'error') && !isLoadingModel && !isModelLoaded && (
            <View style={styles.optionsContainer}>
              <Text style={styles.message}>
                {appUIState === 'downloaded' ? 'Model downloaded to disk. Please load it to continue:' : 'Model not found or error. Please choose an action:'}
              </Text>
              <View style={styles.buttonColumn}>
                {appUIState === 'downloaded' ? (
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={async () => {
                      setAppUIState('loading'); // Optimistically set loading state
                      await loadModel(DEFAULT_MODEL_PATH);
                    }}
                    disabled={isLoadingAction || isLoadingModel}
                  >
                    <Text style={styles.primaryButtonText}>Load Downloaded Model</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleDownloadDefaultModel}
                    disabled={isLoadingAction || isLoadingModel}
                  >
                    <Text style={styles.primaryButtonText}>Download Model</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={handleLoadFromFile}
                  disabled={isLoadingAction || isLoadingModel}
                >
                  <Text style={styles.secondaryButtonText}>Load From Local File</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {appUIState === 'downloading' && (
            <View style={styles.downloadProgressContainer}>
              <Text style={styles.progressText}>Downloading Model... {Math.round(downloadProgress * 100)}%</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressBarFill, { width: `${downloadProgress * 100}%` }]} />
              </View>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={async () => {
                  // Assuming ExpoLlmMediapipe has a cancelDownload method if needed
                  // For now, this button is disabled as direct cancel is not integrated with FileSystem.createDownloadResumable
                  Alert.alert("Cancel Download", "Direct cancellation is not implemented for FileSystem.createDownloadResumable. Please restart the app if needed.");
                }}
                disabled={true} // Disable as direct cancel is not easily available for FileSystem.createDownloadResumable
              >
                <Text style={styles.cancelButtonText}>Cancel Download</Text>
              </TouchableOpacity>
            </View>
          )}

          {appUIState === 'loading' && (
            <View style={styles.loadingStateContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>Loading model into memory...</Text>
            </View>
          )}

          {appUIState === 'error' && (modelLoadError || appUIState === 'error') && (
            <View style={styles.errorStateContainer}>
              <Text style={styles.errorMessage}>An error occurred during model operation.</Text>
              {modelLoadError && <Text style={styles.errorMessage}>Details: {modelLoadError}</Text>}
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => {
                  // Reset to options to allow retrying
                  setAppUIState('options');
                  setActiveModelType(null); // Clear active model type on error
                }}
              >
                <Text style={styles.primaryButtonText}>Retry / Go to Options</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Release Button - only show if a model is currently loaded */}
          {isModelLoaded && appUIState !== 'checking' && appUIState !== 'loading' && appUIState !== 'downloading' && (
            <TouchableOpacity
              style={styles.releaseButton}
              onPress={async () => {
                Alert.alert(
                  "Confirm Release",
                  "Are you sure you want to release the currently loaded model? This will unload it from memory.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Release", onPress: async () => {
                        try {
                          await releaseLoadedModel();
                          addLog(`Released model.`);
                          setAppUIState('options'); // Go back to options after release
                          setActiveModelType(null);
                        } catch (e: any) {
                          addLog(`Error during model release: ${e.message}`);
                          Alert.alert("Release Error", `Failed to release model: ${e.message}`);
                          // Stay on current state or go to error state if release fails badly
                          setAppUIState('error');
                        }
                      }
                    }
                  ]
                );
              }}
              disabled={isLoadingAction || isLoadingModel}
            >
              <Text style={styles.releaseButtonText}>Release Loaded Model</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Application Logs</Text>
          <ScrollView style={styles.logsContainer}>
            {logs.map((log, i) => (
              <Text key={i} style={styles.logText}>{log}</Text>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f8', // Light background for the whole screen
  },
  scrollViewContent: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'center', // Center content vertically
  },
  fullscreenCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f4f8',
  },
  mainTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1a202c',
    textAlign: 'center',
    marginBottom: 30,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  statusText: {
    fontSize: 16,
    color: '#555',
    marginBottom: 5,
    textAlign: 'center',
  },
  statusValue: {
    fontWeight: 'bold',
    color: '#007AFF', // Highlight status values
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  errorMessage: {
    fontSize: 16,
    color: '#c0392b', // Dark red text
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: 'bold',
  },
  errorMessageDetail: {
    fontSize: 14,
    color: '#c0392b',
    textAlign: 'center',
    marginBottom: 15,
  },
  optionsContainer: {
    marginTop: 10,
    alignItems: 'center',
  },
  buttonColumn: {
    flexDirection: 'column',
    gap: 15, // Space between buttons
    width: '80%', // Make buttons slightly narrower
    maxWidth: 300,
  },
  primaryButton: {
    backgroundColor: '#007AFF', // Blue for primary actions
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 3,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: '#28a745', // Green for secondary actions (Load from File)
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#28a745',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 3,
  },
  secondaryButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  releaseButton: {
    backgroundColor: '#dc3545', // Red for destructive actions
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 25,
    shadowColor: '#dc3545',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 3,
  },
  releaseButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  downloadProgressContainer: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  progressText: {
    fontSize: 16,
    color: '#555',
    marginBottom: 10,
    fontWeight: 'bold',
  },
  progressBar: {
    height: 12,
    width: '90%',
    backgroundColor: '#e0e0e0',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 15,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#007AFF', // Blue progress bar fill
    borderRadius: 6,
  },
  cancelButton: {
    backgroundColor: '#ffc107', // Orange for cancel
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#ffc107',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 3,
  },
  cancelButtonText: {
    color: '#343a40', // Dark text for contrast
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingStateContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  loadingSubText: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  errorStateContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
    padding: 15,
    backgroundColor: '#ffebee', // Light red background
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ef9a9a', // Darker red border
  },
  logsContainer: {
    maxHeight: 200,
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  logText: {
    fontSize: 12,
    color: '#495057',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 18,
  },
});

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { router } from 'expo-router';
import ExpoLlmMediapipe, { DownloadProgressEvent, NativeModuleSubscription } from 'lingopro-multimodal-module';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';



// const DOWNLOADABLE_MODEL_URL = "https://huggingface.co/MrZeggers/gemma-3n-mobile/resolve/main/gemma-3n-E4B-it-int4.task?download=true";
const DOWNLOADABLE_MODEL_URL = "http://192.168.1.9:8069/gemma-3n-E4B-it-int4.task";
const DOWNLOADABLE_MODEL_NAME = "gemma-3n-E4B-it-int4.task";

// const DOWNLOADABLE_MODEL_URL = 'https://huggingface.co/t-ghosh/gemma-tflite/resolve/main/gemma-1.1-2b-it-cpu-int4.bin';
// const DOWNLOADABLE_MODEL_NAME = 'gemma-1.1-2b-it-cpu-int4.bin';

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

  useEffect(() => {
    const checkIfReadyOfOptions = async () => {
      if (appUIState == 'checking') {
        const exists = await doesModelExistAtDefaultLocation();
        if (exists) {
          navigateToWelcomeScreen();
        } else {
          setAppUIState('options');
        }
      }
    };
    checkIfReadyOfOptions();
  }, []);

  const clearStreamingListeners = () => {
    streamingListenersRef.current.forEach(sub => sub.remove());
    streamingListenersRef.current = [];
  };
  useEffect(() => {
    if (!downloadProgressListenerRef.current) {
      downloadProgressListenerRef.current = ExpoLlmMediapipe.addListener(
        "downloadProgress",
        async (event: DownloadProgressEvent) => {
          addLog("current event =" + event.status)
          if (event.status === "downloading") {
            addLog("starting to download homie" + event.progress)
            setAppUIState("downloading");
            setDownloadProgress(event.progress ?? 0);
            setIsLoadingAction(true);
          } else if (event.status === "completed") {
            setAppUIState("loading");
            setDownloadProgress(1);
            setIsLoadingAction(true);
            addLog("Download completed, now loading model...");
            navigateToWelcomeScreen();
            // TODO: Load the downloaded model
          } else if (event.status === "error") {
            setAppUIState("error");
            addLog(event.error || "Unknown download error");
            addLog(`Download Error: ${event.error}`);
            setIsLoadingAction(false); // Stop loading indicator
          } else if (event.status === "cancelled") {
            setAppUIState("not_downloaded");
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
      // Model release is handled by the other useEffect dependent on modelHandle
    };
  }, []); // Empty dependency array: runs once on mount, cleans up on unmount

  // Handler for loading model from a user-selected file
  const handleLoadFromFile = useCallback(async () => {
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
      addLog("File copied successfully. Now loading the model...");

      const fileInfo = await FileSystem.getInfoAsync(targetFilePath);
      if (fileInfo.exists && fileInfo.size > 0) {
        addLog(`✅ File exists at ${targetFilePath}, size: ${fileInfo.size} bytes`);
      } else {
        throw new Error("❌ File missing or size is 0 bytes.");
      }

      // Load the model using the native module
      const modelHandle = await ExpoLlmMediapipe.createModel(
        targetFilePath.replace("file://", ""),
        1024, // maxTokens
        3,    // topK
        0.7,  // temperature
        123, // random seed
        true, // multimodal
      );
      addLog(`Model loaded successfully with handle: ${modelHandle}`);

      setActiveModelType('user-file');
      setAppUIState('ready');

      // Navigate to welcome screen after successful load
      navigateToWelcomeScreen();

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addLog(`Error during file selection or copy/load: ${errorMsg}`);
      Alert.alert(
        "File Load Error",
        `Failed to load model from selected file: ${errorMsg}. Please ensure it's a valid model file and try again.`
      );
      setAppUIState('error');
    }
  }, [addLog, navigateToWelcomeScreen]);

  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));



  // Handler for initiating default model download
  const handleDownloadDefaultModel = useCallback(async () => {

    if (await doesModelExistAtDefaultLocation()) {
      return;
    }


    if (appUIState === 'downloading') {
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
          setAppUIState('ready');
          navigateToWelcomeScreen();
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
  }, []);


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
        {/* <Text style={styles.statusText}>Model Loaded: <Text style={styles.statusValue}>{currentLLM.isLoaded ? 'Yes' : 'No'}</Text></Text> */}

        {(appUIState === 'options' || appUIState === 'downloaded') && (
          <View style={styles.optionsContainer}>
            <Text style={styles.message}>
              {appUIState === 'downloaded' ? 'Model downloaded. Please load it to continue:' : 'Model not found. Please choose an action:'}
            </Text>
            <View style={styles.buttonColumn}>
              {appUIState === 'downloaded' ? (
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={async () => {
                    setAppUIState('loading');
                    // try {
                    //   const modelHandle = await ExpoLlmMediapipe.loadModel(DEFAULT_MODEL_PATH);
                    //   setModelHandle(modelHandle);
                    //   addLog(`Model loaded successfully with handle: ${modelHandle}`);
                    //   setAppUIState('ready');
                    //   navigateToWelcomeScreen();
                    // } catch (error) {
                    //   addLog(`Error loading model: ${error}`);
                    //   setAppUIState('error');
                    // }
                  }}
                >
                  <Text style={styles.primaryButtonText}>Load Downloaded Model</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleDownloadDefaultModel}
                >
                  <Text style={styles.primaryButtonText}>Download Model</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleLoadFromFile}
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
                // try {
                //   await ExpoLlmMediapipe.cancelDownload();
                //   setAppUIState('options');
                //   setDownloadProgress(0);
                // } catch (error) {
                //   addLog(`Error cancelling download: ${error}`);
                // }
              }}
              disabled={isLoadingAction}
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

        {appUIState === 'error' && (
          <View style={styles.errorStateContainer}>
            <Text style={styles.errorMessage}>An error occurred during model operation.</Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                if (activeModelType === 'default-downloadable') {
                  handleDownloadDefaultModel();
                } else if (activeModelType === 'user-file') {
                  Alert.alert("Retry File Load", "Please try selecting the file again.");
                  setActiveModelType(null);
                  setAppUIState('options');
                } else {
                  setActiveModelType(null);
                  setAppUIState('options');
                }
              }}
            >
              <Text style={styles.primaryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Release Button - only show if a model is currently loaded */}
        {/* {currentLLM.isLoaded && appUIState !== 'checking' && appUIState !== 'loading' && appUIState !== 'downloading' && (
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
                        // Release the currently active model via its hook instance
                        await currentLLM.releaseModel();
                        addLog(`Released model with handle: ${currentLLM.modelHandle}`);

                        // If the released model was the default downloadable one, offer to delete its file
                        if (activeModelType === 'default-downloadable' && (defaultDownloadableLLM as DownloadableLlmReturn).downloadStatus === 'downloaded') {
                          Alert.alert(
                            "Delete Default Model File?",
                            "Do you also want to delete the default downloaded model file from storage?",
                            [
                              {
                                text: "No", style: "cancel", onPress: () => {
                                  setActiveModelType('options'); // Go back to options
                                  setUserFileModelPath(null); // Clear user file path just in case
                                }
                              },
                              {
                                text: "Yes", onPress: async () => {
                                  try {
                                    await (defaultDownloadableLLM as DownloadableLlmReturn).deleteDownloadedModel(); // Delete the default model file
                                    addLog("Default downloaded model file deleted.");
                                    setActiveModelType('options');
                                    setUserFileModelPath(null);
                                  } catch (e: any) {
                                    addLog(`Error deleting default model file: ${e.message}`);
                                    Alert.alert("Deletion Error", `Failed to delete default model file: ${e.message}`);
                                    setActiveModelType('options'); // Still go to options even if deletion fails
                                    setUserFileModelPath(null);
                                  }
                                }
                              }
                            ]
                          );
                        } else {
                          // If it was a user-selected file or not a downloaded default, just go to options
                          setActiveModelType('options');
                          setUserFileModelPath(null); // Clear user file path
                        }
                      } catch (e: any) {
                        addLog(`Error during model release: ${e.message}`);
                        Alert.alert("Release Error", `Failed to release model: ${e.message}`);
                        setActiveModelType('options'); // Still go to options on error
                        setUserFileModelPath(null);
                      }
                    }
                  }
                ]
              );
            }}
            disabled={!currentLLM.isLoaded || appUIState === 'checking' || appUIState === 'loading' || appUIState === 'downloading'}
          >
            <Text style={styles.releaseButtonText}>Release Loaded Model</Text>
          </TouchableOpacity>
        )} */}
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

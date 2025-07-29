import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { router } from 'expo-router';
import LingoProMultimodal, { DownloadableLlmReturn, useLLM } from 'lingopro-multimodal-module';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useModel } from './context/ModelContext';


// import { LoggingEventPayload, DownloadableLlmReturn, BaseLlmReturn } from './types/ExpoLlmMediapipe.types';

// Constants for model and file paths
const DEFAULT_MODEL_NAME = "gemma-3n-E4B-it-int4.task"; // Default downloadable model name
const DEFAULT_MODEL_URL = "https://huggingface.co/MrZeggers/gemma-3n-mobile/resolve/main/gemma-3n-E4B-it-int4.task";
const MODELS_BASE_DIR = `${FileSystem.documentDirectory}models/`;
const DEFAULT_MODEL_PATH = `${MODELS_BASE_DIR}${DEFAULT_MODEL_NAME}`;
const USER_FILES_DIR = `${MODELS_BASE_DIR}user_files/`;

// Define possible states for the UI flow of this page
type AppUIState = 'checking' | 'options' | 'downloading' | 'loading' | 'error' | 'ready';
type ActiveModelType = 'default-downloadable' | 'user-file' | null;

export default function InitialPage() {
  const [appUIState, setAppUIState] = useState<AppUIState>('checking');
  const [logs, setLogs] = useState<string[]>([]);
  const [userFileModelPath, setUserFileModelPath] = useState<string | null>(null);
  const [activeModelType, setActiveModelType] = useState<ActiveModelType>(null);

  const { setModelHandle, releaseLoadedModel, isModelLoaded: isGlobalModelLoaded } = useModel();

  // export type UseLLMDownloadableProps = BaseLlmParams & { modelUrl: string; modelName: string; storageType?: undefined; modelPath?: undefined };
  const defaultDownloadableLLM = useLLM({
    storageType: 'asset',
    modelName: DEFAULT_MODEL_NAME,
    // modelUrl: DEFAULT_MODEL_URL,
    maxTokens: 2048,
    topK: 50,
    temperature: 0.7,
    randomSeed: 1,
    multiModal: true,
  });

  // 2. Instance for a user-selected file model
  // This hook will only become truly "active" and attempt to load when userFileModelPath is set.
  const userFileLLM = useLLM({
    storageType: 'file',
    modelPath: userFileModelPath || '', // Provide an empty string initially, it won't load until a real path is there
    maxTokens: 2048,
    topK: 50,
    temperature: 0.7,
    randomSeed: 1,
    multiModal: true,
  });

  // Determine which LLM instance is currently "active" for UI display and interaction
  const currentLLM = activeModelType === 'default-downloadable' ? defaultDownloadableLLM : userFileLLM;

  const ensureDatabaseReady = async () => {
    try {
      const isInitialized = await LingoProMultimodal.isDatabaseInitialized();
      if (!isInitialized) {
        await LingoProMultimodal.initializeDatabase();
        console.log('Database initialized successfully');
      }
    } catch (error) {
      console.error('Database initialization failed:', error);
    }
  };


  // Logging helper: Adds a timestamped message to the logs state and console
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const logMessage = `[${timestamp}] ${message}`;
    setLogs(prev => [...prev.slice(-100), logMessage]); // Keep last 100 logs
    console.log(logMessage);
  }, []);

  // Function to navigate to the welcome screen
  const navigateToWelcomeScreen = useCallback(() => {
    addLog("Navigating to welcome screen...");
    setTimeout(() => router.replace('/welcome-screen'), 100);
  }, [addLog]);

  // Initial setup: Start by checking the default downloadable model
  //   useEffect(() => {
  //     setActiveModelType('default-downloadable');
  //   }, []);

  // Initial setup: Check for existing models first, then default downloadable
  useEffect(() => {
    ensureDatabaseReady();
    const checkAndLoadExistingModels = async () => {
      setAppUIState('checking');
      addLog("Checking for existing model files...");

      try {
        // Check user_files directory first
        const userFilesDirInfo = await FileSystem.getInfoAsync(USER_FILES_DIR);
        if (userFilesDirInfo.exists && userFilesDirInfo.isDirectory) {
          const files = await FileSystem.readDirectoryAsync(USER_FILES_DIR);
          const modelFiles = files.filter(file => file.endsWith('.task'));
          if (modelFiles.length > 0) {
            const firstModelPath = `${USER_FILES_DIR}${modelFiles[0]}`;
            addLog(`Found existing user model: ${firstModelPath}. Attempting to load.`);
            setUserFileModelPath(firstModelPath); // This will trigger userFileLLM to load
            setActiveModelType('user-file');
            return; // Exit, as we are attempting to load a user file
          }
        }

        // If no user files, check for the default downloadable model
        const defaultModelInfo = await FileSystem.getInfoAsync(DEFAULT_MODEL_PATH);
        if (defaultModelInfo.exists && !defaultModelInfo.isDirectory) {
          addLog(`Found default downloaded model: ${DEFAULT_MODEL_PATH}. Attempting to load.`);
          setActiveModelType('default-downloadable'); // This will trigger defaultDownloadableLLM to load
          return; // Exit, as we are attempting to load the default model
        }

        // If no existing models, go to options
        addLog("No existing model files found. Showing options.");
        setAppUIState('options');

      } catch (error: any) {
        addLog(`Error checking existing models: ${error.message}`);
        setAppUIState('options'); // Fallback to options on error
      }
    };

    if (!isGlobalModelLoaded) { // Only run this check if no model is currently loaded in context
      checkAndLoadExistingModels();
    } else {
      // If a model is already loaded in context (e.g., from a previous session), navigate
      addLog("Model already loaded in context. Navigating to welcome screen.");
      setAppUIState('ready');
      navigateToWelcomeScreen();
    }
  }, [isGlobalModelLoaded, addLog, navigateToWelcomeScreen]);

  // Effect to manage appUIState based on the active LLM hook's states
  useEffect(() => {
    if (!activeModelType) {
      setAppUIState('checking'); // Still initializing
      return;
    }

    // Determine which LLM's state to observe
    const llmToObserve = activeModelType === 'default-downloadable' ? defaultDownloadableLLM : userFileLLM;

    // addLog(`[UI State Logic] Active Model Type: ${activeModelType}, isLoaded: ${llmToObserve.isLoaded}, isLoading: ${llmToObserve.isLoading}, loadError: ${llmToObserve.loadError}`);
    if (activeModelType === "default-downloadable") {
      const downloadable = llmToObserve;
      // addLog(`[UI State Logic - Downloadable] isCheckingStatus: ${downloadable.isCheckingStatus}, downloadStatus: ${downloadable.downloadStatus}, downloadError: ${downloadable.downloadError}`);
    }


    if (llmToObserve.isLoaded) {
      // Set the model handle in the global context
      if (llmToObserve.modelHandle !== undefined) {
        setModelHandle(llmToObserve.modelHandle);
        addLog(`Model loaded and handle ${llmToObserve.modelHandle} set in context.`);
      } else {
        addLog("Model loaded but handle is undefined. This should not happen.");
      }
      setAppUIState('ready');
      navigateToWelcomeScreen();
      return;
    }

    if (llmToObserve.isLoading) {
      setAppUIState('loading');
      return;
    }

    if (llmToObserve.loadError) {
      setAppUIState('error');
      return;
    }

    if (activeModelType === 'default-downloadable') {
      const downloadable = llmToObserve as DownloadableLlmReturn;
      if (downloadable.isCheckingStatus) {
        setAppUIState('checking');
      } else if (downloadable.downloadStatus === 'downloading') {
        setAppUIState('downloading');
      } else if (downloadable.downloadStatus === 'downloaded' && !downloadable.isLoaded) {
        setAppUIState('loading'); // Downloaded but not loaded into memory yet
        addLog("Default model downloaded, attempting to load into memory...");
        downloadable.loadModel().catch(e => {
          addLog(`Auto-load of default model failed: ${e.message}`);
          setAppUIState('error');
        });
      } else if (downloadable.downloadStatus === 'not_downloaded' || downloadable.downloadError) {
        setAppUIState('options'); // Show options if not downloaded or download error
      }
    } else if (activeModelType === 'user-file') {
      // If user-file is active but not loaded/loading/error, it means it's waiting for loadModel()
      // or there was an issue with the path.
      setAppUIState('options'); // Go back to options for user to retry or select another
    } else {
      setAppUIState('options'); // Fallback
    }

  }, [
    activeModelType, defaultDownloadableLLM, userFileLLM, navigateToWelcomeScreen, addLog, setModelHandle,
    // Explicitly list all properties that might change and affect this effect
    defaultDownloadableLLM.isLoaded, defaultDownloadableLLM.isLoading, defaultDownloadableLLM.loadError, defaultDownloadableLLM.modelHandle,
    (defaultDownloadableLLM as DownloadableLlmReturn).downloadStatus,
    (defaultDownloadableLLM as DownloadableLlmReturn).downloadError,
    (defaultDownloadableLLM as DownloadableLlmReturn).isCheckingStatus,
    (defaultDownloadableLLM as DownloadableLlmReturn).loadModel,
    userFileLLM.isLoaded, userFileLLM.isLoading, userFileLLM.loadError, userFileLLM.modelHandle,
  ]);


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
      addLog("File copied successfully. Now setting LLM props to load this file via hook.");

      const fileInfo = await FileSystem.getInfoAsync(targetFilePath);
      if (fileInfo.exists && fileInfo.size > 0) {
        addLog(`✅ File exists at ${targetFilePath}, size: ${fileInfo.size} bytes`);
      } else {
        throw new Error("❌ File missing or size is 0 bytes.");
      }

      addLog("Now setting LLM props to load this file via hook.");

      setUserFileModelPath(targetFilePath.replace("file://", ""));
      setActiveModelType('user-file');

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addLog(`Error during file selection or copy/load: ${errorMsg}`);
      Alert.alert(
        "File Load Error",
        `Failed to load model from selected file: ${errorMsg}. Please ensure it's a valid model file and try again.`
      );
      setAppUIState('options');
    }
  }, [addLog]);


  // Handler for initiating default model download
  const handleDownloadDefaultModel = useCallback(() => {
    setActiveModelType('default-downloadable');
    if ((defaultDownloadableLLM as DownloadableLlmReturn).downloadStatus === 'not_downloaded' || (defaultDownloadableLLM as DownloadableLlmReturn).downloadStatus === 'error') {
      (defaultDownloadableLLM as DownloadableLlmReturn).downloadModel();
    } else if ((defaultDownloadableLLM as DownloadableLlmReturn).downloadStatus === 'downloaded' && !defaultDownloadableLLM.isLoaded) {
      (defaultDownloadableLLM as DownloadableLlmReturn).loadModel();
    }
  }, [defaultDownloadableLLM]);


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

  // Helper to get the correct download status/progress for display
  const getDownloadStatusForDisplay = () => {
    if (activeModelType === 'default-downloadable') {
      const downloadable = defaultDownloadableLLM as DownloadableLlmReturn;
      return downloadable.downloadStatus;
    }
    return 'N/A';
  };

  const getDownloadProgressForDisplay = () => {
    if (activeModelType === 'default-downloadable') {
      const downloadable = defaultDownloadableLLM as DownloadableLlmReturn;
      return downloadable.downloadProgress;
    }
    return 0;
  };

  const getLoadErrorForDisplay = () => {
    if (activeModelType === 'default-downloadable') {
      return defaultDownloadableLLM.loadError || (defaultDownloadableLLM as DownloadableLlmReturn).downloadError;
    } else if (activeModelType === 'user-file') {
      return userFileLLM.loadError;
    }
    return null;
  };

  // Main render logic based on appUIState
  return (
    <ScrollView contentContainerStyle={styles.scrollViewContent} style={styles.container}>
      <Text style={styles.mainTitle}>LingoLens AI Model Setup</Text>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Model Status</Text>
        <Text style={styles.statusText}>Current State: <Text style={styles.statusValue}>{appUIState.toUpperCase()}</Text></Text>
        <Text style={styles.statusText}>Model Loaded: <Text style={styles.statusValue}>{currentLLM.isLoaded ? 'Yes' : 'No'}</Text></Text>
        {activeModelType === 'default-downloadable' && (
          <Text style={styles.statusText}>Default Downloaded: <Text style={styles.statusValue}>{getDownloadStatusForDisplay() === 'downloaded' ? 'Yes' : 'No'}</Text></Text>
        )}

        {appUIState === 'options' && (
          <View style={styles.optionsContainer}>
            <Text style={styles.message}>Model not found. Please choose an action:</Text>
            <View style={styles.buttonColumn}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleDownloadDefaultModel}
                disabled={getDownloadStatusForDisplay() === 'downloading' || currentLLM.isLoading}
              >
                <Text style={styles.primaryButtonText}>Download Default Model</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleLoadFromFile}
                disabled={currentLLM.isLoading}
              >
                <Text style={styles.secondaryButtonText}>Load From Local File</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {appUIState === 'downloading' && (
          <View style={styles.downloadProgressContainer}>
            <Text style={styles.progressText}>Downloading Model... {Math.round(getDownloadProgressForDisplay() * 100)}%</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressBarFill, { width: `${getDownloadProgressForDisplay() * 100}%` }]} />
            </View>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => (defaultDownloadableLLM as DownloadableLlmReturn).cancelDownload()}
              disabled={currentLLM.isLoading}
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
            <Text style={styles.errorMessageDetail}>{getLoadErrorForDisplay() || "Unknown error."}</Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                if (activeModelType === 'default-downloadable') {
                  const downloadable = defaultDownloadableLLM as DownloadableLlmReturn;
                  if (downloadable.downloadStatus === 'error') {
                    downloadable.downloadModel(); // Retry download
                  } else if (downloadable.loadError) {
                    downloadable.loadModel(); // Retry loading into memory
                  } else {
                    setActiveModelType(null); // Reset to re-trigger initial check
                  }
                } else if (activeModelType === 'user-file') {
                  // For user-file errors, prompt user to re-select
                  Alert.alert("Retry File Load", "Please try selecting the file again.");
                  setUserFileModelPath(null); // Clear path to allow re-selection
                  // setActiveModelType('options'); // Go back to options
                } else {
                  // setActiveModelType('options'); // General retry, go back to options
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
    color: '#e74c3c',
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
  errorMessage: {
    fontSize: 16,
    color: '#c0392b', // Dark red text
    textAlign: 'center',
    marginBottom: 15,
    fontWeight: 'bold',
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

// app/context/ModelContext.tsx

import React, { createContext, ReactNode, useCallback, useContext, useState, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system'; // Import FileSystem
import LingoProMultimodal from 'lingopro-multimodal-module';

// Define the model constants
const DEFAULT_MODEL_NAME = "gemma-3n-E4B-it-int4.task";
const DEFAULT_MODEL_URL = "https://huggingface.co/MrZeggers/gemma-3n-mobile/resolve/main/gemma-3n-E4B-it-int4.task";
const MODELS_BASE_DIR = `${FileSystem.documentDirectory}models/`;
const DEFAULT_MODEL_PATH = `${MODELS_BASE_DIR}${DEFAULT_MODEL_NAME}`;
const USER_FILES_DIR = `${MODELS_BASE_DIR}user_files/`;

// Define the shape of the context value
interface ModelContextType {
  modelHandle: number | null;
  isModelLoaded: boolean;
  isLoadingModel: boolean;
  modelLoadError: string | null;
  loadModel: () => Promise<void>;
  setModelHandle: (handle: number | null) => void;
  releaseLoadedModel: () => Promise<void>;
}

// Create the context with a default (null) value
const ModelContext = createContext<ModelContextType | undefined>(undefined);

// Define the props for the ModelProvider
interface ModelProviderProps {
  children: ReactNode;
}

/**
 * Provides the model handle, loading status, and model management functions to its children components.
 * Manages the global state of the loaded AI model.
 */
export const ModelProvider: React.FC<ModelProviderProps> = ({ children }) => {
  const [modelHandle, setModelHandleState] = useState<number | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState<boolean>(false);
  const [isLoadingModel, setIsLoadingModel] = useState<boolean>(false);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);

  // Use a ref to store the actual model handle for cleanup,
  // as modelHandle state might be nullified before cleanup runs.
  const modelHandleRef = useRef<number | null>(null);

  useEffect(() => {
    modelHandleRef.current = modelHandle;
    setIsModelLoaded(modelHandle !== null);
  }, [modelHandle]);

  // Function to set the model handle
  const setModelHandle = useCallback((handle: number | null) => {
    setModelHandleState(handle);
  }, []);

  // Function to load the AI model (including download logic)
  const loadModel = useCallback(async () => {
    if (modelHandle !== null) {
      console.log("Model already loaded, skipping loadModel call.");
      return; // Model already loaded
    }
    setIsLoadingModel(true);
    setModelLoadError(null); // Clear previous errors
    try {
      // Ensure the base directory exists
      const dirInfo = await FileSystem.getInfoAsync(MODELS_BASE_DIR);
      if (!dirInfo.exists) {
        console.log("Creating models directory:", MODELS_BASE_DIR);
        await FileSystem.makeDirectoryAsync(MODELS_BASE_DIR, { intermediates: true });
      }

      // Check if the model file exists locally
      const modelFileInfo = await FileSystem.getInfoAsync(DEFAULT_MODEL_PATH);

      let finalModelPath = DEFAULT_MODEL_PATH;

      if (!modelFileInfo.exists) {
        console.log("Model file not found locally. Downloading from:", DEFAULT_MODEL_URL);
        // Download the model
        const downloadResult = await FileSystem.downloadAsync(
          DEFAULT_MODEL_URL,
          DEFAULT_MODEL_PATH
        );

        if (downloadResult.status === 200) {
          console.log("Model downloaded successfully to:", downloadResult.uri);
          finalModelPath = downloadResult.uri;
        } else {
          throw new Error(`Failed to download model: Status ${downloadResult.status}`);
        }
      } else {
        console.log("Model file already exists locally at:", DEFAULT_MODEL_PATH);
      }

      // Remove 'file://' prefix if present, as native module might expect raw path
      if (finalModelPath.startsWith('file://')) {
        finalModelPath = finalModelPath.slice(7);
      }

      console.log("Attempting to load AI model from:", finalModelPath);
      const handle = await LingoProMultimodal.createModel(
        finalModelPath,
        1024, // maxTokens
        3,    // topK
        0.7,  // temperature
        123,  // random seed
        true, // multimodal,
      );
      setModelHandleState(handle);
      console.log("Model loaded successfully with handle:", handle);
    } catch (error: any) {
      console.error("Failed to load AI model:", error);
      setModelLoadError(`Failed to load AI model: ${error.message || 'An unknown error occurred. Please check model path.'}`);
      setModelHandleState(null); // Ensure handle is null on error
    } finally {
      setIsLoadingModel(false);
    }
  }, [modelHandle]);

  // Automatically attempt to load the model when the provider mounts
  useEffect(() => {
    console.log("ModelProvider mounted. Attempting initial model load.");
    loadModel();
  }, [loadModel]);

  // Function to release the currently loaded model
  const releaseLoadedModel = useCallback(async () => {
      if (modelHandleRef.current !== null) {
        try {
          console.log(`Attempting to release model with handle: ${modelHandleRef.current} via ModelContext.`);
          await LingoProMultimodal.releaseModel(modelHandleRef.current);
          console.log(`Successfully released model ${modelHandleRef.current} via ModelContext.`);
          setModelHandleState(null); // Clear the handle from context state
        } catch (error: any) {
          console.error("Error releasing model via context:", error);
          Alert.alert("Error Releasing Model", error.message || "An unknown error occurred while releasing the model.");
        }
      } else {
        console.log("No model handle to release in context.");
      }
    }, []);

  const contextValue = React.useMemo(() => ({
    modelHandle,
    isModelLoaded,
    isLoadingModel,
    modelLoadError,
    loadModel,
    setModelHandle,
    releaseLoadedModel,
  }), [modelHandle, isModelLoaded, isLoadingModel, modelLoadError, loadModel, setModelHandle, releaseLoadedModel]);

  return (
    <ModelContext.Provider value={contextValue}>
      {children}
    </ModelContext.Provider>
  );
};

/**
 * Custom hook to consume the ModelContext.
 * Throws an error if used outside of a ModelProvider.
 */
export const useModel = () => {
  const context = useContext(ModelContext);
  if (context === undefined) {
    throw new Error('useModel must be used within a ModelProvider');
  }
  return context;
};

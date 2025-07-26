// app/context/ModelContext.tsx

import { requireNativeModule } from 'expo-modules-core';
import React, { createContext, ReactNode, useCallback, useContext, useState } from 'react';
import { Alert } from 'react-native';
const LingoProMultimodal = requireNativeModule('LingoproMultimodal');

// Define the shape of the context value
interface ModelContextType {
  modelHandle: number | null;
  isModelLoaded: boolean;
  setModelHandle: (handle: number | null) => void;
  releaseLoadedModel: () => Promise<void>; // Function to release the model
}

// Create the context with a default (null) value
const ModelContext = createContext<ModelContextType | undefined>(undefined);

// Define the props for the ModelProvider
interface ModelProviderProps {
  children: ReactNode;
}

/**
 * Provides the model handle and loading status to its children components.
 * Manages the global state of the loaded AI model.
 */
export const ModelProvider: React.FC<ModelProviderProps> = ({ children }) => {
  const [modelHandle, setModelHandleState] = useState<number | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState<boolean>(false);

  // Use a ref to store the actual model handle for cleanup,
  // as modelHandle state might be nullified before cleanup runs.
  const modelHandleRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    modelHandleRef.current = modelHandle;
    setIsModelLoaded(modelHandle !== null);
  }, [modelHandle]);

  // Function to set the model handle
  const setModelHandle = useCallback((handle: number | null) => {
    setModelHandleState(handle);
  }, []);

  // Function to release the currently loaded model
  const releaseLoadedModel = useCallback(async () => {
      if (modelHandleRef.current !== null) {
        try {
          console.log(`Attempting to release model with handle: ${modelHandleRef.current} via ModelContext.`);
          // Call the native module directly to release
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
    setModelHandle,
    releaseLoadedModel,
  }), [modelHandle, isModelLoaded, setModelHandle, releaseLoadedModel]);

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

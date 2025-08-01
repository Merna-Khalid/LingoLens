import LingoProMultimodal from 'lingopro-multimodal-module';
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react';
import { Alert } from 'react-native';

// Define the shape of the context value
interface ModelContextType {
  modelHandle: number | null;
  isModelLoaded: boolean;
  isLoadingModel: boolean;
  modelLoadError: string | null;
  loadModel: (modelPath: string) => Promise<void>;
  releaseLoadedModel: () => Promise<void>;
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
  const [modelHandle, setModelHandle] = useState<number | null>(null);
    const [isModelLoaded, setIsModelLoaded] = useState<boolean>(false);
    const [isLoadingModel, setIsLoadingModel] = useState<boolean>(false);
    const [modelLoadError, setModelLoadError] = useState<string | null>(null);
    const isLoadingRef = useRef<boolean>(false);

  // Use a ref to store the actual model handle for cleanup,
  // as modelHandle state might be nullified before cleanup runs.
  const loadModel = useCallback(async (modelPath: string) => {
      if (modelHandle !== null || isLoadingRef.current) {
        console.log("Model already loaded or loading");
        return;
      }

      isLoadingRef.current = true;
      setIsLoadingModel(true);
      setModelLoadError(null);

      try {
        if (!modelPath) {
          throw new Error("Model path is not set");
        }

        // Remove file:// prefix if present
        const cleanedModelPath = modelPath.startsWith('file://')
          ? modelPath.slice(7)
          : modelPath;

        const handle = await LingoProMultimodal.createModel(
          cleanedModelPath,
          4096, // maxTokens
          1,    // topK
          0.7,  // temperature
          123,  // random seed
          true  // multimodal
        );

        setModelHandle(handle);
        setIsModelLoaded(true);
        console.log("Model loaded successfully with handle:", handle);
      } catch (error: any) {
        setModelLoadError(`Failed to load AI model: ${error.message || 'Unknown error'}`);
        setModelHandle(null);
        setIsModelLoaded(false);
      } finally {
        setIsLoadingModel(false);
        isLoadingRef.current = false;
      }
  }, [modelHandle]);

  // Function to release the currently loaded model
  const releaseLoadedModel = useCallback(async () => {
      if (modelHandle === null) return;

      try {
        console.log(`Releasing model with handle: ${modelHandle}`);
        await LingoProMultimodal.releaseModel(modelHandle);
        setModelHandle(null);
        setIsModelLoaded(false);
        setModelLoadError(null);
      } catch (error: any) {
        console.error("Error releasing model:", error);
        Alert.alert("Error Releasing Model", error.message || "Failed to release model");
      }
  }, [modelHandle]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
        if (modelHandle !== null) {
          releaseLoadedModel().catch(console.error);
        }
    };
  }, [modelHandle, releaseLoadedModel]);

  const contextValue = React.useMemo(() => ({
      modelHandle,
      isModelLoaded,
      isLoadingModel,
      modelLoadError,
      loadModel,
      releaseLoadedModel,
    }), [modelHandle, isModelLoaded, isLoadingModel, modelLoadError, loadModel, releaseLoadedModel]);

  return (
    <ModelContext.Provider value={contextValue}>
      {children}
    </ModelContext.Provider>
  );
};


export const useModel = () => {
  const context = useContext(ModelContext);
  if (context === undefined) {
    throw new Error('useModel must be used within a ModelProvider');
  }
  return context;
};

// Dummy default export for Next.js route requirements
export default function ModelContextRoute() {
  return null; // Or a simple placeholder
}
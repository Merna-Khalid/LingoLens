// app/hooks/useLLM.ts

import { requireNativeModule } from "expo-modules-core";
import * as React from "react";
import { Alert } from 'react-native'

import type {
  ExpoLlmMediapipeModule as NativeModuleType,
  DownloadOptions,
  DownloadProgressEvent,
  UseLLMProps,
  BaseLlmReturn,
  DownloadableLlmReturn,
  UseLLMAssetProps,
  UseLLMFileProps,
  UseLLMDownloadableProps,
  PartialResponseEventPayload,
  ErrorResponseEventPayload,
  LoggingEventPayload,
} from "../types/ExpoLlmMediapipe.types";

// Get the native module instance
const module = requireNativeModule<NativeModuleType>("LingoproMultimodal");

// Hook Overloads for type safety
export function useLLM(props: UseLLMDownloadableProps): DownloadableLlmReturn;
export function useLLM(props: UseLLMAssetProps): BaseLlmReturn;
export function useLLM(props: UseLLMFileProps): BaseLlmReturn;

// Dispatcher Implementation
export function useLLM(props: UseLLMProps): BaseLlmReturn | DownloadableLlmReturn {
  if ('storageType' in props && props.storageType === 'downloadable') {
    return _useLLMDownloadable(props as UseLLMDownloadableProps);
  } else {
    return _useLLMBase(props as UseLLMAssetProps | UseLLMFileProps);
  }
}

// Internal implementation for Downloadable models
function _useLLMDownloadable(props: UseLLMDownloadableProps): DownloadableLlmReturn {
  const [modelHandle, setModelHandle] = React.useState<number | undefined>();
  const [isLoading, setIsLoading] = React.useState(false); // Tracks loading into memory
  const [loadError, setLoadError] = React.useState<string | null>(null); // Error for loading into memory
  const nextRequestIdRef = React.useRef(0);

  const [downloadStatus, setDownloadStatus] = React.useState<
    "not_downloaded" | "downloading" | "downloaded" | "error"
  >("not_downloaded");
  const [downloadProgress, setDownloadProgress] = React.useState<number>(0);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = React.useState(true); // Initial check for downloaded status

  const { modelUrl, modelName, maxTokens, topK, temperature, randomSeed, multiModal } = props;

  // Effect to check initial download status on mount
  React.useEffect(() => {
    const checkModelStatus = async () => {
      setIsCheckingStatus(true);
      try {
        const isDownloaded = await module.isModelDownloaded(modelName);
        setDownloadStatus(isDownloaded ? "downloaded" : "not_downloaded");
        if (isDownloaded) setDownloadProgress(1); else setDownloadProgress(0);
      } catch (error) {
        console.error(`Error checking model status for ${modelName}:`, error);
        setDownloadError(error instanceof Error ? error.message : String(error));
        setDownloadStatus("error");
      } finally {
        setIsCheckingStatus(false);
      }
    };
    checkModelStatus();
  }, [modelName]);

  // Effect to listen for download progress events
  React.useEffect(() => {
    const subscription = module.addListener(
      "downloadProgress",
      (event: DownloadProgressEvent) => {
        if (event.modelName !== modelName) return;

        if (event.status === "downloading" && event.progress !== undefined) {
          setDownloadProgress(event.progress);
          setDownloadStatus("downloading");
        } else if (event.status === "completed") {
          setDownloadProgress(1);
          setDownloadStatus("downloaded");
          setDownloadError(null);
        } else if (event.status === "error") {
          setDownloadStatus("error");
          setDownloadError(event.error || "Unknown error occurred");
          Alert.alert("Download Failed", event.error || "Model download failed.");
        } else if (event.status === "cancelled") {
          setDownloadStatus("not_downloaded");
          setDownloadProgress(0);
          setDownloadError(null);
          Alert.alert("Download Cancelled", "Model download was cancelled.");
        }
      },
    );
    return () => subscription.remove();
  }, [modelName]);

  // Effect to release model handle when component unmounts or handle changes
  React.useEffect(() => {
    const currentModelHandle = modelHandle;
    return () => {
      if (currentModelHandle !== undefined) {
        console.log(`Releasing downloadable model with handle ${currentModelHandle}.`);
        module.releaseModel(currentModelHandle)
          .then(() => console.log(`Successfully released model ${currentModelHandle}`))
          .catch((error) => console.error(`Error releasing model ${currentModelHandle}:`, error));
      }
    };
  }, [modelHandle]);

  // Download model handler
  const downloadModelHandler = React.useCallback(
    async (options?: DownloadOptions): Promise<boolean> => {
      if (downloadStatus === "downloading") {
        console.warn(`Download for ${modelName} already in progress.`);
        return false;
      }
      try {
        setDownloadStatus("downloading");
        setDownloadProgress(0);
        setDownloadError(null);
        const result = await module.downloadModel(modelUrl, modelName, options);
        return result;
      } catch (error) {
        console.error(`Error initiating download for ${modelName}:`, error);
        setDownloadStatus("error");
        setDownloadError(error instanceof Error ? error.message : String(error));
        Alert.alert("Download Initiation Error", error instanceof Error ? error.message : String(error));
        throw error;
      }
    },
    [modelUrl, modelName, downloadStatus],
  );

  // Load model into memory handler
  const loadModelHandler = React.useCallback(async (): Promise<void> => {
    if (modelHandle !== undefined) {
      console.log(`Model ${modelName} already loaded or load in progress.`);
      return;
    }
    // Check if the model file is physically present, not just downloadStatus
    const isModelFilePresent = await module.isModelDownloaded(modelName);
    if (!isModelFilePresent) {
        const errorMsg = `Model file ${modelName} is not found on disk. Please download or copy it first.`;
        setLoadError(errorMsg);
        throw new Error(errorMsg);
    }

    setIsLoading(true);
    setLoadError(null);
    try {
      console.log(`Attempting to load downloaded model: ${modelName}`);
      const handle = await module.createModelFromDownloaded(
        modelName,
        maxTokens ?? 2048,
        topK ?? 50,
        temperature ?? 0.7,
        randomSeed ?? 1,
        multiModal ?? false,
      );
      console.log(`Loaded downloaded model '${modelName}' with handle ${handle}`);
      setModelHandle(handle);
    } catch (error) {
      console.error(`Error loading downloaded model '${modelName}':`, error);
      setModelHandle(undefined);
      const errorMsg = error instanceof Error ? error.message : String(error);
      setLoadError(errorMsg);
      Alert.alert("Model Load Error", errorMsg);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [modelHandle, modelName, maxTokens, topK, temperature, randomSeed, multiModal]);

  // Delete downloaded model handler
  const deleteDownloadedModelHandler = React.useCallback(async (): Promise<boolean> => {
    try {
      if (modelHandle !== undefined) {
        await module.releaseModel(modelHandle);
        setModelHandle(undefined);
      }
      const result = await module.deleteDownloadedModel(modelName);
      if (result) {
        setDownloadStatus("not_downloaded");
        setDownloadProgress(0);
        setDownloadError(null);
        Alert.alert("Model Deleted", `Model ${modelName} successfully deleted.`);
      } else {
        Alert.alert("Deletion Failed", `Failed to delete model ${modelName}.`);
      }
      return result;
    } catch (error) {
      console.error(`Error deleting model ${modelName}:`, error);
      Alert.alert("Deletion Error", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }, [modelName, modelHandle]);

  // Cancel download handler
  const cancelDownloadHandler = React.useCallback(async (): Promise<boolean> => {
    try {
      const result = await module.cancelDownload(modelName);
      if (result) {
        setDownloadStatus("not_downloaded");
        setDownloadProgress(0);
        setDownloadError(null);
        Alert.alert("Download Cancelled", `Download for ${modelName} was cancelled.`);
      } else {
        Alert.alert("Cancellation Failed", `Failed to cancel download for ${modelName}.`);
      }
      return result;
    } catch (error) {
      console.error(`Error cancelling download for ${modelName}:`, error);
      Alert.alert("Cancellation Error", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }, [modelName]);

  // Generate response (synchronous)
  const generateResponse = React.useCallback(
    async (
      promptText: string,
      imagePath: string,
      onPartial?: (partial: string, reqId: number | undefined) => void,
      onErrorCb?: (message: string, reqId: number | undefined) => void,
      abortSignal?: AbortSignal,
    ): Promise<string> => {
      if (modelHandle === undefined) {
        throw new Error("Model is not loaded. Call loadModel() first.");
      }
      const requestId = nextRequestIdRef.current++;

      const partialSub = module.addListener("onPartialResponse", (ev: PartialResponseEventPayload) => {
        if (onPartial && requestId === ev.requestId && ev.handle === modelHandle && !(abortSignal?.aborted ?? false)) {
          onPartial(ev.response, ev.requestId);
        }
      });
      const errorSub = module.addListener("onErrorResponse", (ev: ErrorResponseEventPayload) => {
        if (onErrorCb && requestId === ev.requestId && ev.handle === modelHandle && !(abortSignal?.aborted ?? false)) {
          onErrorCb(ev.error, ev.requestId);
        }
      });

      try {
        return await module.generateResponse(modelHandle, requestId, promptText, imagePath);
      } catch (e) {
        console.error("Generate response error:", e);
        if (onErrorCb && !(abortSignal?.aborted ?? false)) {
          onErrorCb(e instanceof Error ? e.message : String(e), requestId);
        }
        throw e;
      } finally {
        partialSub.remove();
        errorSub.remove();
      }
    },
    [modelHandle]
  );

  // Generate streaming response
  const generateStreamingResponse = React.useCallback(
    async (
      promptText: string,
      imagePath: string, // Added imagePath for consistency
      onPartial?: (partial: string, reqId: number) => void,
      onErrorCb?: (message: string, reqId: number) => void,
      abortSignal?: AbortSignal,
    ): Promise<void> => {
      if (modelHandle === undefined) {
        throw new Error("Model is not loaded. Call loadModel() first.");
      }
      const requestId = nextRequestIdRef.current++;

      return new Promise<void>((resolve, reject) => {
        const partialSubscription = module.addListener("onPartialResponse", (ev: PartialResponseEventPayload) => {
          if (ev.handle === modelHandle && ev.requestId === requestId && !(abortSignal?.aborted ?? false)) {
            if (onPartial) onPartial(ev.response, ev.requestId);
          }
        });
        const errorSubscription = module.addListener("onErrorResponse", (ev: ErrorResponseEventPayload) => {
          if (ev.handle === modelHandle && ev.requestId === requestId && !(abortSignal?.aborted ?? false)) {
            if (onErrorCb) onErrorCb(ev.error, ev.requestId);
            errorSubscription.remove();
            partialSubscription.remove();
            reject(new Error(ev.error));
          }
        });

        if (abortSignal) {
          abortSignal.addEventListener('abort', () => {
            try { partialSubscription.remove(); } catch (subError) { /* ignore */ }
            try { errorSubscription.remove(); } catch (subError) { /* ignore */ }
            console.log(`Request ${requestId} aborted for downloadable model.`);
            reject(new Error("Aborted"));
          });
        }

        module.generateResponseAsync(modelHandle, requestId, promptText, imagePath) // Pass imagePath
          .then(() => {
            if (!(abortSignal?.aborted ?? false)) {
              errorSubscription.remove();
              partialSubscription.remove();
              resolve();
            }
          })
          .catch((error) => {
            if (!(abortSignal?.aborted ?? false)) {
              errorSubscription.remove();
              partialSubscription.remove();
              if (onErrorCb) {
                onErrorCb(error instanceof Error ? error.message : String(error), requestId);
              }
              reject(error);
            }
          });
      });
    },
    [modelHandle]
  );

  return React.useMemo(() => ({
    generateResponse,
    generateStreamingResponse,
    isLoaded: modelHandle !== undefined,
    isLoading,
    loadError,
    downloadModel: downloadModelHandler,
    loadModel: loadModelHandler,
    downloadStatus,
    downloadProgress,
    downloadError,
    isCheckingStatus,
    cancelDownload: cancelDownloadHandler,
    deleteDownloadedModel: deleteDownloadedModelHandler,
    modelHandle, // Expose the modelHandle
  }), [
    generateResponse, generateStreamingResponse, modelHandle, isLoading, loadError,
    downloadModelHandler, loadModelHandler, downloadStatus, downloadProgress, downloadError, isCheckingStatus,
    cancelDownloadHandler, deleteDownloadedModelHandler,
  ]);
}

// Internal implementation for Asset/File models
function _useLLMBase(props: UseLLMAssetProps | UseLLMFileProps): BaseLlmReturn {
  const [modelHandle, setModelHandle] = React.useState<number | undefined>();
  const [isLoading, setIsLoading] = React.useState(true); // Base models start loading immediately
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const nextRequestIdRef = React.useRef(0);

  const { maxTokens, topK, temperature, randomSeed, multiModal } = props;
  let modelIdentifier: string | undefined;
  let storageType: "asset" | "file" | undefined;

  if (props.storageType === 'asset') {
    modelIdentifier = props.modelName;
    storageType = props.storageType;
  } else if (props.storageType === 'file') {
    modelIdentifier = props.modelPath;
    storageType = props.storageType;
  }

  // Effect to create the model when props change
  React.useEffect(() => {
    if (!storageType || !modelIdentifier) {
      if (modelHandle !== undefined) setModelHandle(undefined);
      setIsLoading(false);
      setLoadError("Invalid model configuration provided.");
      return;
    }

    const currentConfigStorageKey = modelIdentifier;
    const currentStorageType = storageType;

    console.log(`Attempting to create non-downloadable model: ${currentConfigStorageKey}, type: ${currentStorageType}`);

    let active = true;
    setIsLoading(true);
    setLoadError(null);

    const modelCreatePromise =
      currentStorageType === "asset"
        ? module.createModelFromAsset(currentConfigStorageKey, maxTokens ?? 2048, topK ?? 50, temperature ?? 0.7, randomSeed ?? 1, multiModal ?? false)
        : module.createModel(currentConfigStorageKey, maxTokens ?? 2048, topK ?? 50, temperature ?? 0.7, randomSeed ?? 1, multiModal ?? false);

    modelCreatePromise
      .then((handle: number) => {
        if (active) {
          console.log(`Created non-downloadable model with handle ${handle} for ${currentConfigStorageKey}`);
          setModelHandle(handle);
          setIsLoading(false);
        } else {
          module.releaseModel(handle).catch(e => console.error("Error releasing model from stale promise (non-downloadable)", e));
        }
      })
      .catch((error: Error) => {
        if (active) {
          console.error(`createModel error for ${currentConfigStorageKey} (non-downloadable):`, error);
          setModelHandle(undefined);
          setIsLoading(false);
          setLoadError(error.message || "Unknown model load error.");
          Alert.alert("Model Load Error", error.message || "Unknown model load error.");
        }
      });

    return () => {
      active = false;
    };
  }, [modelIdentifier, storageType, maxTokens, topK, temperature, randomSeed, multiModal]);

  // Effect to release model handle when component unmounts or handle changes
  React.useEffect(() => {
    const currentModelHandle = modelHandle;
    return () => {
      if (currentModelHandle !== undefined) {
        console.log(`Releasing base model with handle ${currentModelHandle}.`);
        module.releaseModel(currentModelHandle)
          .then(() => console.log(`Successfully released model ${currentModelHandle}`))
          .catch((error) => console.error(`Error releasing model ${currentModelHandle}:`, error));
      }
    };
  }, [modelHandle]);

  // Load model handler (for _useLLMBase, it's essentially the useEffect's creation)
  const loadModelHandler = React.useCallback(async (): Promise<void> => {

    if (modelHandle === undefined) {
      const errorMsg = "Base model is not loaded. Check initial useEffect for errors.";
      setLoadError(errorMsg);
      throw new Error(errorMsg);
    }
    console.log(`Base model already loaded with handle: ${modelHandle}`);
  }, [modelHandle]);

  // Release model handler (exposed for external use)
  const releaseModelHandler = React.useCallback(async (): Promise<void> => {
    if (modelHandle === undefined) {
      console.log("No base model loaded to release.");
      return;
    }
    try {
      console.log(`Releasing base model explicitly with handle ${modelHandle}.`);
      await module.releaseModel(modelHandle);
      setModelHandle(undefined);
      setIsLoading(false);
      setLoadError(null);
    } catch (error) {
      console.error(`Error explicitly releasing base model ${modelHandle}:`, error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      setLoadError(errorMsg);
      Alert.alert("Model Release Error", errorMsg);
      throw error;
    }
  }, [modelHandle]);


  const generateResponse = React.useCallback(
    async (
      promptText: string,
      imagePath: string,
      onPartial?: (partial: string, reqId: number | undefined) => void,
      onErrorCb?: (message: string, reqId: number | undefined) => void,
      abortSignal?: AbortSignal,
    ): Promise<string> => {
      if (modelHandle === undefined) {
        throw new Error("Model handle is not defined. Ensure model is created/loaded.");
      }
      const requestId = nextRequestIdRef.current++;

      const partialSub = module.addListener("onPartialResponse", (ev: PartialResponseEventPayload) => {
        if (onPartial && requestId === ev.requestId && ev.handle === modelHandle && !(abortSignal?.aborted ?? false)) {
          onPartial(ev.response, ev.requestId);
        }
      });
      const errorSub = module.addListener("onErrorResponse", (ev: ErrorResponseEventPayload) => {
        if (onErrorCb && requestId === ev.requestId && ev.handle === modelHandle && !(abortSignal?.aborted ?? false)) {
          onErrorCb(ev.error, ev.requestId);
        }
      });

      try {
        return await module.generateResponse(modelHandle, requestId, promptText, imagePath);
      } catch (e) {
        console.error("Generate response error:", e);
        if (onErrorCb && !(abortSignal?.aborted ?? false)) {
          onErrorCb(e instanceof Error ? e.message : String(e), requestId);
        }
        throw e;
      } finally {
        partialSub.remove();
        errorSub.remove();
      }
    },
    [modelHandle]
  );

  const generateStreamingResponse = React.useCallback(
    async (
      promptText: string,
      imagePath: string,
      onPartial?: (partial: string, reqId: number) => void,
      onErrorCb?: (message: string, reqId: number) => void,
      abortSignal?: AbortSignal,
    ): Promise<void> => {
      if (modelHandle === undefined) {
        throw new Error("Model handle is not defined. Ensure model is created/loaded.");
      }
      const requestId = nextRequestIdRef.current++;

      return new Promise<void>((resolve, reject) => {
        const partialSubscription = module.addListener("onPartialResponse", (ev: PartialResponseEventPayload) => {
          if (ev.handle === modelHandle && ev.requestId === requestId && !(abortSignal?.aborted ?? false)) {
            if (onPartial) onPartial(ev.response, ev.requestId);
          }
        });
        const errorSubscription = module.addListener("onErrorResponse", (ev: ErrorResponseEventPayload) => {
          if (ev.handle === modelHandle && ev.requestId === requestId && !(abortSignal?.aborted ?? false)) {
            if (onErrorCb) onErrorCb(ev.error, ev.requestId);
            errorSubscription.remove();
            partialSubscription.remove();
            reject(new Error(ev.error));
          }
        });

        if (abortSignal) {
          abortSignal.addEventListener('abort', () => {
            try { partialSubscription.remove(); } catch (subError) { /* ignore */ }
            try { errorSubscription.remove(); } catch (subError) { /* ignore */ }
            console.log(`Request ${requestId} aborted for base model.`);
            reject(new Error("Aborted"));
          });
        }

        module.generateResponseAsync(modelHandle, requestId, promptText, imagePath)
          .then(() => {
            if (!(abortSignal?.aborted ?? false)) {
              errorSubscription.remove();
              partialSubscription.remove();
              resolve();
            }
          })
          .catch((error) => {
            if (!(abortSignal?.aborted ?? false)) {
              errorSubscription.remove();
              partialSubscription.remove();
              if (onErrorCb) {
                onErrorCb(error instanceof Error ? error.message : String(error), requestId);
              }
              reject(error);
            }
          });
      });
    },
    [modelHandle]
  );

  return React.useMemo(() => ({
    generateResponse,
    generateStreamingResponse,
    isLoaded: modelHandle !== undefined,
    isLoading,
    loadError,
    loadModel: loadModelHandler,
    releaseModel: releaseModelHandler, // Expose releaseModel
    modelHandle, // Expose the modelHandle
  }), [
    generateResponse, generateStreamingResponse, modelHandle, isLoading, loadError,
    loadModelHandler, releaseModelHandler,
  ]);
}

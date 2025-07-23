import { NativeEventEmitter, Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';
import {
  ExpoLlmMediapipeModule as LingoproMultimodalModule,
  PartialResponseEventPayload,
  ErrorResponseEventPayload,
  LoggingEventPayload,
  DownloadProgressEvent,
  DownloadOptions
} from '../types/ExpoLlmMediapipe.types';


const LingoproMultimodal: LingoproMultimodalModule = requireNativeModule('LingoproMultimodal');

// Create an event emitter for native events
const eventEmitter = new NativeEventEmitter(LingoproMultimodal);

// Define event names (matching native module's Events definition)
const ON_PARTIAL_RESPONSE_EVENT = 'onPartialResponse';
const ON_ERROR_RESPONSE_EVENT = 'onErrorResponse';
const LOGGING_EVENT = 'logging';
const DOWNLOAD_PROGRESS_EVENT = 'downloadProgress';


type ListenerCallback<T> = (event: T) => void;
type ResponseListenerMap = {
  [handle: number]: {
    [requestId: number]: {
      onPartial: (partial: string) => void;
      onError: (error: string) => void;
    };
  };
};

class ModelManager {
  private static instance: ModelManager;
  private requestIdCounter: number = 0;
  private responseListeners: ResponseListenerMap = {}; // Stores specific callbacks for each request
  private loggingListeners: ListenerCallback<LoggingEventPayload>[] = [];
  private downloadProgressListeners: ListenerCallback<DownloadProgressEvent>[] = [];

  private constructor() {
    eventEmitter.addListener(ON_PARTIAL_RESPONSE_EVENT, (event: PartialResponseEventPayload) => {
      this.handlePartialResponse(event);
    });
    eventEmitter.addListener(ON_ERROR_RESPONSE_EVENT, (event: ErrorResponseEventPayload) => {
      this.handleErrorResponse(event);
    });
    eventEmitter.addListener(LOGGING_EVENT, (event: LoggingEventPayload) => {
      this.handleLoggingEvent(event);
    });
    eventEmitter.addListener(DOWNLOAD_PROGRESS_EVENT, (event: DownloadProgressEvent) => {
      this.handleDownloadProgressEvent(event);
    });
  }

  public static getInstance(): ModelManager {
    if (!ModelManager.instance) {
      ModelManager.instance = new ModelManager();
    }
    return ModelManager.instance;
  }

  private getNextRequestId(): number {
    return this.requestIdCounter++;
  }

  private handlePartialResponse(event: PartialResponseEventPayload) {
    const { handle, requestId, response } = event;
    const listener = this.responseListeners[handle]?.[requestId];
    if (listener && listener.onPartial) {
      listener.onPartial(response);
    }
  }

  private handleErrorResponse(event: ErrorResponseEventPayload) {
    const { handle, requestId, error } = event;
    const listener = this.responseListeners[handle]?.[requestId];
    if (listener && listener.onError) {
      listener.onError(error);
      // Clean up listener after error
      delete this.responseListeners[handle][requestId];
    }
  }

  private handleLoggingEvent(event: LoggingEventPayload) {
    this.loggingListeners.forEach(callback => callback(event));
  }

  private handleDownloadProgressEvent(event: DownloadProgressEvent) {
    this.downloadProgressListeners.forEach(callback => callback(event));
  }

  /**
   * Adds a listener for logging events from the native module.
   * @param callback The callback function to be invoked when a logging event occurs.
   * @returns A function to unsubscribe the listener.
   */
  public addLoggingListener(callback: ListenerCallback<LoggingEventPayload>): () => void {
    this.loggingListeners.push(callback);
    return () => {
      this.loggingListeners = this.loggingListeners.filter(listener => listener !== callback);
    };
  }

  /**
   * Adds a listener for download progress events.
   * @param callback The callback function to be invoked on progress updates.
   * @returns A function to unsubscribe the listener.
   */
  public addDownloadProgressListener(callback: ListenerCallback<DownloadProgressEvent>): () => void {
    this.downloadProgressListeners.push(callback);
    return () => {
      this.downloadProgressListeners = this.downloadProgressListeners.filter(listener => listener !== callback);
    };
  }

  /**
   * Creates an LLM inference model.
   * @param modelPath The absolute path to the model file (local or asset name).
   * @param options Model configuration options.
   * @returns A promise that resolves with a handle to the created model.
   */
  public async createModel(
    modelPath: string,
    options: {
      maxTokens?: number;
      topK?: number;
      temperature?: number;
      randomSeed?: number;
      multiModal?: boolean;
    } = {}
  ): Promise<number> {
    const {
      maxTokens = 2048,
      topK = 50,
      temperature = 0.7,
      randomSeed = 1,
      multiModal = false,
    } = options;

    try {
      let handle: number;
      // createModel in native module handles both asset and file paths now
      handle = await LingoproMultimodal.createModel(
        modelPath,
        maxTokens,
        topK,
        temperature,
        randomSeed,
        multiModal
      );
      this.responseListeners[handle] = {};
      return handle;
    } catch (error) {
      console.error("Error creating model:", error);
      throw error;
    }
  }

  /**
   * Creates an LLM inference model from a previously downloaded file.
   * @param modelName The name of the downloaded model file.
   * @param options Optional model configuration options.
   * @returns A promise that resolves with a handle to the created model.
   */
  public async createModelFromDownloaded(
    modelName: string,
    options: {
      maxTokens?: number;
      topK?: number;
      temperature?: number;
      randomSeed?: number;
      multiModal?: boolean;
    } = {}
  ): Promise<number> {
    const {
      maxTokens, // Use optional values directly
      topK,
      temperature,
      randomSeed,
      multiModal,
    } = options;

    try {
      const handle = await LingoproMultimodal.createModelFromDownloaded(
        modelName,
        maxTokens,
        topK,
        temperature,
        randomSeed,
        multiModal
      );
      this.responseListeners[handle] = {}; // Initialize listener map for this handle
      return handle;
    } catch (error) {
      console.error("Error creating model from downloaded file:", error);
      throw error;
    }
  }

  /**
   * Releases the resources of a loaded model.
   * @param handle The model handle.
   * @returns A promise resolving to true on success.
   */
  public async releaseModel(handle: number): Promise<boolean> {
    try {
      const success = await LingoproMultimodal.releaseModel(handle);
      if (success) {
        delete this.responseListeners[handle]; // Clean up listeners
      }
      return success;
    } catch (error) {
      console.error("Error releasing model:", error);
      throw error;
    }
  }

  /**
   * Generates a synchronous response from the LLM.
   * @param handle The model handle.
   * @param prompt The input prompt.
   * @param imagePath Optional path to an image file.
   * @returns A promise resolving with the complete response string.
   */
  public async generateResponse(handle: number, requestId: number, prompt: string, imagePath: string = ''): Promise<string> {
    try {
      const response = await LingoproMultimodal.generateResponse(handle, requestId, prompt, imagePath);
      return response;
    } catch (error) {
      console.error(`Error generating synchronous response for request ${requestId}:`, error);
      throw error;
    }
  }

  /**
   * Generates an asynchronous (streaming) response from the LLM.
   * @param handle The model handle.
   * @param prompt The input prompt.
   * @param onPartialResponse Callback for each partial response.
   * @param onError Callback for errors during streaming.
   * @param imagePath Optional path to an image file.
   * @returns A promise that resolves when the streaming is initiated.
   */
  public async generateResponseAsync(
    handle: number,
    requestId: number,
    prompt: string,
    imagePath: string = ''
  ): Promise<void> {
    try {
      // Initiate the native async generation. The promise resolves immediately.
      // Actual responses come via native events.
      await LingoproMultimodal.generateResponseAsync(handle, requestId, prompt, imagePath);
    } catch (error: any) {
      console.error(`Error initiating async response for request ${requestId}:`, error);
      throw error; // Re-throw to propagate to caller
    }
  }

  /**
   * Checks if a model is downloaded.
   * @param modelName The name of the model.
   * @returns A promise resolving to true if downloaded.
   */
  public async isModelDownloaded(modelName: string): Promise<boolean> {
    try {
      return await LingoproMultimodal.isModelDownloaded(modelName);
    } catch (error) {
      console.error("Error checking if model is downloaded:", error);
      return false;
    }
  }

  /**
   * Gets a list of all downloaded model names.
   * @returns A promise resolving to an array of model names.
   */
  public async getDownloadedModels(): Promise<string[]> {
    try {
      return await LingoproMultimodal.getDownloadedModels();
    } catch (error) {
      console.error("Error getting downloaded models:", error);
      return [];
    }
  }

  /**
   * Deletes a downloaded model.
   * @param modelName The name of the model to delete.
   * @returns A promise resolving to true on success.
   */
  public async deleteDownloadedModel(modelName: string): Promise<boolean> {
    try {
      return await LingoproMultimodal.deleteDownloadedModel(modelName);
    } catch (error) {
      console.error("Error deleting model:", error);
      return false;
    }
  }

  /**
   * Downloads a model from a URL.
   * @param url The URL of the model.
   * @param modelName The desired name for the model file.
   * @param options Download options.
   * @returns A promise resolving to true on successful download.
   */
  public async downloadModel(
    url: string,
    modelName: string,
    options?: DownloadOptions
  ): Promise<boolean> {
    try {
      return await LingoproMultimodal.downloadModel(url, modelName, options);
    } catch (error) {
      console.error("Error downloading model:", error);
      throw error;
    }
  }

  /**
   * Cancels an ongoing model download.
   * @param modelName The name of the model whose download should be cancelled.
   * @returns A promise resolving to true if cancelled.
   */
  public async cancelDownload(modelName: string): Promise<boolean> {
    try {
      return await LingoproMultimodal.cancelDownload(modelName);
    } catch (error) {
      console.error("Error cancelling download:", error);
      return false;
    }
  }
}

export default ModelManager.getInstance();

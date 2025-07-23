/**
 * This file contains the types for the LingoproMultimodal native module.
 * It defines the interfaces for the module's functions, events, and any
 * data structures used in communication between JavaScript and native code.
 */

// Event payload interfaces (matching native event structures)
export type ChangeEventPayload = {
  value: string;
};

export type PartialResponseEventPayload = {
  handle: number;
  requestId: number;
  response: string;
};

export type ErrorResponseEventPayload = {
  handle: number;
  requestId: number;
  error: string;
};

export type LoggingEventPayload = {
  handle?: number; // Handle is optional for general logging messages
  message: string;
};

export interface DownloadProgressEvent {
  modelName: string;
  url?: string;
  bytesDownloaded?: number;
  totalBytes?: number;
  progress: number; // 0.0 to 1.0
  status: "downloading" | "completed" | "error" | "cancelled";
  error?: string; // Only present if status is 'error'
}

// Union type for all possible native module events
export type LingoproMultimodalModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
  onPartialResponse: (params: PartialResponseEventPayload) => void;
  onErrorResponse: (params: ErrorResponseEventPayload) => void;
  logging: (params: LoggingEventPayload) => void;
  downloadProgress: (params: DownloadProgressEvent) => void;
};

// Options for model download
export interface DownloadOptions {
  overwrite?: boolean;
  timeout?: number;
  headers?: Record<string, string>;
}

// Interface for the LingoproMultimodal native module's functions
export interface LingoproMultimodalModule {
  /**
   * Creates a model from a file path.
   * @param modelPath - The path to the model file.
   * @param maxTokens - The maximum number of tokens to generate.
   * @param topK - The number of top tokens to consider.
   * @param temperature - The temperature for sampling.
   * @param randomSeed - The random seed for reproducibility (Int in Kotlin, so number in TS).
   * @param multiModal - Multimodal flag for model.
   * @returns A promise that resolves to the model handle.
   */
  createModel(
    modelPath: string,
    maxTokens: number,
    topK: number,
    temperature: number,
    randomSeed: number,
    multiModal: boolean,
  ): Promise<number>;

  /**
   * Creates a model from an asset.
   * @param modelName - The name of the model asset.
   * @param maxTokens - The maximum number of tokens to generate.
   * @param topK - The number of top tokens to consider.
   * @param temperature - The temperature for sampling.
   * @param randomSeed - The random seed for reproducibility (Int in Kotlin, so number in TS).
   * @param multiModal - Multimodal flag for model.
   * @returns A promise that resolves to the model handle.
   */
  createModelFromAsset(
    modelName: string,
    maxTokens: number,
    topK: number,
    temperature: number,
    randomSeed: number,
    multiModal: boolean,
  ): Promise<number>;

  /**
   * Releases the resources associated with a loaded model.
   * @param handle - The model handle.
   * @returns A promise that resolves to true if the model was successfully released.
   */
  releaseModel(handle: number): Promise<boolean>;

  /**
   * Generates a response based on the provided prompt.
   * @param handle - The model handle.
   * @param requestId - The unique request identifier.
   * @param prompt - The input prompt for the model.
   * @param imagePath - The path to the image for multimodal input.
   * @returns A promise that resolves to the generated response.
   */
  generateResponse(
    handle: number,
    requestId: number,
    prompt: string,
    imagePath: string,
  ): Promise<string>;

  /**
   * Generates a response asynchronously based on the provided prompt.
   * @param handle - The model handle.
   * @param requestId - The unique request identifier.
   * @param prompt - The input prompt for the model.
   * @param imagePath - The path to the image for multimodal input.
   * @returns A promise that resolves to a boolean indicating success or failure.
   */
  generateResponseAsync(
    handle: number,
    requestId: number,
    prompt: string,
    imagePath: string,
  ): Promise<boolean>;

  /**
   * Checks if a model is downloaded.
   * @param modelName - The name of the model to check.
   * @returns A promise that resolves to a boolean indicating if the model is downloaded.
   */
  isModelDownloaded(modelName: string): Promise<boolean>;

  /**
   * Lists all downloaded models.
   * @returns A promise that resolves to an array of model names.
   */
  getDownloadedModels(): Promise<string[]>;

  /**
   * Deletes a downloaded model.
   * @param modelName - The name of the model to delete.
   * @returns A promise that resolves to a boolean indicating success or failure.
   */
  deleteDownloadedModel(modelName: string): Promise<boolean>;

  /**
   * Downloads a model from a given URL.
   * @param url - The URL to download the model from.
   * @param modelName - The name to save the downloaded model as.
   * @param options - Optional download options.
   * @returns A promise that resolves to a boolean indicating success or failure.
   */
  downloadModel(
    url: string,
    modelName: string,
    options?: DownloadOptions,
  ): Promise<boolean>;

  /**
   * Cancels a model download.
   * @param modelName - The name of the model to cancel the download for.
   * @returns A promise that resolves to a boolean indicating success or failure.
   */
  cancelDownload(modelName: string): Promise<boolean>;

  /**
   * Creates a model from a downloaded file.
   * @param modelName - The name of the downloaded model.
   * @param maxTokens - The maximum number of tokens to generate.
   * @param topK - The number of top tokens to consider.
   * @param temperature - The temperature for sampling.
   * @param randomSeed - The random seed for reproducibility (Int in Kotlin, so number in TS).
   * @param multiModal - Multimodal flag for model.
   * @returns A promise that resolves to the model handle.
   */
  createModelFromDownloaded(
    modelName: string,
    maxTokens?: number,
    topK?: number,
    temperature?: number,
    randomSeed?: number,
    multiModal?: boolean,
  ): Promise<number>;

  /**
   * Adds a listener for a specific event.
   * @param eventName - The name of the event to listen for.
   * @param listener - The callback function to execute when the event occurs.
   * @returns A subscription object to manage the listener.
   */
  addListener<EventName extends keyof LingoproMultimodalModuleEvents>(
    eventName: EventName,
    listener: LingoproMultimodalModuleEvents[EventName],
  ): { remove(): void }; // Simplified NativeModuleSubscription
}

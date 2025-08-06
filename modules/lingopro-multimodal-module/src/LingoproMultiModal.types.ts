export type OnLoadEventPayload = {
  url: string;
};

export type ExpoLlmMediapipeModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
  onPartialResponse: (params: PartialResponseEventPayload) => void;
  onErrorResponse: (params: ErrorResponseEventPayload) => void;
  logging: (params: LoggingEventPayload) => void;
  downloadProgress: (params: DownloadProgressEvent) => void;
};

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
  handle: number;
  message: string;
};

// LLM Types and Hook
type LlmModelLocation =
  | { storageType: "asset"; modelName: string }
  | { storageType: "file"; modelPath: string };

export type LlmInferenceConfig = LlmModelLocation & {
  maxTokens?: number;
  topK?: number;
  temperature?: number;
  randomSeed?: number;
  multiModal?: boolean;
};

export interface DownloadProgressEvent {
  modelName: string;
  url?: string;
  bytesDownloaded?: number;
  totalBytes?: number;
  progress?: number;
  status: "downloading" | "completed" | "error" | "cancelled";
  error?: string;
}

export interface DownloadOptions {
  overwrite?: boolean;
  timeout?: number;
  headers?: Record<string, string>;
}

type BaseLlmParams = {
  maxTokens?: number;
  topK?: number;
  temperature?: number;
  randomSeed?: number;
  multiModal?: boolean;
};

/**
 * Represents a Spaced Repetition System (SRS) card used for language learning.
 *
 * @interface SrsCard
 * @property {number} id - A unique identifier for the card.
 * @property {number} wordId - The ID of the word associated with the card.
 * @property {string} language - The language of the word on the card.
 * @property {string} dueDate - The next review date for the card, stored as an ISO 8601 string.
 * @property {number} interval - The time interval (in days) until the next review.
 * @property {number} repetitions - The number of times the card has been successfully reviewed.
 * @property {number} easeFactor - A factor that determines the growth of the review interval.
 * @property {boolean} isBuried - Indicates if the card is temporarily hidden.
 * @property {string} deckLevel - The level or difficulty of the card within its deck.
 */
export type SrsCard = {
  id: number;
  wordId: number;
  language: string;
  dueDate: string;
  interval: number;
  repetitions: number;
  easeFactor: number;
  isBuried: boolean;
  deckLevel: string;
}

/**
 * Represents a word entry with its associated metadata.
 *
 * @interface Word
 * @property {number} id - The unique identifier for the word.
 * @property {string} language - The language of the word (e.g., "german").
 * @property {string} word - The word itself (e.g., "Hallo").
 * @property {string} meaning - The meaning of the word (e.g., "Hello").
 * @property {string} writing - The writing of the word, which might be different from the word itself (e.g., in other scripts).
 * @property {string} wordType - The grammatical type of the word (e.g., "interjection").
 * @property {string} category1 - The primary category for the word.
 * @property {string | null} category2 - An optional secondary category for the word.
 * @property {string | null} phonetics - An optional phonetic transcription of the word.
 * @property {string[]} tags - A list of tags associated with the word.
 */
export type Word = {
  id: number;
  language: string;
  word: string;
  meaning: string;
  writing: string;
  wordType: string;
  category1: string;
  category2: string | null;
  phonetics: string | null;
  tags: string[];
}

export type Story = {
  original: string;
  translation: string;
};

/**
 * A combined type representing a due SRS card along with its associated word data.
 *
 * @interface DueCardWithWord
 * @property {SrsCard} card - The SRS card data.
 * @property {Word} word - The word data associated with the card.
 */
export type DueCardWithWord = {
  card: SrsCard;
  word: Word;
}

export type TopicPreview = {
  topic: string;
  wordCount: number;
  exampleWords: string[];
}

export type TopicCard = {
  cards: DueCardWithWord[];
  content: string;
  translation: string;
}

export type StatsResult = {
  wordsCount: number;
  totalCards: number;
  cardsByDeckLevel: Record<string, number>;
  reviewsOverTime: Array<{
    date: string;
    count: number;
    avgEase: number;
    avgInterval: number;
  }>;
}

/**
 * Props for the `useLLM` hook.
 * - If `modelUrl` is provided, `modelName` is also required for downloadable models.
 * - Otherwise, `storageType` and either `modelName` (for assets) or `modelPath` (for files) are required.
 */
// This existing UseLLMProps is a good union type for the implementation signature.
export type UseLLMProps = BaseLlmParams & (
  | { modelUrl?: undefined; storageType: "asset"; modelName: string; modelPath?: undefined }
  | { modelUrl?: undefined; storageType: "file"; modelPath: string; modelName?: undefined }
  | { modelUrl: string; modelName: string; storageType?: undefined; modelPath?: undefined }
);

// Specific prop types for hook overloads
export type UseLLMAssetProps = BaseLlmParams & { modelUrl?: undefined; storageType: "asset"; modelName: string; modelPath?: undefined };
export type UseLLMFileProps = BaseLlmParams & { modelUrl?: undefined; storageType: "file"; modelPath: string; modelName?: undefined };
export type UseLLMDownloadableProps = BaseLlmParams & { modelUrl: string; modelName: string; storageType?: undefined; modelPath?: undefined };


// Return types for the useLLM hook
export interface BaseLlmReturn {
  generateResponse: (
    promptText: string,
    imagePath: string,
    useTools: boolean,
    onPartial?: (partial: string, reqId: number | undefined) => void,
    onErrorCb?: (message: string, reqId: number | undefined) => void,
    abortSignal?: AbortSignal
  ) => Promise<string>;
  generateStreamingResponse: (
    promptText: string,
    imagePath: string,
    useTools: boolean,
    onPartial?: (partial: string, reqId: number) => void,
    onErrorCb?: (message: string, reqId: number) => void,
    abortSignal?: AbortSignal
  ) => Promise<void>;
  isLoaded: boolean;
}

export interface DownloadableLlmReturn extends BaseLlmReturn {
  downloadModel: (options?: DownloadOptions) => Promise<boolean>;
  loadModel: () => Promise<void>;
  downloadStatus: "not_downloaded" | "downloading" | "downloaded" | "error";
  downloadProgress: number;
  downloadError: string | null;
  isCheckingStatus: boolean;
}

export interface NativeModuleSubscription {
  remove(): void;
}

export interface ExpoLlmMediapipeModule {
  /**
   * Creates a model from a file path.
   * @param modelPath - The path to the model file.
   * @param maxTokens - The maximum number of tokens to generate.
   * @param topK - The number of top tokens to consider.
   * @param temperature - The temperature for sampling.
   * @param randomSeed - The random seed for reproducibility.
   * @param multimodal - multimodal flag for model
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
   * @param randomSeed - The random seed for reproducibility.
   * @param multimodal - multimodal flag for model
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
  releaseModel(handle: number): Promise<boolean>;

  /**
   * Generates a response based on the provided prompt.
   * @param handle - The model handle.
   * @param requestId - The unique request identifier.
   * @param prompt - The input prompt for the model.
   * @returns A promise that resolves to the generated response.
   */
  generateResponse(
    handle: number,
    requestId: number,
    prompt: string,
    imagePath: string,
    useTools: boolean,
  ): Promise<string>;

  /**
   * Generates a response asynchronously based on the provided prompt.
   * @param handle - The model handle.
   * @param requestId - The unique request identifier.
   * @param prompt - The input prompt for the model.
   * @returns A promise that resolves to a boolean indicating success or failure.
   */
  generateResponseAsync(
    handle: number,
    requestId: number,
    prompt: string,
    imagePath: string,
    useTools: boolean,
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
   * @param randomSeed - The random seed for reproducibility.
   * @param multiModal - The random seed for reproducibility.
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
  addListener<EventName extends keyof ExpoLlmMediapipeModuleEvents>(
    eventName: EventName,
    listener: ExpoLlmMediapipeModuleEvents[EventName],
  ): NativeModuleSubscription;

  /**
   * Removes all listeners for a specific event.
   * @param event - The name of the event to remove listeners for.
   * @returns A promise that resolves when all listeners have been removed.
   */
  removeAllListeners(event: keyof ExpoLlmMediapipeModuleEvents): void;

  /**
   * Asynchronously updates summaries by extracting content from a raw response.
   *
   * @param rawResponse The raw response string containing content to be extracted.
   * @returns A promise that resolves to `true` upon successful completion or rejects with an error.
   */
  updateSummaries: (rawResponse: string) => Promise<boolean>;

  /**
   * Checks if the database is initialized by verifying the existence of required tables
   * and ensuring the database version meets the minimum requirement.
   *
   * @returns `true` if the database is initialized and valid, `false` otherwise.
   */
  isDatabaseInitialized(): boolean;

  /**
   * Retrieves all Spaced Repetition System (SRS) cards from the database.
   * The cards are ordered by their ID in ascending order.
   *
   * @returns An array of `SrsCard` objects (as string) , or an empty array if no cards are found or an error occurs during the read operation.
   */
  getAllSrsCards(): string;

  /**
   * Retrieves a single word from the database by its ID.
   *
   * @param id The unique identifier of the word to retrieve.
   * @returns A `Word` object (as string ) if found, otherwise `null`.
   */
  getWordById(id: number): string | null;

  /**
   * Retrieves all words from the database.
   * The cards are ordered by their timestamp in descending order
   *
   * @returns An array of `Word` objects (as string) , or an empty array if no cards are found or an error occurs during the read operation.
   */
  getAllWords(): string;
  /**
   * Inserts a new word entry into the database.
   *
   * @param language The language of the word.
   * @param word The word itself.
   * @param meaning The meaning of the word.
   * @param writing The writing of the word (e.g., in a specific script).
   * @param wordType The grammatical type of the word.
   * @param category1 The primary category for the word.
   * @param category2 An optional secondary category for the word.
   * @param phonetics An optional phonetic transcription of the word.
   * @param tags An optional list of tags associated with the word.
   * @returns The ID of the newly inserted row as a number, or `null` if the insertion failed.
   */
  insertWord(
    language: string,
    word: string,
    meaning: string,
    writing: string,
    wordType: string,
    category1: string,
    category2?: string | null,
    phonetics?: string | null,
    tags?: string[] | null
  ): number | null;

  /**
   * Logs a review for a specific SRS card, updates its Spaced Repetition System (SRS) properties
   * based on the review quality, and returns the updated card.
   *
   * This function typically involves:
   * 1. Retrieving the existing card by `cardId`.
   * 2. Recording the review event (card ID, quality, review date).
   * 3. Calculating new interval, repetitions, and ease factor using an SM-2 like algorithm.
   * 4. Determining the new due date based on the calculated interval.
   * 5. Updating the card's details in the database.
   *
   * @param cardId The unique identifier of the SRS card being reviewed.
   * @param quality The quality of the review (e.g., 0-5, where higher is better).
   * @returns The updated `SrsCard` object (as string) if the card is found and the review is processed,
   * otherwise `null` if the card is not found or an error occurs during the transaction.
   */
  logReview(cardId: number, quality: number): string | null;

  /**
   * Retrieves a list of due SRS cards for a specific language, up to a specified limit.
   *
   * This function performs a join between the `srs_cards` and `words` tables to
   * fetch cards that are due on or before the current date, are not buried, and match the specified language.
   * The results are ordered by the due date.
   *
   * @param language The language of the cards to retrieve (e.g., "german").
   * @param limit The maximum number of due cards to return.
   * @returns An array of `DueCardWithWord` objects, or an empty array if no matching cards are found.
   */
  getDueCards(language: string, limit: number): string | null;

  /**
   * Asynchronously initializes the database.
   *
   * This function attempts to validate the existing database or perform a safe initialization.
   * It resolves with `true` if the database is successfully initialized or validated,
   * and `false` otherwise. If an error occurs during the process, the promise will be rejected.
   *
   * @returns A promise that resolves to a boolean indicating the success of the initialization,
   * or rejects with an error if the operation fails.
   */
  initializeDatabase(): Promise<boolean>;

  /**
   * Asynchronously fetches recommended vocabulary topics for language learning.
   * Combines existing topics from database with AI-generated suggestions.
   * 
   * @param handle - Unique identifier for the user/session (used for request cancellation)
   * @param requestId - Unique identifier for tracking this specific request
   * @param language - Target language code (e.g., "en", "es")
   * @param count - Number of recommended topics to return
   * 
   * @returns a list of string (as raw string)
   **/
  getRecommendedTopics(handle: number, requestId: number, language: string, count: number): Promise<string>;

  /**
   * Asynchronously fetches preview information for a specific vocabulary topic in a given language.
   * Returns word count and example words for the topic.
   * 
   * @param topic - The vocabulary topic to preview (e.g., "food", "travel")
   * @param language - Target language code (e.g., "en", "es")
   * @returns A Promise that resolves with a TopicPreview object (as string)
   **/
  getTopicPreview(topic: string, language: string): Promise<string>;

  /**
   * Asynchronously fetches recommended vocabulary topics for language learning.
   * Combines existing topics from database with AI-generated suggestions.
   * 
   * @param handle - Unique identifier for the user/session (used for request cancellation)
   * @param requestId - Unique identifier for tracking this specific request
   * @param topic - Target topic
   * @param language - Target language code (e.g., "en", "es")
   * @param count - Number of recommended topics to return
   * @param deckLevel - Target level for this language
   * 
   * @returns a list of TopicCard (as raw string)
   **/
  generateTopicCards(handle: number, requestId: number, topic: string, language: string, count: number, deckLevel: string): Promise<string>;

  /**
   * Asynchronously fetches statistics for a specific language
   * 
   * @param language - Target language code (e.g., "german", "japanese")
   * @returns A Promise of StatsResult (as string)
   **/
  fetchStats(language: string): Promise<string>;
  /**
   * Forcefully reinitializes the database by dropping all tables and recreating the schema.
   * This is a destructive synchronous operation that erases all existing data.
   * 
   * @returns {boolean} - `true` if successful, `false` if initialization failed
   * 
   * @example
   * // Synchronous usage
   * const success = forceInitializeDatabase();
   * if (success) {
   *   console.log("Database reset successfully");
   * } else {
   *   console.error("Database reset failed");
   * }
   */
  forceInitializeDatabase(): boolean;

}
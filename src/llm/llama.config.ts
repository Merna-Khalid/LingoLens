import { initLlama, LlamaContext, NativeCompletionResult, loadLlamaModelInfo } from "llama.rn";

import AsyncStorage from '@react-native-async-storage/async-storage';

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { NativeLlamaChatMessage } from "llama.rn/lib/typescript/NativeRNLlama";

const stopWords = ['</s>', '<|end|>', '<|eot_id|>', '<|end_of_text|>', '<|im_end|>', '<|EOT|>', '<|END_OF_TURN_TOKEN|>', '<|end_of_turn|>', '<|endoftext|>']

const LLMS_DIRECTORY = FileSystem.documentDirectory;

const keys = [
    "last_used_model"
]

const storeData = async (key: string, value: string) => {
    try {
        await AsyncStorage.setItem(key, value);
    } catch (e) {
        console.error('Saving error:', e);
    }
};

const getData = async (key: string) => {
    try {
        const value = await AsyncStorage.getItem(key);
        return value;
    } catch (e) {
        console.error('Reading error:', e);
    }
};




const PROMPTS = {
    "basic": "This is a conversation between user and llama, a friendly chatbot. respond in simple markdown.",
}

const pickFile = async (): Promise<String | null> => {
    const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: false,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
        const fileUri = result.assets[0].uri;
        const fileName = fileUri.split('/').pop() || '';
        const fileInfo = await FileSystem.getInfoAsync(fileUri);
        if (!fileInfo.exists) {
            return null;
        } else {
            const destPath = LLMS_DIRECTORY + "model.gguf";
            console.log('1 File copied destPath', destPath);
            await FileSystem.copyAsync({ from: fileUri, to: destPath });
            console.log('2 File copied to:', destPath);
            return destPath;
        }
    } else {
        return null;
    }
};

// class LlamaService {
//     private ctx?: LlamaContext;
//     private modelInfo?: Object;
//     private modelPath: string;

//     constructor(modelPath: string) {
//         this.modelPath = modelPath;
//     }

//     async initialize(): Promise<void> {
//         this.ctx = await initLlama({
//             model: this.modelPath,
//             use_mlock: true,
//             n_ctx: 2048,
//             cache_type_k: "q5_0",
//             cache_type_v: "q5_0",
//         });
//     }

//     async generateCompletion(prompt: string): Promise<NativeCompletionResult> {
//         if (!this.ctx) {
//             throw new Error("Llama context not initialized.");
//         }

//         return this.ctx.completion({
//             prompt,
//             n_predict: 10,
//             stop: stopWords,
//             ignore_eos: false
//         });
//     }

//     async getModelInfo(): Promise<Object> {
//         if (this.modelInfo) {
//             return this.modelInfo;
//         }

//         const info = await loadLlamaModelInfo(this.modelPath);
//         this.modelInfo = info;
//         return info;
//     }
// }
class LlamaService {
    // The single instance of the LlamaService class
    private static instance: LlamaService;

    private ctx?: LlamaContext;
    private modelInfo?: Object;
    private modelPath: string;
    private isInitializing: boolean = false; // To prevent multiple simultaneous initializations
    private initializationPromise: Promise<void> | null = null; // To hold the initialization promise

    /**
     * The constructor is private to prevent direct instantiation.
     * Use LlamaService.getInstance() instead.
     */
    private constructor(modelPath: string) {
        this.modelPath = modelPath;
    }

    /**
     * Returns the singleton instance of LlamaService.
     * If an instance does not exist, it creates one.
     * @param modelPath The path to the GGUF model. Required only for the first call.
     * @returns The singleton instance of LlamaService.
     */
    public static getInstance(modelPath?: string): LlamaService {
        if (!LlamaService.instance) {
            if (!modelPath) {
                throw new Error("LlamaService must be initialized with a modelPath on the first call to getInstance().");
            }
            LlamaService.instance = new LlamaService(modelPath);
        } else if (modelPath && LlamaService.instance.modelPath !== modelPath) {
            console.warn("LlamaService already initialized with a different modelPath. Ignoring new modelPath.");
        }
        return LlamaService.instance;
    }

    /**
     * Initializes the Llama context. This method should be called once after getting the instance.
     * It handles preventing multiple simultaneous initializations.
     */
    async initialize(): Promise<void> {
        const modelPath = await pickFile();
        console.log("model path", modelPath)
        this.modelPath = modelPath as string;
        if (this.ctx) {
            console.log("Llama context already initialized.");
            return;
        }
        console.log("trying to ")

        if (this.isInitializing) {
            console.log("Llama context is already initializing. Waiting for it to complete.");
            return this.initializationPromise!;
        }

        this.isInitializing = true;
        this.initializationPromise = (async () => {
            try {
                console.log("Starting Llama context initialization...");
                this.ctx = await initLlama({
                    model: this.modelPath,
                    use_mlock: true,
                    n_ctx: 2048,
                    // cache_type_k: "q5_0",
                    // cache_type_v: "q5_0",
                });
                console.log("Llama context initialized successfully.");
            } catch (error) {
                console.error("Failed to initialize Llama context:", error);
                this.ctx = undefined; // Clear context on failure
                throw error;
            } finally {
                this.isInitializing = false;
                this.initializationPromise = null;
            }
        })();
        return this.initializationPromise;
    }

    isInitialized(): boolean {
        return this.ctx !== undefined;
    }

    /**
     * Generates a completion from the LLM based on the provided prompt.
     * Requires the Llama context to be initialized.
     * @param messages the history of the chat
     * @returns A promise that resolves to the NativeCompletionResult.
     */
    async generateCompletion(messages: NativeLlamaChatMessage[] ): Promise<NativeCompletionResult> {
        if (!this.ctx) {
            // If not initialized, try to initialize, but don't block indefinitely if it fails
            if (!this.isInitializing) {
                console.error("Llama context not initialized. Call initialize() first.");
                throw new Error("Llama context not initialized. Call initialize() first.");
            } else {
                console.log("Llama context is still initializing. Waiting before generating completion.");
                await this.initializationPromise; // Wait for ongoing initialization
                if (!this.ctx) { // Check again after waiting
                    throw new Error("Llama context failed to initialize. Cannot generate completion.");
                }
            }
        }

        console.log(messages)

        return this.ctx.completion({
            messages,
            n_predict: 100,
            stop: stopWords,
            ignore_eos: false
        });
    }

    /**
     * Retrieves information about the loaded model.
     * Caches the information after the first successful retrieval.
     * @returns A promise that resolves to the model information object.
     */
    async getModelInfo(): Promise<Object> {
        if (this.modelInfo) {
            return this.modelInfo;
        }

        try {
            const info = await loadLlamaModelInfo(this.modelPath);
            this.modelInfo = info;
            return info;
        } catch (error) {
            console.error("Failed to load Llama model info:", error);
            throw error;
        }
    }

    /**
     * Disposes of the Llama context, freeing up resources.
     * This should be called when the app no longer needs the LLM (e.g., on app shutdown or when switching models).
     */
    public async dispose(): Promise<void> {
        if (this.ctx) {
            console.log("Disposing Llama context...");
            // Assuming llama.rn provides a dispose or release method on the context
            // If not, you might just set this.ctx = undefined;
            // For demonstration, we'll simulate it.
            await new Promise(resolve => setTimeout(resolve, 100));
            await this.ctx.release();
            this.ctx = undefined;
            this.modelInfo = undefined;
            console.log("Llama context disposed.");
        }
    }
}

export { LlamaService, LLMS_DIRECTORY };
package expo.modules.lingopromultimodalmodule // IMPORTANT: This package MUST match LingoproMultimodalModule.kt

import android.content.Context
import android.net.Uri
import com.google.mediapipe.tasks.genai.llminference.GraphOptions
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import com.google.mediapipe.tasks.genai.llminference.LlmInferenceSession
import com.google.mediapipe.tasks.genai.llminference.ProgressListener
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.framework.image.BitmapImageBuilder
import java.io.File
import java.io.InputStream
import java.io.IOException // Added for IOException
import android.util.Log // Added for Log


private const val MAX_IMAGE_SIZE = 224

// Interface for callbacks from the LlmInferenceModel to the native module
interface InferenceListener {
    fun logging(model: LlmInferenceModel, message: String)
    fun onError(model: LlmInferenceModel, requestId: Int, error: String)
    fun onResults(model: LlmInferenceModel, requestId: Int, response: String)
}

class LlmInferenceModel(
    private var context: Context,
    private val modelPath: String,
    val maxTokens: Int,
    val topK: Int,
    val temperature: Float,
    val randomSeed: Int, // Keep as Int here, convert to Long for MediaPipe
    val multiModal: Boolean,
    val inferenceListener: InferenceListener? = null,
) {
    private var llmInference: LlmInference
    private var llmInferenceSession: LlmInferenceSession

    // For tracking current request
    private var requestId: Int = 0
    private var requestResult: String = ""

    init {
        Log.d("LlmInferenceModel", "Initializing LlmInferenceModel with path: $modelPath")

        // Create the LLM engine
        val inferenceOptions = LlmInference.LlmInferenceOptions.builder()
            .setModelPath(modelPath)
            .setMaxTokens(maxTokens)
            .setPreferredBackend(LlmInference.Backend.CPU)
            // NOTE: it is mentioned that gemma-3n accepts a maximum of 1 page
            // per session so we need to explicitly set setMaxNumImages to 1
            // SRC: https://ai.google.dev/edge/mediapipe/solutions/genai/llm_inference/android
            .setMaxNumImages(1)
            .build()

        try {
            llmInference = LlmInference.createFromOptions(context, inferenceOptions)
            inferenceListener?.logging(this, "LLM inference engine created successfully")
            // --- EXTRA TEST: Log model characteristics ---
            val characteristicsMessage = """
                LlmInferenceModel Characteristics:
                - Model Path: $modelPath
                - Max Tokens (configured): $maxTokens
                - Top K (configured): $topK
                - Temperature (configured): $temperature
                - Random Seed (configured): $randomSeed
                - Multi-modal (configured): $multiModal
                Note: 'max_num_images' is an intrinsic model property and not directly queryable from the LlmInference public API.
                      The previous error 'Image added exceeds the maximum number of images allowed: 0' indicates that
                      the loaded model's internal configuration for max_num_images is indeed 0, regardless of the 'multiModal' flag passed here.
              """.trimIndent()
                    Log.d("LlmInferenceModel", characteristicsMessage)
                    inferenceListener?.logging(this, characteristicsMessage)
            // --- END ---
        } catch (e: Exception) {
            inferenceListener?.logging(this, "Error creating LLM inference engine: ${e.message}")
            throw IOException("Failed to initialize MediaPipe LLM: ${e.message}", e) // Re-throw as IOException
        }

        // Create a session with the specified parameters
        val sessionOptions = LlmInferenceSession.LlmInferenceSessionOptions.builder()
            .setTemperature(temperature)
            .setTopK(topK)
            .setRandomSeed(randomSeed.toInt())
            .setGraphOptions(GraphOptions.builder().setEnableVisionModality(multiModal).build())
            .build()

        try {
            llmInferenceSession = LlmInferenceSession.createFromOptions(llmInference, sessionOptions)
            inferenceListener?.logging(this, "LLM inference session created successfully")
        } catch (e: Exception) {
            inferenceListener?.logging(this, "Error creating LLM inference session: ${e.message}")
            llmInference.close() // Ensure llmInference is closed if session creation fails
            throw IOException("Failed to create MediaPipe LLM session: ${e.message}", e) // Re-throw as IOException
        }
    }

    /**
     * Generates text asynchronously with streaming results via callback
     */
    fun generateResponseAsync(requestId: Int, prompt: String, imagePath:String , callback: (String) -> Unit) {
        Log.d("LlmInferenceModel", "Starting async generate response for requestId: $requestId")
        this.requestId = requestId
        this.requestResult = ""

        try {
            // Re-create session for each query to ensure clean state
            llmInferenceSession.close()

            val sessionOptions = LlmInferenceSession.LlmInferenceSessionOptions.builder()
                .setTemperature(temperature)
                .setTopK(topK)
                .setRandomSeed(randomSeed.toInt())
                .setGraphOptions(GraphOptions.builder().setEnableVisionModality(multiModal).build())
                .build()

            llmInferenceSession = LlmInferenceSession.createFromOptions(llmInference, sessionOptions)

            // Add the prompt to the session
            llmInferenceSession.addQueryChunk(prompt)

            // Add image to the session (if multiModal is enabled)
            if (multiModal && imagePath.isNotEmpty()) {
                val imageUri = Uri.parse(imagePath)
                val inputStream: InputStream? = context.contentResolver.openInputStream(imageUri)
                if (inputStream != null) {
                    // Use a nullable Bitmap and safe calls
                    val bitmap: Bitmap? = BitmapFactory.decodeStream(inputStream)

                    // Close the input stream in a finally block or after use
                    // It's crucial to close streams even if an error occurs during bitmap decoding
                    try {
                        if (bitmap != null) {
                            val mpImage: MPImage = BitmapImageBuilder(bitmap).build()
                            llmInferenceSession.addImage(mpImage)
                        } else {
                            Log.d("LlmInferenceModel", "Warning: Could not decode bitmap from stream for image URI: ${imageUri}")
                        }
                    } finally {
                        // Ensure the input stream is closed
                        try {
                            inputStream.close()
                        } catch (e: IOException) {
                            Log.d("LlmInferenceModel", "Error closing input stream: ${e.message}")
                        }
                    }
                }
            }

            // Define the progress listener for streaming results
            val progressListener = ProgressListener<String> { result, isFinished ->
                // Send each partial result immediately through the listener
                inferenceListener?.onResults(this, requestId, result)

                // Only append to cumulative result and call callback on completion
                requestResult += result

                if (isFinished) {
                    callback(requestResult) // This callback is for the final result
                }
            }

            // Generate the response asynchronously
            llmInferenceSession.generateResponseAsync(progressListener)
        } catch (e: Exception) {
            Log.e("LlmInferenceModel", "Async inference error: ${e.message}", e)
            inferenceListener?.onError(this, requestId, e.message ?: "Unknown async inference error")
            callback("") // Ensure callback is called even on error
        }
    }

    /**
     * Generates text synchronously and returns the complete response
     */
    fun generateResponse(requestId: Int, prompt: String, imagePath: String): String {
        Log.d("LlmInferenceModel", "Starting generate response for requestId: $requestId")

        synchronized(this) {
            this.requestId = requestId
            this.requestResult = ""
        }

        var session: LlmInferenceSession? = null
        var inputStream: InputStream? = null
        var bitmap: Bitmap? = null

        return try {
            try {
                llmInferenceSession?.close()
            } catch (e: Exception) {
                Log.w("LlmInferenceModel", "Failed to close old session: ${e.message}")
            }

            val sessionOptions = LlmInferenceSession.LlmInferenceSessionOptions.builder()
                .setTemperature(temperature)
                .setTopK(topK)
                .setRandomSeed(randomSeed.toInt())
                .setGraphOptions(GraphOptions.builder().setEnableVisionModality(multiModal).build())
                .build()

            session = LlmInferenceSession.createFromOptions(llmInference, sessionOptions)
            llmInferenceSession = session

            session.addQueryChunk(prompt)

            if (multiModal && imagePath.isNotEmpty()) {
                try {
                    val uri = Uri.parse(imagePath)
                    inputStream = context.contentResolver.openInputStream(uri)

                    inputStream?.let { stream ->
                        // Step 1: Decode only bounds to check image size
                        val options = BitmapFactory.Options().apply {
                            inJustDecodeBounds = true
                        }
                        BitmapFactory.decodeStream(stream, null, options)
                        val originalWidth = options.outWidth
                        val originalHeight = options.outHeight

                        // Step 2: Determine scale factor
                        val largestDim = originalWidth.coerceAtLeast(originalHeight)
                        val sampleSize = if (largestDim > MAX_IMAGE_SIZE) {
                            Integer.highestOneBit(largestDim / MAX_IMAGE_SIZE) * 2
                        } else 1

                        // Re-open stream for actual decode
                        stream.close()
                        inputStream = context.contentResolver.openInputStream(uri)

                        val decodeOptions = BitmapFactory.Options().apply {
                            inSampleSize = sampleSize
                            inJustDecodeBounds = false
                        }
                        bitmap = BitmapFactory.decodeStream(inputStream, null, decodeOptions)

                        bitmap?.let {
                            session.addImage(BitmapImageBuilder(it).build())
                        } ?: Log.w("LlmInferenceModel", "Decoded bitmap is null")
                    }
                } catch (e: Exception) {
                    Log.w("LlmInferenceModel", "Image processing error: ${e.message}")
                }
            }
            Log.d("LlmInferenceModel", "here 1")
            val result = session.generateResponse()
            Log.d("LlmInferenceModel", "here 2")
            inferenceListener?.onResults(this, requestId, result)
            result

        } catch (e: Exception) {
            Log.e("LlmInferenceModel", "Inference error", e)
            inferenceListener?.onError(this, requestId, e.message ?: "Unknown error")
            throw LlmInferenceException("Generation failed", e)
        } finally {
            try {
                inputStream?.close()
            } catch (e: IOException) {
                Log.w("LlmInferenceModel", "Stream close error", e)
            }
            bitmap?.recycle()

            if (session != llmInferenceSession) {
                session?.close()
            }
        }
    }


    /**
     * Close resources when no longer needed
     */
    fun close() {
        Log.d("LlmInferenceModel", "Closing LlmInferenceModel resources.")
        try {
            llmInferenceSession.close()
            llmInference.close()
        } catch (e: Exception) {
            // Ignore close errors, but log them
            Log.e("LlmInferenceModel", "Error closing resources: ${e.message}", e)
            inferenceListener?.logging(this, "Error closing resources: ${e.message}")
        }
    }
}

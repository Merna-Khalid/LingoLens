package expo.modules.lingopromultimodalmodule // IMPORTANT: This package MUST match LingoproMultimodalModule.kt

import android.content.Context
import kotlinx.coroutines.*
import kotlin.math.roundToInt
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.withContext
import android.net.Uri
import kotlinx.coroutines.Job
import kotlinx.coroutines.CompletableDeferred
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
import java.io.IOException
import android.util.Log


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
    private val externalScope: CoroutineScope,
    val maxTokens: Int,
    val topK: Int,
    val temperature: Float,
    val randomSeed: Int, // Keep as Int here, convert to Long for MediaPipe
    val multiModal: Boolean,
    val inferenceListener: InferenceListener? = null,
) {
    // private val moduleCoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private lateinit var llmInference: LlmInference
    private lateinit var llmInferenceSession: LlmInferenceSession

    @Volatile
    private var isSessionRunning = false
    private var currentJob: Job? = null

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

            if (::llmInference.isInitialized) {
                llmInference.close()
            } // Ensure llmInference is closed if session creation fails

            throw IOException("Failed to create MediaPipe LLM session: ${e.message}", e) // Re-throw as IOException
        }
    }

    private suspend fun decodeAndResizeImage(uri: Uri, targetWidth: Int = 640): Bitmap? {
        return withContext(Dispatchers.IO) {
            try {
                var inputStream: InputStream? = null
                try {
                    inputStream = context.contentResolver.openInputStream(uri)
                    inputStream?.let { stream ->
                        // Mark the stream to allow resetting
                        if (stream.markSupported()) {
                            stream.mark(1024)
                        }

                        // Get image dimensions
                        val options = BitmapFactory.Options().apply {
                            inJustDecodeBounds = true
                        }
                        BitmapFactory.decodeStream(stream, null, options)

                        // Reset or reopen stream
                        val decodeStream = if (stream.markSupported()) {
                            stream.reset()
                            stream
                        } else {
                            stream.close()
                            context.contentResolver.openInputStream(uri)
                        }

                        // Calculate sampling and decode
                        options.inSampleSize = calculateInSampleSize(options, targetWidth)
                        options.inJustDecodeBounds = false
                        options.inPreferredConfig = Bitmap.Config.RGB_565

                        // Decode and resize
                        decodeStream?.use { finalStream ->
                            BitmapFactory.decodeStream(finalStream, null, options)?.let { bitmap ->
                                resizeBitmap(bitmap, targetWidth)
                            }
                        }
                    }
                } finally {
                    inputStream?.close()
                }
            } catch (e: Exception) {
                Log.e("ImageProcessing", "Error decoding image", e)
                null
            }
        }
    }

    private fun calculateInSampleSize(options: BitmapFactory.Options, reqWidth: Int): Int {
        val width = options.outWidth
        var inSampleSize = 1

        if (width > reqWidth) {
            inSampleSize = (width / reqWidth.toFloat()).roundToInt()
        }
        return inSampleSize
    }

    private fun resizeBitmap(bitmap: Bitmap, targetWidth: Int): Bitmap {
        val aspectRatio = bitmap.height.toFloat() / bitmap.width.toFloat()
        val targetHeight = (targetWidth * aspectRatio).toInt()
        return Bitmap.createScaledBitmap(bitmap, targetWidth, targetHeight, true)
    }

    fun generateResponseAsync(requestId: Int, prompt: String, imagePath: String, callback: (String) -> Unit) {
        Log.d("LlmInferenceModel", "Starting async generate response for requestId: $requestId")
        currentJob?.cancel()
        currentJob = null

        currentJob = externalScope.launch(Dispatchers.IO) {
            try {
                synchronized(this@LlmInferenceModel) {
                    this@LlmInferenceModel.requestId = requestId
                    this@LlmInferenceModel.requestResult = ""
                }

                // Re-create session for each query to ensure clean state
                if (::llmInferenceSession.isInitialized) {
                    llmInferenceSession.close()
                }

                val sessionOptions = LlmInferenceSession.LlmInferenceSessionOptions.builder()
                    .setTemperature(temperature)
                    .setTopK(topK)
                    .setRandomSeed(randomSeed.toInt())
                    .setGraphOptions(
                        GraphOptions.builder().setEnableVisionModality(multiModal).build()
                    )
                    .build()

                llmInferenceSession = LlmInferenceSession.createFromOptions(llmInference, sessionOptions)

                // Add the prompt to the session
                llmInferenceSession.addQueryChunk(prompt)

                // Process image if needed
                if (multiModal && imagePath.isNotEmpty()) {
                    try {
                        val imageUri = Uri.parse(imagePath)
                        val resizedBitmap = decodeAndResizeImage(imageUri, MAX_IMAGE_SIZE)
                        Log.d("LlmInferenceModel", "ResizedBitmap : $resizedBitmap")
                        if (resizedBitmap != null) {
                            val mpImage: MPImage = BitmapImageBuilder(resizedBitmap).build()
                            llmInferenceSession.addImage(mpImage)
                        }
                    } catch (e: Exception) {
                        Log.w("LlmInferenceModel", "Image processing error: ${e.message}")
                    }
                }

                Log.d("LlmInferenceModel", "Generate Response Async here, after image loading")
                // Define the progress listener for streaming results
                val progressListener = ProgressListener<String> { result, isFinished ->
                    // Send each partial result immediately through the listener
                    inferenceListener?.onResults(this@LlmInferenceModel, requestId, result)

                    // Only append to cumulative result and call callback on completion
                    requestResult += result
                    Log.d("LlmInferenceModel", "Generate Response Async here, $result")

                    if (isFinished) {
                        callback(requestResult)
                    }
                }
                Log.d("LlmInferenceModel", "Starting response")

                // Generate the response asynchronously
                llmInferenceSession.generateResponseAsync(progressListener)
            } catch (e: Exception) {
                Log.e("LlmInferenceModel", "Async inference error: ${e.message}", e)
                inferenceListener?.onError(
                    this@LlmInferenceModel,
                    requestId,
                    e.message ?: "Unknown async inference error"
                )
                callback("")
            }
        }
    }

    /**
     * Generates text synchronously and returns the complete response
     */
    fun generateResponse(requestId: Int, prompt: String, imagePath: String, callback: (String) -> Unit) {
        Log.d("LlmInferenceModel", "Starting generate response for requestId: $requestId")

        currentJob?.cancel()
        currentJob = null

        currentJob = externalScope.launch(Dispatchers.IO) {
            try {
                synchronized(this@LlmInferenceModel) {
                    this@LlmInferenceModel.requestId = requestId
                    this@LlmInferenceModel.requestResult = ""
                }
                try {
                    if (::llmInferenceSession.isInitialized) {
                        llmInferenceSession.close()
                    }

                } catch (e: Exception) {
                    Log.w("LlmInferenceModel", "Failed to close old session: ${e.message}")
                }

                val sessionOptions = LlmInferenceSession.LlmInferenceSessionOptions.builder()
                    .setTemperature(temperature)
                    .setTopK(topK)
                    .setRandomSeed(randomSeed.toInt())
                    .setGraphOptions(
                        GraphOptions.builder().setEnableVisionModality(multiModal).build()
                    )
                    .build()

                llmInferenceSession = LlmInferenceSession.createFromOptions(llmInference, sessionOptions)

                llmInferenceSession.addQueryChunk(prompt)

                if (multiModal && imagePath.isNotEmpty()) {
                    try {
                        val imageUri = Uri.parse(imagePath)
                        val resizedBitmap = decodeAndResizeImage(imageUri, MAX_IMAGE_SIZE)
                        if (resizedBitmap != null) {
                            val mpImage: MPImage = BitmapImageBuilder(resizedBitmap).build()
                            llmInferenceSession.addImage(mpImage)
                        }
                    } catch (e: Exception) {
                        Log.w("LlmInferenceModel", "Image processing error: ${e.message}")
                    }
                }
                Log.d("LlmInferenceModel", "Generating response...")
                val result = llmInferenceSession.generateResponse()
                Log.d("LlmInferenceModel", "Generation complete")
                inferenceListener?.onResults(this@LlmInferenceModel, requestId, result)
                withContext(Dispatchers.Main) {
                    callback(result)
                }

            } catch (e: Exception) {
                Log.e("LlmInferenceModel", "Inference error", e)
                inferenceListener?.onError(this@LlmInferenceModel, requestId, e.message ?: "Unknown error")
                withContext(Dispatchers.Main) {
                    callback("")
                }
            } finally {
                llmInferenceSession.close()
            }
        }
    }


    /**
     * Close resources when no longer needed
     */
    suspend fun close() {
        Log.d("LlmInferenceModel", "Closing LlmInferenceModel resources.")
        try {
            currentJob?.cancel()
            currentJob = null

            inferenceListener?.logging(this, "Closing model...")

            llmInferenceSession?.let {
                it.close()
                inferenceListener?.logging(this, "Session closed")
            }

            llmInference?.let {
                it.close()
                inferenceListener?.logging(this, "Inference closed")
            }
        } catch (e: Exception) {
            Log.e("LlmInferenceModel", "Error closing resources: ${e.message}", e)
            inferenceListener?.logging(this, "Error closing resources: ${e.message}")
        }
    }

}

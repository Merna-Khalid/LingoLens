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
            // .setMaxNumImages(1) // Removed this line as it was causing unresolved reference for some users
            .build()

        try {
            llmInference = LlmInference.createFromOptions(context, inferenceOptions)
            inferenceListener?.logging(this, "LLM inference engine created successfully")
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

            llmInferenceSession.addQueryChunk(prompt)
            // Add the prompt to the session
            if (multiModal && imagePath.isNotEmpty()) { // Use isNotEmpty() for string check
                try {
                    val imageUri = Uri.parse(imagePath)
                    context.contentResolver.openInputStream(imageUri)?.use { inputStream ->
                        val bitmap: Bitmap = BitmapFactory.decodeStream(inputStream)
                        val mpImage: MPImage = BitmapImageBuilder(bitmap).build()
                        llmInferenceSession.addImage(mpImage)
                        Log.d("LlmInferenceModel", "Image added to async session from path: $imagePath")
                    }
                } catch (e: Exception) {
                    Log.e("LlmInferenceModel", "Error processing image for async: ${e.message}", e)
                    inferenceListener?.onError(this, requestId, "Image processing failed for async: ${e.message}")
                    // Decide if you want to throw here or just log and continue without image
                    // For async, it's often better to log and let the text generation proceeds if possible
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
        Log.d("LlmInferenceModel", "Starting synchronous generate response for requestId: $requestId")
        this.requestId = requestId
        this.requestResult = ""

        return try {
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

            if (multiModal && imagePath.isNotEmpty()) { // Use isNotEmpty() for string check
                try {
                    val imageUri = Uri.parse(imagePath)
                    context.contentResolver.openInputStream(imageUri)?.use { inputStream ->
                        val bitmap: Bitmap = BitmapFactory.decodeStream(inputStream)
                        val mpImage: MPImage = BitmapImageBuilder(bitmap).build()
                        llmInferenceSession.addImage(mpImage)
                        Log.d("LlmInferenceModel", "Image added to synchronous session from path: $imagePath")
                    }
                } catch (e: Exception) {
                    Log.e("LlmInferenceModel", "Error processing image for synchronous: ${e.message}", e)
                    inferenceListener?.onError(this, requestId, "Image processing failed for synchronous: ${e.message}")
                    throw IOException("Image processing failed: ${e.message}", e)
                }
            }

            val result = llmInferenceSession.generateResponse()
            inferenceListener?.onResults(this, requestId, result) // Send final result via listener
            result // Return the final result
        } catch (e: Exception) {
            Log.e("LlmInferenceModel", "Synchronous inference error: ${e.message}", e)
            inferenceListener?.onError(this, requestId, e.message ?: "Unknown synchronous inference error")
            throw e
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

package expo.modules.lingopromultimodalmodule

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.channels.FileChannel


import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.genai.llminference.GraphOptions
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import com.google.mediapipe.tasks.genai.llminference.LlmInferenceSession
import androidx.core.graphics.scale

class LingoProMultimodalModule : Module() {
  private val TAG = "LingoProMultimodal"
  private var llmInference: LlmInference? = null
  private var isInitialized = false
  private var initializationError: String? = null

  private val sessionOptions = LlmInferenceSession.LlmInferenceSessionOptions.builder()
    .setTemperature(0.1f)
    .setTopK(5)
    .setGraphOptions(
      GraphOptions.builder()
        .setEnableVisionModality(true)
        // .setEnableAudioModality(true) // Uncomment if your .task model explicitly supports this in GraphOptions
        .build()
    )
    .build()

  override fun definition() = ModuleDefinition {
    Name("LingoProMultimodal")

    // Get the Android Context from the module's application context
    val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React Context is null")

    // Lifecycle event to initialize model when module is created
    onCreate {
      Log.d(TAG, "LingoProMultimodalModule created.")
    }

    // Lifecycle event to release model resources when module is destroyed
    onDestroy {
      Log.d(TAG, "LingoProMultimodalModule destroyed.")
      shutdown()
    }

    // Method to load the MediaPipe .task file
    Function("loadModel") { modelPath: String, promise: Promise ->
      launch {
        withContext(Dispatchers.IO) {
          try {
            Log.d(TAG, "Attempting to load MediaPipe model from: $modelPath")

            // Shutdown any existing model before loading a new one
            shutdown()

            val optionsBuilder = LlmInference.LlmInferenceOptions.builder()

            // Check if the model is in assets or a regular file system path
            if (modelPath.startsWith("file:///android_asset/")) {
              val assetFileName = modelPath.removePrefix("file:///android_asset/")
              optionsBuilder.setModelAssetPath(assetFileName)
              Log.d(TAG, "Loading model from assets: $assetFileName")
            } else {
              val modelFile = File(modelPath)
              if (modelFile.exists()) {
                optionsBuilder.setModelPath(modelFile.absolutePath) // Use setModelPath for direct file paths
                Log.d(TAG, "Loading model from file system: ${modelFile.absolutePath}")
              } else {
                throw IOException("Model file not found at: $modelPath")
              }
            }

            // Set maxNumImages if your model supports it and you expect multiple images
            optionsBuilder.setMaxNumImages(1) // Assuming one image per query for now

            llmInference = LlmInference.createFromOptions(context, optionsBuilder.build())
            isInitialized = true
            Log.d(TAG, "MediaPipe LLM model initialized successfully.")
            promise.resolve(true)
          } catch (e: Exception) {
            isInitialized = false
            initializationError = e.message
            Log.e(TAG, "Failed to load MediaPipe LLM model: ${e.message}", e)
            promise.reject("MODEL_LOAD_FAILED", "Failed to load MediaPipe LLM model: ${e.message}", e)
          }
        }
      }
    }

    // Main method to process multimodal input
    Function("processMultimodalInput") {
        textInput: String?,
        imageUri: String?,
        audioUri: String?,
        promise: Promise ->
      launch {
        withContext(Dispatchers.Default) { // Use Dispatchers.Default for CPU-bound tasks like image scaling
          if (!isInitialized || llmInference == null) {
            val errorMsg = "MediaPipe LLM model not initialized. Error: $initializationError"
            Log.e(TAG, errorMsg)
            promise.reject("MODEL_NOT_LOADED", errorMsg)
            return@withContext
          }

          // Prepare image input
          var mpImage: com.google.mediapipe.framework.image.MPImage? = null
          if (imageUri != null) {
            try {
              val uri = Uri.parse(imageUri)
              context.contentResolver.openInputStream(uri)?.use { inputStream ->
                var bitmap = BitmapFactory.decodeStream(inputStream)
                Log.d(TAG, "Original image loaded: ${bitmap.width}x${bitmap.height}")

                // Optimize image processing - resize bitmap to reduce processing time
                // Most vision models don't need full resolution images
                val resizedBitmap = if (bitmap.width > 512 || bitmap.height > 512) {
                  val scaleFactor = 512f / bitmap.width.coerceAtLeast(bitmap.height)
                  bitmap.scale(
                    (bitmap.width * scaleFactor).toInt(),
                    (bitmap.height * scaleFactor).toInt()
                  )
                } else {
                  bitmap
                }
                Log.d(TAG, "Resized image to: ${resizedBitmap.width}x${resizedBitmap.height}")
                mpImage = BitmapImageBuilder(resizedBitmap).build()
              }
            } catch (e: IOException) {
              Log.e(TAG, "Failed to load or process image from URI: $imageUri", e)
              promise.reject("IMAGE_PROCESSING_FAILED", "Failed to process image: ${e.message}", e)
              return@withContext
            }
          }

          // Prepare audio input (ByteBuffer)
          var audioByteBuffer: ByteBuffer? = null
          if (audioUri != null) {
            try {
              val uri = Uri.parse(audioUri)
              val parcelFileDescriptor = context.contentResolver.openFileDescriptor(uri, "r")
              parcelFileDescriptor?.use { pfd ->
                val fileChannel = FileInputStream(pfd.fileDescriptor).channel
                audioByteBuffer = fileChannel.map(FileChannel.MapMode.READ_ONLY, 0, fileChannel.size())
                Log.d(TAG, "Audio loaded successfully, size: ${audioByteBuffer?.capacity()} bytes")
              }
            } catch (e: IOException) {
              Log.e(TAG, "Failed to load audio from URI: $audioUri", e)
              promise.reject("AUDIO_PROCESSING_FAILED", "Failed to load audio: ${e.message}", e)
              return@withContext
            }
          }

          // Run inference using LlmInferenceSession
          try {
            Log.d(TAG, "Starting LLM inference with session...")
            val startTime = System.currentTimeMillis()

            // Create a new session for each query chunk, as per MediaPipe examples
            val result = LlmInferenceSession.createFromOptions(llmInference!!, sessionOptions).use { session ->
              if (textInput != null) {
                session.addQueryChunk(textInput)
                Log.d(TAG, "Added text chunk: '$textInput'")
              }
              if (mpImage != null) {
                session.addImage(mpImage!!)
                Log.d(TAG, "Added image to session.")
              }
              // IMPORTANT: Direct raw audio input to LlmInferenceSession for generative models
              // is not explicitly shown in common MediaPipe examples for .task files.
              // If your .task model supports raw audio input directly, you might need a
              // specific `session.addAudio(audioByteBuffer)` or similar method.
              // Otherwise, audio might need to be transcribed to text first, then sent as textInput.
              if (audioByteBuffer != null) {
                Log.d(TAG, "Audio ByteBuffer prepared. Note: Direct raw audio input to LlmInferenceSession for generative models might require specific .task model support or pre-processing.")
                // Example if a direct audio method existed:
                // session.addAudio(audioByteBuffer!!)
              }

              session.generateResponse()
            }

            val endTime = System.currentTimeMillis()
            Log.d(TAG, "LLM inference completed in ${endTime - startTime}ms. Response: ${result}")

            promise.resolve(result) // Resolve with the generated text response
          } catch (e: Exception) {
            Log.e(TAG, "Error during LLM inference: ${e.message}", e)
            promise.reject("INFERENCE_FAILED", "Error during LLM inference: ${e.message}", e)
          }
        }
      }
    }

    // Shutdown method to release resources
    // This is called when the module is destroyed or when loading a new model.
    fun shutdown() {
      llmInference?.close()
      llmInference = null
      isInitialized = false
      initializationError = null
      Log.d(TAG, "MediaPipe LLM resources shut down.")
    }
  }
}

package expo.modules.lingopromultimodalmodule

import android.content.Context
import android.net.Uri
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.io.File
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.BufferedInputStream

import expo.modules.lingopromultimodalmodule.LlmInferenceModel
import expo.modules.lingopromultimodalmodule.InferenceListener

private const val TAG = "LingoproMultimodal" // Changed TAG to match module name
private const val DOWNLOAD_DIRECTORY = "llm_models"

private val moduleCoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
private var activeJobs: MutableList<Job> = mutableListOf()

class LingoproMultimodalModule : Module() {
    private var nextHandle = 1
    private val modelMap = mutableMapOf<Int, LlmInferenceModel>()

    // Define these functions at class level, not in the definition block
    private fun createInferenceListener(modelHandle: Int): InferenceListener {
        return object : InferenceListener {
            override fun logging(model: LlmInferenceModel, message: String) {
                sendEvent("logging", mapOf(
                    "handle" to modelHandle,
                    "message" to message
                ))
            }

            override fun onError(model: LlmInferenceModel, requestId: Int, error: String) {
                sendEvent("onErrorResponse", mapOf(
                    "handle" to modelHandle,
                    "requestId" to requestId,
                    "error" to error
                ))
            }

            override fun onResults(model: LlmInferenceModel, requestId: Int, response: String) {
                sendEvent("onPartialResponse", mapOf(
                    "handle" to modelHandle,
                    "requestId" to requestId,
                    "response" to response
                ))
            }
        }
    }

    private fun copyFileToInternalStorageIfNeeded(modelName: String, context: Context): File {
        val outputFile = File(context.filesDir, modelName)

        // Check if the file already exists
        if (outputFile.exists()) {
            sendEvent("logging", mapOf(
                "message" to "File already exists: ${outputFile.path}, size: ${outputFile.length()}"
            ))
            return outputFile
        }

        try {
            val assetList = context.assets.list("") ?: arrayOf()
            Log.d(TAG, "Available assets: ${assetList.joinToString()}")
            sendEvent("logging", mapOf(
                "message" to "Available assets: ${assetList.joinToString()}"
            ))

            if (!assetList.contains(modelName)) {
                val errorMsg = "Asset file $modelName does not exist in assets"
                sendEvent("logging", mapOf("message" to errorMsg))
                throw IllegalArgumentException(errorMsg)
            }

            Log.d(TAG, "Copying asset $modelName to ${outputFile.path}")
            sendEvent("logging", mapOf(
                "message" to "Copying asset $modelName to ${outputFile.path}"
            ))

            // File doesn't exist, proceed with copying
            context.assets.open(modelName).use { inputStream ->
                FileOutputStream(outputFile).use { outputStream ->
                    val buffer = ByteArray(1024)
                    var read: Int
                    var total = 0

                    while (inputStream.read(buffer).also { read = it } != -1) {
                        outputStream.write(buffer, 0, read)
                        total += read

                        if (total % (1024 * 1024) == 0) { // Log every MB
                            Log.d(TAG, "Copied $total bytes so far for $modelName")
                            sendEvent("logging", mapOf(
                                "message" to "Copied $total bytes so far for $modelName"
                            ))
                        }
                    }

                    Log.d(TAG, "Copied $total bytes total for $modelName")
                    sendEvent("logging", mapOf(
                        "message" to "Copied $total bytes total for $modelName"
                    ))
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error copying asset file: ${e.message}", e)
            sendEvent("logging", mapOf(
                "message" to "Error copying asset file: ${e.message}"
            ))
            throw e
        }

        return outputFile
    }

    // Model directory management
    private fun getModelDirectory(): File {
        val modelDir = File(appContext.reactContext!!.filesDir, DOWNLOAD_DIRECTORY)
        if (!modelDir.exists()) {
            modelDir.mkdirs()
        }
        return modelDir
    }

    private fun getModelFile(modelName: String): File {
        return File(getModelDirectory(), modelName)
    }

    // Create model internal helper method
    private fun createModelInternal(modelPath: String, maxTokens: Int, topK: Int, temperature: Double, randomSeed: Int, multiModal: Boolean): Int {
        val modelHandle = nextHandle++
        val model = LlmInferenceModel(
            appContext.reactContext!!,
            modelPath,
            maxTokens,
            topK,
            temperature.toFloat(),
            randomSeed,
            multiModal,
            inferenceListener = createInferenceListener(modelHandle)
        )
        modelMap[modelHandle] = model
        return modelHandle
    }

    private val activeDownloads = mutableMapOf<String, Job>()

    override fun definition() = ModuleDefinition {
        Name("LingoproMultimodal") // Corrected native module name to LingoproMultimodal

        Constants(
            "PI" to Math.PI
        )

        Events("onChange", "onPartialResponse", "onErrorResponse", "logging", "downloadProgress")

        OnDestroy {
            Log.d(TAG, "LingoproMultimodal OnDestroy: Cancelling all active jobs and cleaning up models.")
            activeJobs.forEach { it.cancel() }
            activeJobs.clear()
            modelMap.values.forEach { it.close() }
            modelMap.clear()
        }

        AsyncFunction("createModel") { modelPath: String, maxTokens: Int, topK: Int, temperature: Double, randomSeed: Int, multiModal: Boolean, promise: Promise ->
            val job = moduleCoroutineScope.launch(Dispatchers.IO) {
                try {
                    val modelHandle = nextHandle++

                    Log.d(TAG, "createModel: Attempting to create model from path: $modelPath, handle: $modelHandle")
                    sendEvent("logging", mapOf(
                        "handle" to modelHandle,
                        "message" to "Attempting to create model from path: $modelPath"
                    ))
                    // Parse the path as a URI and get its clean path component
                    val cleanedPath = Uri.parse(modelPath).path
                    if (cleanedPath == null) {
                        throw IllegalArgumentException("Invalid modelPath URI: $modelPath")
                    }
                    Log.d(TAG, "createModel: Cleaned modelPath: $cleanedPath")
                    sendEvent("logging", mapOf(
                        "handle" to modelHandle,
                        "message" to "createModel: Cleaned modelPath: $cleanedPath"
                    ))

                    val modelFile = File(cleanedPath) // Create File object from the cleaned path
                    Log.d(TAG, "createModel: Attempting to create model from absolute path: ${modelFile.absolutePath}")
                    sendEvent("logging", mapOf(
                        "handle" to modelHandle,
                        "message" to "Attempting to create model from absolute path: ${modelFile.absolutePath}"
                    ))

                    if (!modelFile.exists()) {
                        throw FileNotFoundException("Model file not found at path: ${modelFile.absolutePath}")
                    }


                    val model = LlmInferenceModel(
                        appContext.reactContext!!,
                        modelFile.absolutePath,
                        maxTokens,
                        topK,
                        temperature.toFloat(),
                        randomSeed,
                        multiModal,
                        inferenceListener = createInferenceListener(modelHandle)
                    )
                    modelMap[modelHandle] = model
                    withContext(Dispatchers.Main) {
                        promise.resolve(modelHandle)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "createModel: Model creation failed: ${e.message}", e)
                    sendEvent("logging", mapOf(
                        "message" to "Model creation failed: ${e.message}"
                    ))
                    withContext(Dispatchers.Main) {
                        promise.reject("MODEL_CREATION_FAILED", e.message ?: "Unknown error", e)
                    }
                }
            }
            activeJobs.add(job)
            job.invokeOnCompletion { activeJobs.remove(job) }
        }

        AsyncFunction("createModelFromAsset") { modelName: String, maxTokens: Int, topK: Int, temperature: Double, randomSeed: Int, multiModal: Boolean, promise: Promise ->
            val job = moduleCoroutineScope.launch(Dispatchers.IO) {
                try {
                    Log.d(TAG, "createModelFromAsset: Creating model from asset: $modelName")
                    sendEvent("logging", mapOf(
                        "message" to "Creating model from asset: $modelName"
                    ))

                    val modelPath = copyFileToInternalStorageIfNeeded(modelName, appContext.reactContext!!).path

                    Log.d(TAG, "createModelFromAsset: Model file copied to: $modelPath")
                    sendEvent("logging", mapOf(
                        "message" to "Model file copied to: $modelPath"
                    ))

                    val modelFile = File(modelPath) // Create File object from the path
                    if (!modelFile.exists()) {
                        throw FileNotFoundException("Model file not found at path: ${modelFile.absolutePath}")
                    }

                    val modelHandle = nextHandle++
                    val model = LlmInferenceModel(
                        appContext.reactContext!!,
                        modelFile.absolutePath,
                        maxTokens,
                        topK,
                        temperature.toFloat(),
                        randomSeed,
                        multiModal,
                        inferenceListener = createInferenceListener(modelHandle)
                    )
                    modelMap[modelHandle] = model
                    withContext(Dispatchers.Main) {
                        promise.resolve(modelHandle)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "createModelFromAsset: Model creation from asset failed: ${e.message}", e)
                    sendEvent("logging", mapOf(
                        "message" to "Model creation from asset failed: ${e.message}"
                    ))
                    withContext(Dispatchers.Main) {
                        promise.reject("MODEL_CREATION_FAILED", e.message ?: "Unknown error", e)
                    }
                }
            }
            activeJobs.add(job)
            job.invokeOnCompletion { activeJobs.remove(job) }
        }

        AsyncFunction("releaseModel") { handle: Int, promise: Promise ->
            val job = moduleCoroutineScope.launch(Dispatchers.IO) {
                try {
                    val model = modelMap.remove(handle)
                    if (model != null) {
                        model.close() // Close the underlying MediaPipe model
                        Log.d(TAG, "releaseModel: Model with handle $handle released.")
                        withContext(Dispatchers.Main) { promise.resolve(true) }
                    } else {
                        Log.w(TAG, "releaseModel: No model found for handle $handle to release.")
                        withContext(Dispatchers.Main) { promise.reject("INVALID_HANDLE", "No model found for handle $handle", null) }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "releaseModel: Failed to release model with handle $handle: ${e.message}", e)
                    withContext(Dispatchers.Main) { promise.reject("RELEASE_FAILED", e.message ?: "Unknown error", e) }
                }
            }
            activeJobs.add(job)
            job.invokeOnCompletion { activeJobs.remove(job) }
        }

        AsyncFunction("generateResponse") { handle: Int, requestId: Int, prompt: String, imagePath: String, promise: Promise ->
            val job = moduleCoroutineScope.launch(Dispatchers.IO) {
                try {
                    val model = modelMap[handle]
                    if (model == null) {
                        promise.reject("INVALID_HANDLE", "No model found for handle $handle", null)
                        return@launch
                    }

                    sendEvent("logging", mapOf(
                        "handle" to handle,
                        "message" to "Generating response with prompt: ${prompt.take(30)}..."
                    ))

                    // Use the synchronous version
                    val response = model.generateResponse(requestId, prompt, imagePath)
                    withContext(Dispatchers.Main) { promise.resolve(response) }
                } catch (e: Exception) {
                    Log.e(TAG, "generateResponse: Inference error: ${e.message}", e)
                    sendEvent("logging", mapOf(
                        "handle" to handle,
                        "message" to "Generation error: ${e.message}"
                    ))
                    withContext(Dispatchers.Main) { promise.reject("GENERATION_FAILED", e.message ?: "Unknown error", e) }
                }
            }
            activeJobs.add(job)
            job.invokeOnCompletion { activeJobs.remove(job) }
        }

        AsyncFunction("generateResponseAsync") { handle: Int, requestId: Int, prompt: String, imagePath: String, promise: Promise ->
            val job = moduleCoroutineScope.launch(Dispatchers.IO) {
                try {
                    val model = modelMap[handle]
                    if (model == null) {
                        withContext(Dispatchers.Main) { promise.reject("INVALID_HANDLE", "No model found for handle $handle", null) }
                        return@launch
                    }

                    sendEvent("logging", mapOf(
                        "handle" to handle,
                        "requestId" to requestId,
                        "message" to "Starting async generation with prompt: ${prompt.take(30)}..."
                    ))

                    // Use the async version with callback and event emission
                    try {
                        model.generateResponseAsync(requestId, prompt, imagePath) { result ->
                            try {
                                if (result.isEmpty()) {
                                    sendEvent("logging", mapOf(
                                        "handle" to handle,
                                        "requestId" to requestId,
                                        "message" to "Generation completed but returned empty result"
                                    ))
                                    promise.reject("GENERATION_FAILED", "Failed to generate response", null)
                                } else {
                                    sendEvent("logging", mapOf(
                                        "handle" to handle,
                                        "requestId" to requestId,
                                        "message" to "Generation completed successfully with ${result.length} characters"
                                    ))

                                    // We don't resolve with the final result here anymore
                                    // The client will assemble the full response from streaming events
                                    promise.resolve(true)  // Just send success signal
                                }
                            } catch (e: Exception) {
                                sendEvent("logging", mapOf(
                                    "handle" to handle,
                                    "requestId" to requestId,
                                    "message" to "Error in async result callback: ${e.message}"
                                ))
                                // Only reject if not already settled
                                promise.reject("GENERATION_ERROR", e.message ?: "Unknown error", e)
                            }
                        }
                    } catch (e: Exception) {
                        sendEvent("logging", mapOf(
                            "handle" to handle,
                            "requestId" to requestId,
                            "message" to "Exception during generateResponseAsync call: ${e.message}"
                        ))
                        promise.reject("GENERATION_ERROR", e.message ?: "Unknown error", e)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "generateResponseAsync initial call error: ${e.message}", e)
                    sendEvent("logging", mapOf(
                        "handle" to handle,
                        "message" to "Outer exception in generateResponseAsync: ${e.message}"
                    ))
                    withContext(Dispatchers.Main) { promise.reject("GENERATION_ERROR", e.message ?: "Unknown error", e) }
                }
            }
            activeJobs.add(job)
            job.invokeOnCompletion { activeJobs.remove(job) }
        }

        // Check if model is downloaded
        AsyncFunction("isModelDownloaded") { modelName: String, promise: Promise ->
            val modelFile = getModelFile(modelName)
            val isDownloaded = modelFile.exists() && modelFile.length() > 0
            Log.d(TAG, "isModelDownloaded: $modelName exists: $isDownloaded, size: ${modelFile.length()}")
            promise.resolve(isDownloaded)
        }

        // Get list of downloaded models
        AsyncFunction("getDownloadedModels") { promise: Promise ->
            val models = getModelDirectory().listFiles()?.filter { it.isFile }?.map { it.name } ?: emptyList()
            Log.d(TAG, "getDownloadedModels: Found ${models.size} models: $models")
            promise.resolve(models)
        }

        // Delete downloaded model
        AsyncFunction("deleteDownloadedModel") { modelName: String, promise: Promise ->
            val modelFile = getModelFile(modelName)
            val result = if (modelFile.exists()) modelFile.delete() else false
            Log.d(TAG, "deleteDownloadedModel: $modelName deleted: $result")
            promise.resolve(result)
        }

        // Download model from URL
        AsyncFunction("downloadModel") { url: String, modelName: String, options: Map<String, Any>?, promise: Promise ->
            val modelFile = getModelFile(modelName)
            val overwrite = (options?.get("overwrite") as? Boolean) ?: false

            // Check if already downloading
            if (activeDownloads.containsKey(modelName)) {
                Log.w(TAG, "downloadModel: Model $modelName is already being downloaded.")
                promise.reject("ERR_ALREADY_DOWNLOADING", "This model is already being downloaded", null)
                return@AsyncFunction
            }

            // Check if already exists
            if (modelFile.exists() && !overwrite) {
                Log.d(TAG, "downloadModel: Model $modelName already exists and overwrite is false. Resolving true.")
                promise.resolve(true)
                return@AsyncFunction
            }

            // Start download in coroutine
            val downloadJob = CoroutineScope(Dispatchers.IO).launch {
                try {
                    Log.d(TAG, "downloadModel: Starting download for $modelName from $url")
                    val connection = URL(url).openConnection() as HttpURLConnection

                    // Add custom headers if provided
                    (options?.get("headers") as? Map<String, Any>)?.let { headers ->
                        headers.forEach { (key, value) ->
                            connection.setRequestProperty(key, value.toString())
                        }
                    }

                    connection.connectTimeout = (options?.get("timeout") as? Number)?.toInt() ?: 30000
                    connection.readTimeout = (options?.get("timeout") as? Number)?.toInt() ?: 30000 // Also set read timeout
                    connection.connect()

                    val contentLength = connection.contentLength.toLong()
                    val input = BufferedInputStream(connection.inputStream)
                    val tempFile = File(modelFile.absolutePath + ".temp")
                    val output = FileOutputStream(tempFile)

                    val buffer = ByteArray(8192)
                    var total: Long = 0
                    var count: Int
                    var lastUpdateTime = System.currentTimeMillis()

                    while (input.read(buffer).also { count = it } != -1) {
                        if (isActive.not()) {
                            Log.d(TAG, "downloadModel: Download for $modelName cancelled during transfer.")
                            output.close()
                            input.close()
                            tempFile.delete() // Clean up temp file
                            sendEvent("downloadProgress", mapOf(
                                "modelName" to modelName,
                                "url" to url,
                                "status" to "cancelled"
                            ))
                            withContext(Dispatchers.Main) { promise.resolve(false) } // Resolve false on cancellation
                            return@launch
                        }

                        total += count
                        output.write(buffer, 0, count)

                        // Send progress updates, throttled to avoid too many events
                        val currentTime = System.currentTimeMillis()
                        if (currentTime - lastUpdateTime > 200 || total == contentLength) { // Every 200ms or on completion
                            lastUpdateTime = currentTime
                            val progress = if (contentLength > 0) total.toDouble() / contentLength.toDouble() else 0.0
                            sendEvent("downloadProgress", mapOf(
                                "modelName" to modelName,
                                "url" to url,
                                "bytesDownloaded" to total,
                                "totalBytes" to contentLength,
                                "progress" to progress,
                                "status" to "downloading"
                            ))
                        }
                    }

                    // Close streams
                    output.flush()
                    output.close()
                    input.close()

                    // Rename temp file to final file
                    if (modelFile.exists()) {
                        modelFile.delete()
                    }
                    tempFile.renameTo(modelFile)

                    Log.d(TAG, "downloadModel: Download for $modelName completed successfully.")
                    sendEvent("downloadProgress", mapOf(
                        "modelName" to modelName,
                        "url" to url,
                        "bytesDownloaded" to modelFile.length(),
                        "totalBytes" to modelFile.length(),
                        "progress" to 1.0,
                        "status" to "completed"
                    ))

                    withContext(Dispatchers.Main) {
                        promise.resolve(true)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "downloadModel: Download failed for $modelName: ${e.message}", e)
                    // Notify error
                    sendEvent("downloadProgress", mapOf(
                        "modelName" to modelName,
                        "url" to url,
                        "status" to "error",
                        "error" to (e.message ?: "Unknown download error")
                    ))
                    withContext(Dispatchers.Main) {
                        promise.reject("DOWNLOAD_FAILED", e.message ?: "Unknown download error", e)
                    }
                } finally {
                    activeDownloads.remove(modelName)
                    Log.d(TAG, "downloadModel: Cleanup for $modelName download.")
                }
            }
            activeDownloads[modelName] = downloadJob
            activeJobs.add(downloadJob)
            downloadJob.invokeOnCompletion { activeJobs.remove(downloadJob) }
        }

        // Cancel download
        AsyncFunction("cancelDownload") { modelName: String, promise: Promise ->
            val job = activeDownloads[modelName]
            if (job != null && job.isActive) {
                job.cancel() // Cancel the coroutine
                activeDownloads.remove(modelName)
                Log.d(TAG, "cancelDownload: Download for $modelName cancelled by request.")
                sendEvent("downloadProgress", mapOf(
                    "modelName" to modelName,
                    "status" to "cancelled"
                ))
                promise.resolve(true)
            } else {
                Log.d(TAG, "cancelDownload: No active download for $modelName to cancel.")
                promise.resolve(false) // No active download to cancel
            }
        }

        // Create model from downloaded file
        AsyncFunction("createModelFromDownloaded") { modelName: String, maxTokens: Int?, topK: Int?, temperature: Double?, randomSeed: Int?, multiModal: Boolean?, promise: Promise ->
            val job = moduleCoroutineScope.launch(Dispatchers.IO) {
                try {
                    val modelFile = getModelFile(modelName)

                    if (!modelFile.exists() || modelFile.length() == 0L) {
                        val errorMsg = "Downloaded model file '$modelName' not found or is empty at ${modelFile.absolutePath}"
                        Log.e(TAG, "createModelFromDownloaded: $errorMsg")
                        sendEvent("logging", mapOf("message" to errorMsg))
                        withContext(Dispatchers.Main) { promise.reject("MODEL_NOT_FOUND", errorMsg, null) }
                        return@launch
                    }

                    val handle = createModelInternal(
                        modelFile.absolutePath,
                        maxTokens ?: 1024,
                        topK ?: 40,
                        temperature ?: 0.7,
                        randomSeed ?: 42,
                        multiModal ?: false
                    )
                    // Explicitly cast to avoid ambiguity
                    promise.resolve(handle as Int)
                } catch (e: Exception) {
                    Log.e(TAG, "createModelFromDownloaded: Failed to load model from downloaded file: ${e.message}", e)
                    sendEvent("logging", mapOf(
                        "message" to "Failed to load model from downloaded file: ${e.message}"
                    ))
                    withContext(Dispatchers.Main) { promise.reject("MODEL_LOAD_FAILED", e.message ?: "Unknown error", e) }
                }
            }
            activeJobs.add(job)
            job.invokeOnCompletion { activeJobs.remove(job) }
        }
    }
}

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
import org.json.JSONArray
import java.io.BufferedInputStream
import java.util.UUID

// import expo.modules.lingopromultimodalmodule.LlmInferenceModel
// import expo.modules.lingopromultimodalmodule.InferenceListener
// import expo.modules.lingopromultimodalmodule.DatabaseHelper

private const val TAG = "LingoproMultimodal" // Changed TAG to match module name
private const val DOWNLOAD_DIRECTORY = "llm_models"

private val moduleCoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
private var activeJobs: MutableList<Job> = mutableListOf()
private var activeModelHandle: Int? = null

class LingoproMultimodalModule : Module() {
    private var nextHandle = 1
    private val modelMap = mutableMapOf<Int, LlmInferenceModel>()

    private val activeDownloads = mutableMapOf<String, Job>()
    private val dbHelper by lazy {
        DatabaseHelper(appContext.reactContext!!)
    }

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
        activeModelHandle = modelHandle
        return modelHandle
    }

    // ---------------------------- HELPER FUNCTIONS -------------------------------------------

    private fun wordToJson(word: Word): JSONObject {
        return JSONObject().apply {
            put("id", word.id)
            put("language", word.language)
            put("word", word.word)
            put("meaning", word.meaning)
            put("writing", word.writing)
            put("wordType", word.wordType)
            put("category1", word.category1)
            put("category2", word.category2)
            put("phonetics", word.phonetics)
            put("tags", JSONArray(word.tags))
        }
    }

    private fun cardToJson(card: SrsCard): JSONObject {
        return JSONObject().apply {
            put("id", card.id)
            put("wordId", card.wordId)
            put("language", card.language)
            put("dueDate", card.dueDate)
            put("interval", card.interval)
            put("repetitions", card.repetitions)
            put("easeFactor", card.easeFactor)
            put("isBuried", card.isBuried)
            put("deckLevel", card.deckLevel)
        }
    }

    // ---------------------------- DATABASE TOOLS ---------------------------------------------
    private fun createToolDefinition(
        name: String,
        description: String,
        properties: JSONObject,
        required: List<String> = emptyList()
    ): JSONObject {
        return JSONObject().apply {
            put("name", name)
            put("description", description)
            put("parameters", JSONObject().apply {
                put("type", "object")
                put("properties", properties)
                put("required", JSONArray(required))
            })
        }
    }

    private val wordProperties = JSONObject().apply {
        put("language", JSONObject().apply { put("type", "string") })
        put("word", JSONObject().apply { put("type", "string") })
        put("meaning", JSONObject().apply { put("type", "string") })
        put("writing", JSONObject().apply { put("type", "string") })
        put("wordType", JSONObject().apply { put("type", "string") })
        put("category1", JSONObject().apply { put("type", "string") })
        put("category2", JSONObject().apply { put("type", "string") })
        put("phonetics", JSONObject().apply { put("type", "string") })
        put("tags", JSONObject().apply {
            put("type", "array")
            put("items", JSONObject().apply { put("type", "string") })
        })
    }

    private val requiredWordFields = listOf(
        "language", "word", "meaning", "writing", "wordType", "category1"
    )
    // Tool definitions (model-friendly format)
    private val availableTools = listOf(
        createToolDefinition(
            name = "insertWord",
            description = "Save a single word to the database",
            properties = wordProperties,
            required = requiredWordFields
        ),
        createToolDefinition(
            name = "getWordsByLanguage",
            description = "Fetch all words for a given language",
            properties = JSONObject().apply {
                put("language", JSONObject().apply { put("type", "string") })
            },
            required = listOf("language")
        ),
        createToolDefinition(
            name = "getNounsByCategory",
            description = "Fetch all nouns by category for a given language",
            properties = JSONObject().apply {
                put("language", JSONObject().apply { put("type", "string") })
                put("category1", JSONObject().apply { put("type", "string") })
            },
            required = listOf("language", "category1")
        ),
    )

    fun summarizeTools(tools: List<JSONObject>): String {
        return tools.mapIndexed { index, tool ->
            val name = tool.optString("name", "unknown")
            val description = tool.optString("description", "No description")
            val requiredArray = tool.optJSONArray("required")
            val required = if (requiredArray != null) {
                (0 until requiredArray.length()).joinToString(", ") { i ->
                    requiredArray.optString(i, "")
                }
            } else {
                "none"
            }
            "${index + 1}. $name - $description. Requires: $required"
        }.joinToString("\n")
    }


    private fun parseToolCalls(response: String): List<JSONObject> {
        return try {
            val jsonRegex = Regex("""\{(?:[^{}]|(?R))*\}""")
            val jsonMatch = jsonRegex.find(response.trim()) ?: return emptyList()
            val json = JSONObject(jsonMatch.value)

            val toolsArray = json.optJSONArray("tools") ?: return emptyList()
            (0 until toolsArray.length()).mapNotNull { i ->
                toolsArray.optJSONObject(i)?.takeIf { it.has("name") && it.has("parameters") }
            }
        } catch (e: Exception) {
            Log.d(TAG, "Failed to parse tool calls: ${e.message}")
            emptyList()
        }
    }


    private fun executeTool(toolCall: JSONObject): JSONObject {
        return try {
            val toolName = toolCall.getString("name")
            val params = toolCall.getJSONObject("parameters")

            when (toolName) {
                "insertWord" -> {
                    JSONObject().apply {
                        put("success", dbHelper.insertWord(
                            language = params.getString("language"),
                            word = params.getString("word"),
                            meaning = params.getString("meaning"),
                            writing = params.getString("writing"),
                            wordType = params.getString("wordType"),
                            category1 = params.getString("category1"),
                            category2 = params.optString("category2"),
                            phonetics = params.optString("phonetics"),
                            tags = params.optJSONArray("tags")?.let { parseTags(it) }
                        ) != -1L)
                    }
                }
                "bulkInsertWords" -> {
                    val wordsArray = params.getJSONArray("words")
                    val words = (0 until wordsArray.length()).map { i ->
                        val wordObj = wordsArray.getJSONObject(i)
                        wordObj.getString("word") to wordObj.getString("meaning")
                    }
                    JSONObject().apply {
                        put("success", dbHelper.bulkInsertCards(
                            words,
                            wordsArray.getJSONObject(0).getString("language"),
                            wordsArray.getJSONObject(0).optString("category1", "general"),
                            "default"
                        ).isNotEmpty())
                    }
                }
                "getWordsByLanguage" -> {
                    JSONObject().apply {
                        put("words", JSONArray(dbHelper.getWordsByLanguage(
                            params.getString("language")
                        )))
                    }
                }
                "getNounsByCategory" -> {
                    JSONObject().apply {
                        put("words", JSONArray(dbHelper.getNounsByCategory(
                            params.getString("language"),
                            params.getString("category1")
                        )))
                    }
                }
                "getWordsBySubcategory" -> {
                    JSONObject().apply {
                        put("words", JSONArray(dbHelper.getWordsBySubcategory(
                            params.getString("language"),
                            params.getString("category2")
                        )))
                    }
                }
                "getWordsByTag" -> {
                    JSONObject().apply {
                        put("words", JSONArray(dbHelper.getWordsByTag(
                            params.getString("language"),
                            params.getString("tag")
                        )))
                    }
                }
                else -> JSONObject().apply {
                    put("error", "Tool not implemented")
                    put("tool", toolName)
                }
            }
        } catch (e: Exception) {
            JSONObject().apply {
                put("error", "Tool execution failed")
                put("message", e.message)
                put("exception", e::class.simpleName)
            }
        }
    }

    private fun parseTags(jsonArray: JSONArray): List<String> {
        return try {
            (0 until jsonArray.length()).mapNotNull { i ->
                try {
                    jsonArray.getString(i)
                } catch (e: Exception) {
                    null // Skip invalid tag entries
                }
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun parseWordsFromResponse(response: String): List<Pair<String, String>> {
        return try {
            JSONArray(response).let { array ->
                (0 until array.length()).map {
                    val item = array.getJSONObject(it)
                    Pair(
                        item.getString("word"),
                        item.getString("meaning")
                    )
                }
            }
        } catch (e: Exception) {
            throw IllegalArgumentException("Failed to parse model response", e)
        }
    }


    override fun definition() = ModuleDefinition {
        Name("LingoproMultimodal") // Corrected native module name to LingoproMultimodal

        Constants(
            "PI" to Math.PI
        )

        // ---------------------------- DATABASE MANAGEMENT ----------------------------------------

        AsyncFunction("initializeDatabase") { promise: Promise ->
            try {
                dbHelper.forceInitializeDatabase()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("DB_INIT_ERROR", e.message, e)
            }
        }

        AsyncFunction("isDatabaseInitialized") { promise: Promise ->
            try {
                promise.resolve(dbHelper.isDatabaseInitialized())
            } catch (e: Exception) {
                promise.reject("DB_CHECK_ERROR", e.message, e)
            }
        }

        // CRUD operations Words

        AsyncFunction("insertWord") { params: Map<String, Any>, promise: Promise ->
            try {
                val id = dbHelper.insertWord(
                    language = params["language"] as String,
                    word = params["word"] as String,
                    meaning = params["meaning"] as String,
                    writing = params["writing"] as? String ?: params["word"] as String,
                    wordType = params["wordType"] as? String ?: "noun",
                    category1 = params["category1"] as String,
                    category2 = params["category2"] as? String,
                    phonetics = params["phonetics"] as? String,
                    tags = (params["tags"] as? List<*>)?.filterIsInstance<String>()
                )
                promise.resolve(id != -1L)
            } catch (e: Exception) {
                promise.reject("DB_INSERT_ERROR", "Failed to insert word", e)
            }
        }

        AsyncFunction("bulkInsertWords") { words: List<Map<String, Any>>, promise: Promise ->
            try {
                val success = dbHelper.bulkInsertCards(
                    words.map { it["word"] as String to it["meaning"] as String },
                    words.firstOrNull()?.get("language") as? String ?: "en",
                    words.firstOrNull()?.get("category1") as? String ?: "general",
                    "default"
                )
                promise.resolve(success.isNotEmpty())
            } catch (e: Exception) {
                promise.reject("DB_BULK_INSERT_ERROR", "Bulk insert failed", e)
            }
        }

        AsyncFunction("getAllWords") { promise: Promise ->
            try {
                promise.resolve(dbHelper.getAllWords().map { wordToJson(it) })
            } catch (e: Exception) {
                promise.reject("DB_QUERY_ERROR", "Failed to get words", e)
            }
        }

        AsyncFunction("getWordsByLanguage") { language: String, promise: Promise ->
            try {
                promise.resolve(dbHelper.getWordsByLanguage(language).map { wordToJson(it) })
            } catch (e: Exception) {
                promise.reject("DB_QUERY_ERROR", "Failed to get words by language", e)
            }
        }

        AsyncFunction("getNounsByCategory") { language: String, category: String, promise: Promise ->
            try {
                promise.resolve(dbHelper.getNounsByCategory(language, category).map { wordToJson(it) })
            } catch (e: Exception) {
                promise.reject("DB_QUERY_ERROR", "Failed to get nouns by category", e)
            }
        }

        AsyncFunction("getWordsBySubcategory") { language: String, category: String, promise: Promise ->
            try {
                promise.resolve(dbHelper.getWordsBySubcategory(language, category).map { wordToJson(it) })
            } catch (e: Exception) {
                promise.reject("DB_QUERY_ERROR", "Failed to get words by subcategory", e)
            }
        }

        AsyncFunction("getWordsByTag") { language: String, tag: String, promise: Promise ->
            try {
                promise.resolve(dbHelper.getWordsByTag(language, tag).map { wordToJson(it) })
            } catch (e: Exception) {
                promise.reject("DB_QUERY_ERROR", "Failed to get words by tag", e)
            }
        }

        // CRUD operations Cards
        AsyncFunction("addToSRS") { wordId: Long, deckLevel: String, promise: Promise ->
            try {
                val card = dbHelper.addToSRS(wordId, "en", deckLevel) // Added default language
                promise.resolve(cardToJson(card))
            } catch (e: Exception) {
                promise.reject("SRS_ERROR", "Failed to add to SRS", e)
            }
        }

        AsyncFunction("getDueCards") { language: String, promise: Promise ->
            try {
                promise.resolve(dbHelper.getDueCards(language).map { cardToJson(it) })
            } catch (e: Exception) {
                promise.reject("SRS_ERROR", "Failed to get due cards", e)
            }
        }

        AsyncFunction("logReview") { cardId: Long, quality: Int, promise: Promise ->
            try {
                if (quality !in 0..5) throw IllegalArgumentException("Quality must be 0-5")
                val updatedCard = dbHelper.logReview(cardId, quality)
                promise.resolve(cardToJson(updatedCard))
            } catch (e: Exception) {
                promise.reject("REVIEW_ERROR", "Failed to log review", e)
            }
        }



        // ---------------------------- DATABASE MANAGEMENT END ------------------------------------




        AsyncFunction("generateTopicCards") { handle: Int, requestId: Int, params: Map<String, Any>, promise: Promise ->
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val topic = params["topic"] as String
                    val language = params["language"] as String
                    val count = (params["count"] as? Number)?.toInt() ?: 5
                    val deckLevel = params["deckLevel"] as? String ?: "default"

                    if (count !in 1..20) throw IllegalArgumentException("Count must be 1-20")

                    val model = modelMap[handle] ?: run {
                        Log.e(TAG, "Model not found for handle $handle")
                        promise.reject("INVALID_HANDLE", "Model not found", null)
                        return@launch
                    }

                    val prompt = """
                    Generate $count basic $language vocabulary words about $topic.
                    For each word, provide its translation and a short example sentence.
                    Return as JSON: {
                        "words": [
                            {
                                "word": "...",
                                "meaning": "...",
                                "example": "..."
                            }
                        ]
                    }
                """.trimIndent()

                    val response =
                        model.generateResponse(requestId, prompt, "") // Blocking call for simplicity
                    val jsonResponse = JSONObject(response)
                    val wordsArray = jsonResponse.getJSONArray("words")

                    val words = mutableListOf<Pair<String, String>>()
                    val examples = mutableListOf<String>()

                    for (i in 0 until wordsArray.length()) {
                        val item = wordsArray.getJSONObject(i)
                        words.add(item.getString("word") to item.getString("meaning"))
                        examples.add(item.getString("example"))
                    }

                    val cards = dbHelper.bulkInsertCards(words, language, topic, deckLevel)
                    val (content, translation) = dbHelper.generateContextualContent(
                        words.map { it.first },
                        language,
                        topic
                    )

                    promise.resolve(JSONObject().apply {
                        put("cards", JSONArray(cards.map { cardToJson(it) }))
                        put("content", content)
                        put("translation", translation)
                        put("examples", JSONArray(examples))
                    })

                } catch (e: Exception) {
                    promise.reject("CARD_GEN_ERROR", "Failed to generate topic cards", e)
                }
            }
        }


        AsyncFunction("getRecommendedTopics") { handle: Int, requestId: Int, language: String, count: Int, promise: Promise ->
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    // 1. First try to get from database
                    val dbTopics = try {
                        dbHelper.getRecommendedTopics(language).also {
                            Log.d(TAG, "📦 Fetched ${it.size} topics from DB: $it")
                        }
                    } catch (e: Exception) {
                        Log.d(TAG, "❌ Error fetching topics from DB", e)
                        emptyList()
                    }

                    val finalTopics = if (dbTopics.size >= count) {
                        dbTopics.take(count)
                    } else {
                        val prompt = """
                    Suggest $count common vocabulary topics for learning $language.
                    Return ONLY a JSON array like: ["family","food"].
                    Exclude any explanations or additional text.
                """.trimIndent()

                        val model = modelMap[handle] ?: run {
                            Log.e(TAG, "Model not found for handle $handle")
                            promise.reject("INVALID_HANDLE", "Model not found", null)
                            return@launch
                        }

                        Log.d(TAG, "🧠 Prompting model with: $prompt")
                        val response = try {
                            model.generateResponse(requestId, prompt, "").also {
                                Log.d(TAG, "✅ Model response: $it")
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "❌ Error during LLM response", e)
                            ""
                        }

                        val llmTopics = try {
                            JSONArray(response).let { array ->
                                (0 until array.length()).map { array.getString(it) }
                            }.also {
                                Log.d(TAG, "🧠 Parsed topics from LLM: $it")
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "❌ Failed to parse model response", e)
                            emptyList()
                        }

                        (dbTopics + llmTopics).distinct().take(count)
                    }

                    val result = finalTopics.ifEmpty {
                        listOf("basics", "greetings", "food", "travel", "numbers").also {
                            Log.w(TAG, "⚠️ Using fallback topics: $it")
                        }
                    }

                    Log.d(TAG, "✅ Final recommended topics: $result")
                    promise.resolve(JSONArray(result))
                } catch (e: Exception) {
                    Log.e(TAG, "🔥 Failed to get recommended topics", e)
                    promise.reject("TOPIC_ERROR", "Failed to get recommended topics", e)
                }
            }
        }

        AsyncFunction("getTopicPreview") { topic: String, language: String, promise: Promise ->
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val words = dbHelper.getNounsByCategory(language, topic).take(5)
                    val wordCount = dbHelper.getWordCountByCategory(language, topic)

                    promise.resolve(JSONObject().apply {
                        put("topic", topic)
                        put("wordCount", wordCount)
                        put("exampleWords", JSONArray(words.map { it.word }))
                        put("totalWords", wordCount)
                    })
                } catch (e: Exception) {
                    promise.reject("TOPIC_ERROR", "Failed to get topic preview", e)
                }
            }
        }


        // ---------------------------- DATABASE TOOLS END -----------------------------------------

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

        AsyncFunction("generateResponse") { handle: Int, requestId: Int, prompt: String, imagePath: String, useTools: Boolean,  promise: Promise ->
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

                    // Agentic implementation
                    // Step 1: Use the synchronous version
                    if (!useTools) {
                        Log.d(TAG, "Processing without tools")
                        val systemMessage = "If the user asks to add anything to SRS flashcards, guide them to activate tools mode first."
                        val modifiedPrompt = "When discussing SRS flashcards, please remind users they need to be in tools mode. Now, regarding your question: $prompt"

                        val response = model.generateResponse(requestId, modifiedPrompt, imagePath)
                        Log.d(TAG, "Resposne ${response}")
                        withContext(Dispatchers.Main) { promise.resolve(response) }
                    }
                    else {

                        Log.d(TAG, "Processing with tools enabled")
                        val toolsPrompt = """
                            You are a language learning assistant with access to specific tools. 
                            Carefully analyze the user's request and determine if tool usage is required.
                        
                            # Available Tools:
                            ${summarizeTools(availableTools).trimIndent()}
                        
                            # Response Format:
                            - If tools are needed, respond ONLY with valid JSON format:
                              ```json
                              {"tools": ["tool_name", ...]}
                              ```
                            - If no tools are needed, respond naturally to the user's query without any JSON.
                        
                            # Current Query:
                            $prompt
                        """.trimIndent()
                        val rawResponse = model.generateResponse(requestId, toolsPrompt, imagePath)

                        // Step 2: Parse tool calls (simplified example)
                        val toolCalls = parseToolCalls(rawResponse)
                        Log.d(TAG, "Parsed tool calls: ${toolCalls.size}")

                        if (toolCalls.isEmpty()) {
                            // No tools needed; return raw response
                            Log.d(TAG, "No tools needed, returning raw response")
                            withContext(Dispatchers.Main) {
                                promise.resolve(rawResponse)
                            }
                        } else {
                            // Step 3: Execute tools sequentially
                            val toolResults = mutableListOf<JSONObject>()
                            for (call in toolCalls.take(3)) {
                                val result = executeTool(call)
                                toolResults.add(result)
                            }

                            // Step 4: Send results back to the model for final response
                            val finalResponse = model.generateResponse(
                                requestId,
                                "Tool results: ${toolResults.joinToString()}",
                                imagePath
                            )
                            withContext(Dispatchers.Main) { promise.resolve(finalResponse) }
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "generateResponse: Inference error: ${e.message}", e)
                    sendEvent("logging", mapOf(
                        "handle" to handle,
                        "message" to "Generation error: ${e.message}"
                    ))
                    withContext(Dispatchers.Main) { promise.reject("GENERATION_FAILED", e.message ?: "Unknown error", e) }
                }
            }
            job.invokeOnCompletion { exception ->
                synchronized(activeJobs) {
                    activeJobs.remove(job)
                }
                if (exception is CancellationException) {
                    promise.reject("CANCELLED", "Operation cancelled", exception)
                }
            }

            synchronized(activeJobs) {
                activeJobs.add(job)
            }
        }

        AsyncFunction("generateResponseAsync") { handle: Int, requestId: Int, prompt: String, imagePath: String, useTools: Boolean, promise: Promise ->
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
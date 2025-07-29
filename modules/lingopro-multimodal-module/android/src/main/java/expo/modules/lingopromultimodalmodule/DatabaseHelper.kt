package expo.modules.lingopromultimodalmodule

// Core Android and Database
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

// Date/Time Handling
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

// JSON Handling
import org.json.JSONArray
import org.json.JSONObject

// Logging
import android.util.Log

// Kotlin Math
import kotlin.math.max
import kotlin.math.roundToInt

data class Word(
    val id: Long,
    val language: String,
    val word: String,
    val meaning: String,
    val writing: String,
    val wordType: String,
    val category1: String,
    val category2: String?,
    val phonetics: String?,
    val tags: List<String>
)

data class SrsCard(
    val id: Long,
    val wordId: Long,
    val language: String,
    val dueDate: String,
    val interval: Int,
    val repetitions: Int,
    val easeFactor: Float,
    val isBuried: Boolean,
    val deckLevel: String
)

data class SrsReview(
    val id: Long,
    val cardId: Long,
    val reviewDate: String,
    val quality: Int            // 0-5 (user's self-rated recall)
)

class DatabaseHelper(context: Context) : SQLiteOpenHelper(
    context,
    DATABASE_NAME,
    null,
    DATABASE_VERSION
) {
    companion object {
        private const val DATABASE_NAME = "LangLearning.db"
        private const val DATABASE_VERSION = 1
        private const val INITIAL_INTERVAL = 1

        private fun Calendar.toIso8601(): String {
            return SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).format(this.time)
        }

        private fun String.toCalendar(): Calendar {
            val calendar = Calendar.getInstance()
            calendar.time = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).parse(this)!!
            return calendar
        }

        // Table: Saved Words
        const val TABLE_WORDS = "words"
        const val COLUMN_ID = "id"
        const val COLUMN_LANGUAGE = "language"
        const val COLUMN_WORD = "word"
        const val COLUMN_MEANING = "meaning"
        const val COLUMN_PHONETICS = "phonetics"
        const val COLUMN_WRITING = "writing"
        const val COLUMN_TIMESTAMP = "timestamp"
        const val COLUMN_WORD_TYPE = "word_type"
        const val COLUMN_CATEGORY_1 = "category_1"
        const val COLUMN_CATEGORY_2 = "category_2"
        const val COLUMN_TAGS = "tags"

        // Table: SRS Cards
        const val TABLE_SRS_CARDS = "srs_cards"
        const val COLUMN_CARD_ID = "card_id"
        const val COLUMN_WORD_ID = "word_id"
        const val COLUMN_DUE_DATE = "due_date"
        const val COLUMN_INTERVAL = "interval"  // Days until next review
        const val COLUMN_REPETITIONS = "repetitions"
        const val COLUMN_EASE_FACTOR = "ease_factor" // SM-2 algorithm
        const val COLUMN_IS_BURIED = "is_buried"
        const val COLUMN_DECK_LEVEL = "deck_level" // B1, N5

        // Table: SRS Reviews
        const val TABLE_SRS_REVIEWS = "srs_reviews"
        const val COLUMN_REVIEW_ID = "review_id"
        const val COLUMN_REVIEW_DATE = "review_date"
        const val COLUMN_QUALITY = "quality"

        private val CREATE_WORDS_TABLE = """
            CREATE TABLE $TABLE_WORDS (
                $COLUMN_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                $COLUMN_LANGUAGE TEXT NOT NULL,
                $COLUMN_WORD TEXT NOT NULL,
                $COLUMN_MEANING TEXT NOT NULL,
                $COLUMN_PHONETICS TEXT,
                $COLUMN_WRITING TEXT NOT NULL,
                $COLUMN_WORD_TYPE TEXT NOT NULL,       -- "noun", "verb", "adjective"
                $COLUMN_CATEGORY_1 TEXT NOT NULL,      -- Broad category (e.g., "town")
                $COLUMN_CATEGORY_2 TEXT,               -- Optional subcategory (e.g., "office")
                $COLUMN_TAGS TEXT,
                $COLUMN_TIMESTAMP DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """.trimIndent()

        private val CREATE_SRS_CARDS_TABLE = """
            CREATE TABLE $TABLE_SRS_CARDS (
                $COLUMN_CARD_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                $COLUMN_WORD_ID INTEGER NOT NULL,
                $COLUMN_LANGUAGE TEXT NOT NULL,
                $COLUMN_DUE_DATE DATETIME NOT NULL,
                $COLUMN_INTERVAL INTEGER NOT NULL,
                $COLUMN_REPETITIONS INTEGER DEFAULT 0,
                $COLUMN_EASE_FACTOR REAL DEFAULT 2.5,
                $COLUMN_IS_BURIED BOOLEAN DEFAULT FALSE,
                $COLUMN_DECK_LEVEL TEXT NOT NULL,
                FOREIGN KEY ($COLUMN_WORD_ID) REFERENCES $TABLE_WORDS($COLUMN_ID)
            )
        """.trimIndent()

        private val CREATE_SRS_REVIEW_TABLE = """
            CREATE TABLE $TABLE_SRS_REVIEWS (
                $COLUMN_REVIEW_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                $COLUMN_CARD_ID INTEGER NOT NULL,
                $COLUMN_REVIEW_DATE DATETIME DEFAULT CURRENT_TIMESTAMP,
                $COLUMN_QUALITY INTEGER NOT NULL,
                FOREIGN KEY ($COLUMN_CARD_ID) REFERENCES $TABLE_SRS_CARDS($COLUMN_CARD_ID)
            )
        """.trimIndent()
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(CREATE_WORDS_TABLE)
        db.execSQL(CREATE_SRS_CARDS_TABLE)
        db.execSQL(CREATE_SRS_REVIEW_TABLE)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS $TABLE_SRS_REVIEWS")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_SRS_CARDS")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_WORDS")
        onCreate(db)
    }

    fun isDatabaseInitialized(): Boolean {
        val db = readableDatabase
        val cursor = db.rawQuery(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='$TABLE_WORDS'",
            null
        )
        return cursor.use {
            it.count > 0
        }
    }

    // Recreate the database if corrupted
    fun forceInitializeDatabase() {
        val db = writableDatabase
        db.execSQL("DROP TABLE IF EXISTS $TABLE_SRS_REVIEWS")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_SRS_CARDS")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_WORDS")
        onCreate(db)
    }

    // --- CRUD Words Operations ---
    fun insertWord(
        language: String,
        word: String,
        meaning: String,
        writing: String,
        wordType: String,
        category1: String,
        category2: String? = null,
        phonetics: String? = null,
        tags: List<String>? = null
    ): Long {
        val values = ContentValues().apply {
            put(COLUMN_LANGUAGE, language)
            put(COLUMN_WORD, word)
            put(COLUMN_MEANING, meaning)
            put(COLUMN_WRITING, writing)
            put(COLUMN_WORD_TYPE, wordType)
            put(COLUMN_CATEGORY_1, category1)
            if (category2 != null) put(COLUMN_CATEGORY_2, category2)
            if (phonetics != null) put(COLUMN_PHONETICS, phonetics)
            if (tags != null) put(COLUMN_TAGS, JSONArray(tags).toString())
        }
        return writableDatabase.insert(TABLE_WORDS, null, values)
    }

    fun bulkInsertCards(words: List<Pair<String, String>>, language: String, topic: String, deckLevel: String): List<SrsCard> {
        return words.mapNotNull { (word, meaning) ->
            val wordId = insertWord(
                language = language,
                word = word,
                meaning = meaning,
                writing = word,
                wordType = "noun",
                category1 = topic,
                tags = listOf("generated", topic)
            )

            if (wordId != -1L) {
                addToSRS(wordId, language, deckLevel).also { card ->
                    Log.d("SRS", "Created card ${card.id} for word $word")
                }
            } else {
                null
            }
        }
    }

    fun generateContextualContent(words: List<String>, language: String, topic: String): Pair<String, String> {
        // This would call your LLM to generate content
        return Pair(
            "$topic dialogue:\n${words.joinToString(", ")}", // Generated story/dialogue
            "Translation:\n${words.joinToString(", ")}" // Translation
        )
    }

    private fun parseCursorToWords(cursor: Cursor): List<Word> {
        val words = mutableListOf<Word>()
        cursor.use {
            val idIndex = it.getColumnIndexOrThrow(COLUMN_ID)
            val languageIndex = it.getColumnIndexOrThrow(COLUMN_LANGUAGE)
            val wordIndex = it.getColumnIndexOrThrow(COLUMN_WORD)
            val meaningIndex = it.getColumnIndexOrThrow(COLUMN_MEANING)
            val writingIndex = it.getColumnIndexOrThrow(COLUMN_WRITING)
            val wordTypeIndex = it.getColumnIndexOrThrow(COLUMN_WORD_TYPE)
            val category1Index = it.getColumnIndexOrThrow(COLUMN_CATEGORY_1)
            val category2Index = it.getColumnIndex(COLUMN_CATEGORY_2)
            val phoneticsIndex = it.getColumnIndex(COLUMN_PHONETICS)
            val tagsIndex = it.getColumnIndex(COLUMN_TAGS)

            while (it.moveToNext()) {
                val tags = try {
                    if (!it.isNull(tagsIndex)) {
                        JSONArray(it.getString(tagsIndex)).let { tagsArray ->
                            (0 until tagsArray.length()).map { i -> tagsArray.getString(i) }
                        }
                    } else {
                        emptyList()
                    }
                } catch (e: Exception) {
                    emptyList()
                }

                words.add(Word(
                    id = it.getLong(idIndex),
                    language = it.getString(languageIndex),
                    word = it.getString(wordIndex),
                    meaning = it.getString(meaningIndex),
                    writing = it.getString(writingIndex),
                    wordType = it.getString(wordTypeIndex),
                    category1 = it.getString(category1Index),
                    category2 = if (!it.isNull(category2Index)) it.getString(category2Index) else null,
                    phonetics = if (!it.isNull(phoneticsIndex)) it.getString(phoneticsIndex) else null,
                    tags = tags
                ))
            }
        }
        return words
    }

    fun getAllWords(): List<Word> {
        val cursor = readableDatabase.query(
            TABLE_WORDS,
            null,
            null, null, null, null, COLUMN_TIMESTAMP
        )
        return parseCursorToWords(cursor)
    }

    fun getWordsByLanguage(language: String): List<Word> {
        val cursor = readableDatabase.query(
            TABLE_WORDS,
            null,
            "$COLUMN_LANGUAGE = ?",
            arrayOf(language),
            null, null, COLUMN_TIMESTAMP
        )
        return parseCursorToWords(cursor)
    }

    fun getNounsByCategory(language: String, category1: String): List<Word> {
        val cursor = readableDatabase.query(
            TABLE_WORDS,
            null,
            "$COLUMN_LANGUAGE = ? AND $COLUMN_WORD_TYPE = ? AND $COLUMN_CATEGORY_1 = ?",
            arrayOf(language, "noun", category1),
            null, null, COLUMN_TIMESTAMP
        )
        return parseCursorToWords(cursor)
    }

    fun getWordsBySubcategory(language: String, category2: String): List<Word> {
        val cursor = readableDatabase.query(
            TABLE_WORDS,
            null,
            "$COLUMN_LANGUAGE = ? AND $COLUMN_CATEGORY_2 = ?",
            arrayOf(language, category2),
            null, null, null
        )
        return parseCursorToWords(cursor)
    }

    fun getWordsByTag(language: String, tag: String): List<Word> {
        val cursor = readableDatabase.rawQuery("""
            SELECT * FROM $TABLE_WORDS 
            WHERE $COLUMN_LANGUAGE = ? 
            AND $COLUMN_TAGS LIKE ?
            ORDER BY $COLUMN_TIMESTAMP DESC
        """, arrayOf(language, "%\"$tag\"%"))

        return parseCursorToWords(cursor)
    }

    fun updateWord(
        id: Long,
        newMeaning: String? = null,
        newPhonetics: String? = null,
        newTags: List<String>? = null
    ): Boolean {
        val values = ContentValues().apply {
            if (newMeaning != null) put(COLUMN_MEANING, newMeaning)
            if (newPhonetics != null) put(COLUMN_PHONETICS, newPhonetics)
            if (newTags != null) put(COLUMN_TAGS, JSONArray(newTags).toString())
        }

        return writableDatabase.update(
            TABLE_WORDS,
            values,
            "$COLUMN_ID = ?",
            arrayOf(id.toString())
        ) > 0
    }

    fun deleteWord(id: Long): Boolean {
        return writableDatabase.delete(
            TABLE_WORDS,
            "$COLUMN_ID = ?",
            arrayOf(id.toString())
        ) > 0
    }

    // --- CRUD SRS Cards Operations ---
    private fun parseCursorToSrsCards(cursor: Cursor): List<SrsCard> {
        val cards = mutableListOf<SrsCard>()
        cursor.use {
            val cardIdIndex = it.getColumnIndexOrThrow(COLUMN_CARD_ID)
            val wordIdIndex = it.getColumnIndexOrThrow(COLUMN_WORD_ID)
            val languageIndex = it.getColumnIndexOrThrow(COLUMN_LANGUAGE)
            val dueDateIndex = it.getColumnIndexOrThrow(COLUMN_DUE_DATE)
            val intervalIndex = it.getColumnIndexOrThrow(COLUMN_INTERVAL)
            val repetitionsIndex = it.getColumnIndexOrThrow(COLUMN_REPETITIONS)
            val easeFactorIndex = it.getColumnIndexOrThrow(COLUMN_EASE_FACTOR)
            val isBuriedIndex = it.getColumnIndexOrThrow(COLUMN_IS_BURIED)
            val deckLevelIndex = it.getColumnIndexOrThrow(COLUMN_DECK_LEVEL)

            while (it.moveToNext()) {
                cards.add(SrsCard(
                    id = it.getLong(cardIdIndex),
                    wordId = it.getLong(wordIdIndex),
                    language = it.getString(languageIndex),
                    dueDate = it.getString(dueDateIndex),
                    interval = it.getInt(intervalIndex),
                    repetitions = it.getInt(repetitionsIndex),
                    easeFactor = it.getFloat(easeFactorIndex),
                    isBuried = it.getInt(isBuriedIndex) == 1,
                    deckLevel = it.getString(deckLevelIndex)
                ))
            }
        }
        return cards
    }

    private fun calculateDueDate(intervalDays: Int): String {
        val calendar = Calendar.getInstance()
        calendar.add(Calendar.DAY_OF_YEAR, intervalDays)
        return calendar.toIso8601()
    }

    fun addToSRS(wordId: Long, language: String, deckLevel: String): SrsCard {
        val calendar = Calendar.getInstance().apply {
            add(Calendar.DAY_OF_YEAR, 1)
        }

        val values = ContentValues().apply {
            put(COLUMN_WORD_ID, wordId)
            put(COLUMN_LANGUAGE, language)
            put(COLUMN_DUE_DATE, calendar.toIso8601())
            put(COLUMN_INTERVAL, INITIAL_INTERVAL)
            put(COLUMN_EASE_FACTOR, 2.5f) // Default ease factor (SM-2)
            put(COLUMN_DECK_LEVEL, deckLevel)
        }

        val cardId = writableDatabase.insert(TABLE_SRS_CARDS, null, values)
        if (cardId == -1L) throw IllegalStateException("Failed to create SRS card")

        return getCard(cardId) ?: throw IllegalStateException("Failed to fetch created card")
    }

    fun getCard(cardId: Long): SrsCard? {
        val cursor = readableDatabase.query(
            TABLE_SRS_CARDS,
            null,
            "$COLUMN_CARD_ID = ?",
            arrayOf(cardId.toString()),
            null, null, null
        )

        return cursor.use {
            if (it.moveToFirst()) {
                SrsCard(
                    id = it.getLong(it.getColumnIndexOrThrow(COLUMN_CARD_ID)),
                    wordId = it.getLong(it.getColumnIndexOrThrow(COLUMN_WORD_ID)),
                    language = it.getString(it.getColumnIndexOrThrow(COLUMN_LANGUAGE)),
                    dueDate = it.getString(it.getColumnIndexOrThrow(COLUMN_DUE_DATE)),
                    interval = it.getInt(it.getColumnIndexOrThrow(COLUMN_INTERVAL)),
                    repetitions = it.getInt(it.getColumnIndexOrThrow(COLUMN_REPETITIONS)),
                    easeFactor = it.getFloat(it.getColumnIndexOrThrow(COLUMN_EASE_FACTOR)),
                    isBuried = it.getInt(it.getColumnIndexOrThrow(COLUMN_IS_BURIED)) == 1,
                    deckLevel = it.getString(it.getColumnIndexOrThrow(COLUMN_DECK_LEVEL))
                )
            } else {
                null
            }
        }
    }

    private fun calculateSM2Update(
        currentInterval: Int,
        currentEase: Float,
        quality: Int
    ): Pair<Int, Float> {
        return when {
            quality < 3 -> {
                // Failed review: reset interval but keep ease
                Pair(1, max(1.3f, currentEase - 0.15f))
            }
            else -> {
                // Successful review: increase interval
                val newEase = max(1.3f, currentEase)
                val newInterval = when (currentInterval) {
                    1 -> 1
                    2 -> 6
                    else -> (currentInterval * newEase).roundToInt()
                }
                Pair(newInterval, newEase)
            }
        }
    }

    fun logReview(cardId: Long, quality: Int): SrsCard {
        val db = writableDatabase
        db.beginTransaction()
        try {
            // 1. Record the review
            val reviewValues = ContentValues().apply {
                put(COLUMN_CARD_ID, cardId)
                put(COLUMN_QUALITY, quality)
            }
            db.insert(TABLE_SRS_REVIEWS, null, reviewValues)

            // 2. Update card's SRS schedule (SM-2 algorithm)
            val card = getCard(cardId) ?: throw IllegalStateException("Card not found")
            val (newInterval, newEase) = calculateSM2Update(
                card.interval,
                card.easeFactor,
                quality
            )

            val updateValues = ContentValues().apply {
                put(COLUMN_DUE_DATE, calculateDueDate(newInterval))
                put(COLUMN_INTERVAL, newInterval)
                put(COLUMN_EASE_FACTOR, newEase)
                put(COLUMN_REPETITIONS, card.repetitions + 1)
            }

            db.update(
                TABLE_SRS_CARDS,
                updateValues,
                "$COLUMN_CARD_ID = ?",
                arrayOf(cardId.toString())
            )

            db.setTransactionSuccessful()
            return getCard(cardId) ?: throw IllegalStateException("Failed to fetch updated card")
        } finally {
            db.endTransaction()
        }
    }

    fun getDueCards(language: String, limit: Int = 20): List<SrsCard> {
        val query = """
            SELECT $TABLE_SRS_CARDS.* 
            FROM $TABLE_SRS_CARDS
            JOIN $TABLE_WORDS ON $TABLE_SRS_CARDS.$COLUMN_WORD_ID = $TABLE_WORDS.$COLUMN_ID
            WHERE $TABLE_SRS_CARDS.$COLUMN_DUE_DATE <= datetime('now')
            AND $TABLE_WORDS.$COLUMN_LANGUAGE = ?
            LIMIT ?
        """.trimIndent()

        val cursor = readableDatabase.rawQuery(query, arrayOf(language, limit.toString()))
        return parseCursorToSrsCards(cursor)
    }

    // ----------------------------- For Learning Module ------------------------------------------
    fun getWordCountByCategory(language: String, category: String): Int {
        val query = """
            SELECT COUNT(*) 
            FROM $TABLE_WORDS 
            WHERE $COLUMN_LANGUAGE = ? 
            AND $COLUMN_CATEGORY_1 = ?
        """.trimIndent()

        return readableDatabase.rawQuery(query, arrayOf(language, category)).use { cursor ->
            if (cursor.moveToFirst()) cursor.getInt(0) else 0
        }
    }

    fun getPopularCategories(limit: Int = 5): List<String> {
        val query = """
            SELECT $COLUMN_CATEGORY_1, COUNT(*) as count 
            FROM $TABLE_WORDS 
            GROUP BY $COLUMN_CATEGORY_1 
            ORDER BY count DESC 
            LIMIT ?
        """.trimIndent()

        return readableDatabase.rawQuery(query, arrayOf(limit.toString())).use { cursor ->
            mutableListOf<String>().apply {
                while (cursor.moveToNext()) {
                    add(cursor.getString(0))
                }
            }
        }
    }

    fun getRecommendedTopics(language: String): List<String> {
        val query = """
            SELECT $COLUMN_CATEGORY_1 
            FROM $TABLE_WORDS 
            WHERE $COLUMN_LANGUAGE = ? 
            AND $COLUMN_TIMESTAMP >= date('now', '-30 days')
            GROUP BY $COLUMN_CATEGORY_1 
            ORDER BY COUNT(*) DESC 
            LIMIT 3
        """.trimIndent()

        return readableDatabase.rawQuery(query, arrayOf(language)).use { cursor ->
            mutableListOf<String>().apply {
                while (cursor.moveToNext()) {
                    add(cursor.getString(0))
                }
            }
        }
    }

    fun getWeakCategories(language: String): List<String> {
        val query = """
            SELECT w.$COLUMN_CATEGORY_1
            FROM $TABLE_SRS_REVIEWS r
            JOIN $TABLE_SRS_CARDS c ON r.$COLUMN_CARD_ID = c.$COLUMN_CARD_ID
            JOIN $TABLE_WORDS w ON c.$COLUMN_WORD_ID = w.$COLUMN_ID
            WHERE r.$COLUMN_QUALITY < 3
            AND w.$COLUMN_LANGUAGE = ?
            GROUP BY w.$COLUMN_CATEGORY_1
            ORDER BY COUNT(*) DESC
            LIMIT 3
        """.trimIndent()

        return readableDatabase.rawQuery(query, arrayOf(language)).use { cursor ->
            mutableListOf<String>().apply {
                while (cursor.moveToNext()) {
                    add(cursor.getString(0))
                }
            }
        }
    }

    fun getExistingTopics(language: String, limit: Int = 5): List<String> {
        val query = """
            SELECT $COLUMN_CATEGORY_1, COUNT(*) as count
            FROM $TABLE_WORDS
            WHERE $COLUMN_LANGUAGE = ?
            GROUP BY $COLUMN_CATEGORY_1
            ORDER BY count DESC
            LIMIT ?
        """.trimIndent()

        return readableDatabase.rawQuery(query, arrayOf(language, limit.toString())).use { cursor ->
            mutableListOf<String>().apply {
                while (cursor.moveToNext()) {
                    add(cursor.getString(0))
                }
            }
        }
    }
}
package expo.modules.lingopromultimodalmodule

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteException
import android.database.sqlite.SQLiteOpenHelper
import android.util.Log
import org.json.JSONArray
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToInt
import android.database.DatabaseUtils
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.CancellationException

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
    val dueDate: String, // Stored as ISO 8601 string
    val interval: Int,
    val repetitions: Int,
    val easeFactor: Float,
    val isBuried: Boolean,
    val deckLevel: String
)

data class DueCardWithWord(
    val card: SrsCard,
    val word: Word
)

data class SrsReview(
    val id: Long,
    val cardId: Long,
    val reviewDate: String,
    val quality: Int
)

data class ReviewStat(
    val date: String,
    val count: Int,
    val avgEase: Double,
    val avgInterval: Double
)

class DatabaseHelper private constructor(context: Context) : SQLiteOpenHelper(
    context.applicationContext,
    DATABASE_NAME,
    null,
    DATABASE_VERSION
) {
    companion object {
        private const val TAG = "DatabaseHelper"
        private const val DATABASE_NAME = "LangLearning.db"
        private const val DATABASE_VERSION = 2
        private const val INITIAL_INTERVAL = 0

        @Volatile
        private var instance: DatabaseHelper? = null

        fun getInstance(context: Context): DatabaseHelper {
            return instance ?: synchronized(this) {
                instance ?: DatabaseHelper(context).also { instance = it }
            }
        }

        // Date utilities
        private fun Calendar.toIso8601(): String {
            return SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).format(this.time)
        }

        // Extension function for String to Calendar, which is now null-safe
        private fun String.toCalendarOrNull(): Calendar? {
            return try {
                val calendar = Calendar.getInstance()
                calendar.time = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).parse(this)!!
                calendar
            } catch (e: Exception) {
                Log.e(TAG, "Failed to parse date string: $this", e)
                null
            }
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
        const val COLUMN_INTERVAL = "interval"
        const val COLUMN_REPETITIONS = "repetitions"
        const val COLUMN_EASE_FACTOR = "ease_factor"
        const val COLUMN_IS_BURIED = "is_buried"
        const val COLUMN_DECK_LEVEL = "deck_level"

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
                $COLUMN_WORD_TYPE TEXT NOT NULL,
                $COLUMN_CATEGORY_1 TEXT NOT NULL,
                $COLUMN_CATEGORY_2 TEXT,
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
                $COLUMN_IS_BURIED INTEGER DEFAULT 0,
                $COLUMN_DECK_LEVEL TEXT NOT NULL,
                FOREIGN KEY ($COLUMN_WORD_ID) REFERENCES $TABLE_WORDS($COLUMN_ID) ON DELETE CASCADE
            )
        """.trimIndent()

        private val CREATE_SRS_REVIEW_TABLE = """
            CREATE TABLE $TABLE_SRS_REVIEWS (
                $COLUMN_REVIEW_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                $COLUMN_CARD_ID INTEGER NOT NULL,
                $COLUMN_REVIEW_DATE DATETIME DEFAULT CURRENT_TIMESTAMP,
                $COLUMN_QUALITY INTEGER NOT NULL,
                FOREIGN KEY ($COLUMN_CARD_ID) REFERENCES $TABLE_SRS_CARDS($COLUMN_CARD_ID) ON DELETE CASCADE
            )
        """.trimIndent()

    }

    @Synchronized
    fun safeInitialize(): Boolean {
        return try {
            readableDatabase.close() // Close immediately after check
            true
        } catch (e: Exception) {
            Log.e(TAG, "Database initialization check failed", e)
            false
        }
    }

    @Synchronized
    fun isDatabaseValid(): Boolean {
        return try {
            readableDatabase.let { db ->
                val requiredTables = arrayOf(TABLE_WORDS, TABLE_SRS_CARDS, TABLE_SRS_REVIEWS)
                val allTablesExist = requiredTables.all { table ->
                    db.rawQuery(
                        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                        arrayOf(table)
                    ).use { it.count > 0 }
                }
                allTablesExist && db.version == DATABASE_VERSION
            }
        } catch (e: Exception) {
            false
        } finally {
            readableDatabase.close() // Ensure it's closed
        }
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(CREATE_WORDS_TABLE)
        db.execSQL(CREATE_SRS_CARDS_TABLE)
        db.execSQL(CREATE_SRS_REVIEW_TABLE)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        Log.w(TAG, "Upgrading database from version $oldVersion to $newVersion, all data will be lost.")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_SRS_REVIEWS")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_SRS_CARDS")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_WORDS")
        onCreate(db)
    }

    override fun onConfigure(db: SQLiteDatabase) {
        super.onConfigure(db)
        db.setForeignKeyConstraintsEnabled(true)
    }

    @Synchronized
    fun forceInitializeDatabase(): Boolean = try {
        writableDatabase.let { db ->
            db.beginTransaction()
            try {
                // Drop all tables
                listOf(TABLE_SRS_REVIEWS, TABLE_SRS_CARDS, TABLE_WORDS).forEach { table ->
                    db.execSQL("DROP TABLE IF EXISTS $table")
                }

                // Recreate schema
                onCreate(db)

                db.setTransactionSuccessful()
                true
            } finally {
                db.endTransaction()
            }
        }
    } catch (e: Exception) {
        Log.e(TAG, "Force initialization failed", e)
        false
    }

    @Synchronized
    fun isDatabaseInitialized(): Boolean = try {
        readableDatabase.let { db ->
            val requiredTables = arrayOf(TABLE_WORDS, TABLE_SRS_CARDS, TABLE_SRS_REVIEWS)
            requiredTables.all { table ->
                db.rawQuery(
                    "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                    arrayOf(table)
                ).use { cursor -> cursor.count > 0 }
            } && db.version >= DATABASE_VERSION
        }
    } catch (e: Exception) {
        false
    } finally {
        readableDatabase.close()
    }

    // Add this for safer operations
    @Synchronized
    fun safeDatabaseOperation(block: (SQLiteDatabase) -> Unit): Boolean {
        return try {
            writableDatabase.let { db ->
                db.beginTransaction()
                try {
                    block(db)
                    db.setTransactionSuccessful()
                    true
                } finally {
                    db.endTransaction()
                }
            }
        } catch (e: Exception) {
            false
        }
    }


    // A more robust and safe approach to database operations using a try-with-resources block
    // This now takes the db instance to avoid closing the main connection
    private fun <T> safeDatabaseRead(db: SQLiteDatabase, operation: (SQLiteDatabase) -> T): T? {
        return try {
            operation(db)
        } catch (e: SQLiteException) {
            Log.e(TAG, "Database read error", e)
            null
        }
    }

    // A more robust and safe approach to database operations using a try-with-resources block
    // This now takes the db instance to avoid closing the main connection
    private fun <T> safeDatabaseWrite(db: SQLiteDatabase, operation: (SQLiteDatabase) -> T): T? {
        return try {
            operation(db)
        } catch (e: SQLiteException) {
            Log.e(TAG, "Database write error", e)
            null
        }
    }

    private fun <T> withTransaction(operation: (SQLiteDatabase) -> T): T? {
        return safeDatabaseWrite(this.writableDatabase) { db -> // Pass writableDatabase
            db.beginTransaction()
            try {
                val result = operation(db)
                db.setTransactionSuccessful()
                result
            } catch (e: Exception) {
                Log.e(TAG, "Transaction failed", e)
                throw e
            } finally {
                db.endTransaction()
            }
        }
    }

    private inline fun <T> Cursor.mapToList(transform: (Cursor) -> T): List<T> {
        val list = mutableListOf<T>()
        // The .use { } is already handled by the caller (e.g., db.rawQuery(...).use { ... })
        while (this.moveToNext()) {
            list.add(transform(this))
        }
        return list
    }

    // Updated parseWordFromCursor to accept a prefix for aliased columns
    private fun parseWordFromCursor(cursor: Cursor, prefix: String = ""): Word {
        val idIndex = cursor.getColumnIndexOrThrow(prefix + COLUMN_ID)
        val languageIndex = cursor.getColumnIndexOrThrow(prefix + COLUMN_LANGUAGE)
        val wordIndex = cursor.getColumnIndexOrThrow(prefix + COLUMN_WORD)
        val meaningIndex = cursor.getColumnIndexOrThrow(prefix + COLUMN_MEANING)
        val writingIndex = cursor.getColumnIndexOrThrow(prefix + COLUMN_WRITING)
        val wordTypeIndex = cursor.getColumnIndexOrThrow(prefix + COLUMN_WORD_TYPE)
        val category1Index = cursor.getColumnIndexOrThrow(prefix + COLUMN_CATEGORY_1)
        val category2Index = cursor.getColumnIndex(prefix + COLUMN_CATEGORY_2)
        val phoneticsIndex = cursor.getColumnIndex(prefix + COLUMN_PHONETICS)
        val tagsIndex = cursor.getColumnIndex(prefix + COLUMN_TAGS)

        val tags = try {
            if (!cursor.isNull(tagsIndex)) {
                JSONArray(cursor.getString(tagsIndex)).let { tagsArray ->
                    (0 until tagsArray.length()).map { i -> tagsArray.getString(i) }
                }
            } else {
                emptyList()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing tags JSON", e)
            emptyList()
        }

        return Word(
            id = cursor.getLong(idIndex),
            language = cursor.getString(languageIndex),
            word = cursor.getString(wordIndex),
            meaning = cursor.getString(meaningIndex),
            writing = cursor.getString(writingIndex),
            wordType = cursor.getString(wordTypeIndex),
            category1 = cursor.getString(category1Index),
            category2 = if (!cursor.isNull(category2Index)) cursor.getString(category2Index) else null,
            phonetics = if (!cursor.isNull(phoneticsIndex)) cursor.getString(phoneticsIndex) else null,
            tags = tags
        )
    }

    // Updated parseSrsCardFromCursor to accept a prefix for aliased columns
    private fun parseSrsCardFromCursor(cursor: Cursor, prefix: String = ""): SrsCard {
        return try {
            val cardIdIndex = cursor.getColumnIndexOrThrow(prefix + COLUMN_CARD_ID)
            val wordIdIndex = cursor.getColumnIndexOrThrow(prefix + COLUMN_WORD_ID)
            val languageIndex = cursor.getColumnIndexOrThrow(prefix + COLUMN_LANGUAGE)
            val dueDateIndex = cursor.getColumnIndexOrThrow(prefix + COLUMN_DUE_DATE)
            val intervalIndex = cursor.getColumnIndexOrThrow(prefix + COLUMN_INTERVAL)
            val repetitionsIndex = cursor.getColumnIndexOrThrow(prefix + COLUMN_REPETITIONS)
            val easeFactorIndex = cursor.getColumnIndexOrThrow(prefix + COLUMN_EASE_FACTOR)
            val isBuriedIndex = cursor.getColumnIndexOrThrow(prefix + COLUMN_IS_BURIED)
            val deckLevelIndex = cursor.getColumnIndexOrThrow(prefix + COLUMN_DECK_LEVEL)

            val srsCard = SrsCard(
                id = cursor.getLong(cardIdIndex),
                wordId = cursor.getLong(wordIdIndex),
                language = cursor.getString(languageIndex),
                dueDate = cursor.getString(dueDateIndex),
                interval = cursor.getInt(intervalIndex),
                repetitions = cursor.getInt(repetitionsIndex),
                easeFactor = cursor.getFloat(easeFactorIndex),
                isBuried = cursor.getInt(isBuriedIndex) == 1,
                deckLevel = cursor.getString(deckLevelIndex) ?: ""
            )

            Log.d(TAG, "Parsed SrsCard OK: $srsCard")
            srsCard
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing SrsCard from cursor", e)
            throw e
        }
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
    ): Long? = withTransaction { db ->
        val values = ContentValues().apply {
            put(COLUMN_LANGUAGE, language)
            put(COLUMN_WORD, word)
            put(COLUMN_MEANING, meaning)
            put(COLUMN_WRITING, writing)
            put(COLUMN_WORD_TYPE, wordType)
            put(COLUMN_CATEGORY_1, category1)
            category2?.let { put(COLUMN_CATEGORY_2, it) }
            phonetics?.let { put(COLUMN_PHONETICS, it) }
            tags?.let { put(COLUMN_TAGS, JSONArray(it).toString()) }
        }
        db.insert(TABLE_WORDS, null, values)
    }

    // Corrected bulkInsertCards function to return Pair<SrsCard, Word>
    fun bulkInsertCards(wordsToInsert: List<Word>, deckLevel: String): List<Pair<SrsCard, Word>> {
        val insertedCardsAndWords = mutableListOf<Pair<SrsCard, Word>>()
        val db = this.writableDatabase
        db.beginTransaction()
        try {
            for (wordToInsert in wordsToInsert) {
                // 1. Insert the word into the words table
                val wordValues = ContentValues().apply {
                    put(COLUMN_LANGUAGE, wordToInsert.language)
                    put(COLUMN_WORD, wordToInsert.word)
                    put(COLUMN_MEANING, wordToInsert.meaning)
                    put(COLUMN_PHONETICS, wordToInsert.phonetics)
                    put(COLUMN_WRITING, wordToInsert.writing)
                    put(COLUMN_WORD_TYPE, wordToInsert.wordType)
                    put(COLUMN_CATEGORY_1, wordToInsert.category1)
                    put(COLUMN_CATEGORY_2, wordToInsert.category2)
                    put(COLUMN_TAGS, JSONArray(wordToInsert.tags).toString()) // Store tags as JSON array string
                }
                val wordId = db.insert(TABLE_WORDS, null, wordValues)
                if (wordId == -1L) {
                    Log.e(TAG, "Failed to insert word: ${wordToInsert.word}")
                    continue
                }
                Log.d(TAG, "Inserted word ID: $wordId")

                // 2. Create and insert the corresponding SRS card
                val cardValues = ContentValues().apply {
                    put(COLUMN_WORD_ID, wordId)
                    put(COLUMN_LANGUAGE, wordToInsert.language)
                    put(COLUMN_DUE_DATE, Calendar.getInstance().toIso8601()) // Store as ISO 8601 string
                    put(COLUMN_INTERVAL, INITIAL_INTERVAL)
                    put(COLUMN_REPETITIONS, 0)
                    put(COLUMN_EASE_FACTOR, 2.5f) // Use float literal
                    put(COLUMN_IS_BURIED, 0)
                    put(COLUMN_DECK_LEVEL, deckLevel)
                }
                val cardId = db.insert(TABLE_SRS_CARDS, null, cardValues)
                if (cardId == -1L) {
                    Log.e(TAG, "Failed to insert SRS card for word ID: $wordId")
                    db.delete(TABLE_WORDS, "$COLUMN_ID=?", arrayOf(wordId.toString()))
                    continue
                }
                Log.d(TAG, "Inserted card ID: $cardId")

                val newCard = SrsCard(
                    id = cardId,
                    wordId = wordId,
                    language = wordToInsert.language,
                    dueDate = Calendar.getInstance().toIso8601(), // Consistent with storage
                    interval = INITIAL_INTERVAL,
                    repetitions = 0,
                    easeFactor = 2.5f,
                    isBuried = false,
                    deckLevel = deckLevel
                )
                insertedCardsAndWords.add(Pair(newCard, wordToInsert.copy(id = wordId)))
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        return insertedCardsAndWords
    }

    fun getAllSrsCards(): List<SrsCard> = safeDatabaseRead(this.readableDatabase) { db ->
        val query = """
            SELECT * FROM $TABLE_SRS_CARDS
            ORDER BY $COLUMN_CARD_ID ASC
        """.trimIndent()
        Log.d(TAG, "getAllSrsCards Query: $query")
        db.rawQuery(query, null).use { cursor ->
            Log.d(TAG, "getAllSrsCards Cursor count: ${cursor.count}")
            cursor.mapToList {
                val card = parseSrsCardFromCursor(it)
                Log.d(TAG, "Fetched All Card: ID=${card.id}, DueDate=${card.dueDate}, IsBuried=${card.isBuried}, Interval=${card.interval}, Reps=${card.repetitions}")
                card
            }
        }
    } ?: emptyList()

    fun generateContextualContent(words: List<String>, language: String, topic: String): Pair<String, String> {
        return Pair(
            "$topic dialogue:\n${words.joinToString(", ")}",
            "Translation:\n${words.joinToString(", ")}"
        )
    }

    fun getAllWords(): List<Word> = safeDatabaseRead(this.readableDatabase) { db ->
        db.query(TABLE_WORDS, null, null, null, null, null, "$COLUMN_TIMESTAMP DESC").use { cursor ->
            cursor.mapToList { parseWordFromCursor(it) }
        }
    } ?: emptyList()

    fun getWordsByLanguage(language: String): List<Word> = safeDatabaseRead(this.readableDatabase) { db ->
        db.query(
            TABLE_WORDS,
            null,
            "$COLUMN_LANGUAGE = ?",
            arrayOf(language),
            null, null, "$COLUMN_TIMESTAMP DESC"
        ).use { cursor ->
            cursor.mapToList { parseWordFromCursor(it) }
        }
    } ?: emptyList()

    fun getCardsByDeckLevel(deckLevel: String): List<SrsCard> = safeDatabaseRead(this.readableDatabase) { db ->
        db.query(
            TABLE_SRS_CARDS,
            null,
            "$COLUMN_DECK_LEVEL = ?",
            arrayOf(deckLevel),
            null, null, "$COLUMN_DUE_DATE ASC"
        ).use { cursor ->
            cursor.mapToList { parseSrsCardFromCursor(it) }
        }
    } ?: emptyList()

    // DatabaseHelper.kt
    fun getDistinctDeckLevels(): List<String> = safeDatabaseRead(this.readableDatabase) { db ->
        db.query(
            true,
            TABLE_SRS_CARDS,
            arrayOf(COLUMN_DECK_LEVEL),
            null, null, null, null,
            null, null
        ).use { cursor ->
            mutableListOf<String>().apply {
                while (cursor.moveToNext()) {
                    add(cursor.getString(0))
                }
            }.distinct()
        }
    } ?: emptyList()

    fun getTotalCardCount(): Long = safeDatabaseRead(this.readableDatabase) { db ->
        DatabaseUtils.queryNumEntries(db, TABLE_SRS_CARDS)
    } ?: 0

    fun getReviewStats(days: Int = 30): List<ReviewStat> = safeDatabaseRead(this.readableDatabase) { db ->
        val timeThreshold = Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, -days) }.timeInMillis

        // Join with SRS cards table to get interval and ease factor
        db.rawQuery("""
        SELECT 
            strftime('%Y-%m-%d', r.$COLUMN_REVIEW_DATE) as day, 
            COUNT(*) as review_count,
            AVG(c.$COLUMN_EASE_FACTOR) as avg_ease,
            AVG(c.$COLUMN_INTERVAL) as avg_interval
        FROM $TABLE_SRS_REVIEWS r
        JOIN $TABLE_SRS_CARDS c ON r.$COLUMN_CARD_ID = c.$COLUMN_CARD_ID
        WHERE r.$COLUMN_REVIEW_DATE >= ?
        GROUP BY day
        ORDER BY day DESC
    """, arrayOf(timeThreshold.toString())).use { cursor ->
            cursor.mapToList {
                ReviewStat(
                    date = it.getString(it.getColumnIndex("day")),
                    count = it.getInt(it.getColumnIndex("review_count")),
                    avgEase = it.getDouble(it.getColumnIndex("avg_ease")),
                    avgInterval = it.getDouble(it.getColumnIndex("avg_interval"))
                )
            }
        }
    } ?: emptyList()

    fun getWordById(id: Long): Word? = safeDatabaseRead(this.readableDatabase) { db ->
        db.query(
            TABLE_WORDS,
            null,
            "$COLUMN_ID = ?",
            arrayOf(id.toString()),
            null, null, null,
            "1"  // LIMIT 1
        ).use { cursor ->
            if (cursor.moveToFirst()) {
                parseWordFromCursor(cursor)
            } else {
                null
            }
        }
    }

    @Synchronized
    fun getNounsByCategory(language: String, category1: String): List<Word> {
        return safeDatabaseRead(this.readableDatabase) { db ->
            db.query(
                TABLE_WORDS,
                null,
                "$COLUMN_LANGUAGE = ? AND $COLUMN_WORD_TYPE = ? AND $COLUMN_CATEGORY_1 = ?",
                arrayOf(language, "noun", category1),
                null, null, "$COLUMN_TIMESTAMP DESC"
            ).use { cursor ->
                mutableListOf<Word>().apply {
                    while (cursor.moveToNext()) {
                        parseWordFromCursor(cursor)?.let { add(it) }
                    }
                }
            }
        } ?: emptyList()
    }

    fun getWordsBySubcategory(language: String, category2: String): List<Word> = safeDatabaseRead(this.readableDatabase) { db ->
        db.query(
            TABLE_WORDS,
            null,
            "$COLUMN_LANGUAGE = ? AND $COLUMN_CATEGORY_2 = ?",
            arrayOf(language, category2),
            null, null, "$COLUMN_TIMESTAMP DESC"
        ).use { cursor ->
            cursor.mapToList { parseWordFromCursor(it) }
        }
    } ?: emptyList()

    fun getWordsByTag(language: String, tag: String): List<Word> = safeDatabaseRead(this.readableDatabase) { db ->
        db.rawQuery("""
            SELECT * FROM $TABLE_WORDS
            WHERE $COLUMN_LANGUAGE = ? AND $COLUMN_TAGS LIKE ?
            ORDER BY $COLUMN_TIMESTAMP DESC
        """.trimIndent(), arrayOf(language, "%\"$tag\"%")).use { cursor ->
            cursor.mapToList { parseWordFromCursor(it) }
        }
    } ?: emptyList()

    fun updateWord(
        id: Long,
        newMeaning: String? = null,
        newPhonetics: String? = null,
        newTags: List<String>? = null
    ): Boolean = safeDatabaseWrite(this.writableDatabase) { db ->
        val values = ContentValues().apply {
            newMeaning?.let { put(COLUMN_MEANING, it) }
            newPhonetics?.let { put(COLUMN_PHONETICS, it) }
            newTags?.let { put(COLUMN_TAGS, JSONArray(it).toString()) }
        }
        db.update(TABLE_WORDS, values, "$COLUMN_ID = ?", arrayOf(id.toString())) > 0
    } ?: false

    fun deleteWord(id: Long): Boolean = safeDatabaseWrite(this.writableDatabase) { db ->
        db.delete(TABLE_WORDS, "$COLUMN_ID = ?", arrayOf(id.toString())) > 0
    } ?: false

    // --- CRUD SRS Cards Operations ---
    private fun getCard(db: SQLiteDatabase, cardId: Long): SrsCard? {
        return db.query(
            TABLE_SRS_CARDS,
            null,
            "$COLUMN_CARD_ID = ?",
            arrayOf(cardId.toString()),
            null, null, null
        ).use { cursor ->
            if (cursor.moveToFirst()) parseSrsCardFromCursor(cursor) else null
        }
    }

    // This function was missing and has been re-added.
    fun addToSRS(wordId: Long, language: String, deckLevel: String): SrsCard? = withTransaction { db ->
        val values = ContentValues().apply {
            put(COLUMN_WORD_ID, wordId)
            put(COLUMN_LANGUAGE, language)
            put(COLUMN_DUE_DATE, calculateDueDate(INITIAL_INTERVAL))
            put(COLUMN_INTERVAL, INITIAL_INTERVAL)
            put(COLUMN_EASE_FACTOR, 2.5f)
            put(COLUMN_DECK_LEVEL, deckLevel)
        }
        val cardId = db.insert(TABLE_SRS_CARDS, null, values)
        if (cardId != -1L) {
            getCard(db, cardId)
        } else {
            Log.e(TAG, "Failed to insert SRS card for word $wordId")
            null
        }
    }

    private fun calculateDueDate(intervalDays: Int): String {
        val calendar = Calendar.getInstance()
        calendar.add(Calendar.DAY_OF_YEAR, intervalDays)
        return calendar.toIso8601()
    }

    private fun calculateSM2Update(
        currentInterval: Int,
        currentRepetitions: Int,
        currentEase: Float,
        quality: Int
    ): Pair<Int, Float> {
        return when {
            quality < 3 -> {
                val newEase = max(1.3f, currentEase - 0.15f)
                Pair(1, newEase)
            }
            else -> {
                val newEase = max(1.3f, currentEase + (0.1f - (5 - quality) * (0.08f + (5 - quality) * 0.02f)))
                val newInterval = when (currentRepetitions) {
                    0 -> 1
                    1 -> 6
                    else -> (currentInterval * newEase).roundToInt()
                }
                Pair(newInterval, newEase)
            }
        }
    }

    fun logReview(cardId: Long, quality: Int): SrsCard? = withTransaction { db ->
        val card = getCard(db, cardId)
        if (card == null) {
            Log.e(TAG, "Card with ID $cardId not found for review.")
            null
        } else {
            db.insert(TABLE_SRS_REVIEWS, null, ContentValues().apply {
                put(COLUMN_CARD_ID, cardId)
                put(COLUMN_QUALITY, quality)
                put(COLUMN_REVIEW_DATE, Calendar.getInstance().toIso8601())
            })

            val (newInterval, newEase) = calculateSM2Update(
                card.interval,
                card.repetitions,
                card.easeFactor,
                quality
            )
            val newRepetitions = if (quality < 3) 0 else card.repetitions + 1

            // 👇 Adjust due date logic here:
            val newDueDate = if (quality < 3) {
                Calendar.getInstance().toIso8601() // show again immediately
            } else {
                calculateDueDate(newInterval)
            }

            val values = ContentValues().apply {
                put(COLUMN_DUE_DATE, newDueDate)
                put(COLUMN_INTERVAL, newInterval)
                put(COLUMN_EASE_FACTOR, newEase)
                put(COLUMN_REPETITIONS, newRepetitions)
            }
            db.update(TABLE_SRS_CARDS, values, "$COLUMN_CARD_ID = ?", arrayOf(cardId.toString()))

            getCard(db, cardId)
        }
    }


    fun getDueCards(language: String, limit: Int): List<DueCardWithWord> = safeDatabaseRead(this.readableDatabase) { db ->
        val currentTime = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
        val query = """
        SELECT
            c.$COLUMN_CARD_ID as card_card_id,
            c.$COLUMN_WORD_ID as card_word_id,
            c.$COLUMN_LANGUAGE as card_language,
            c.$COLUMN_DUE_DATE as card_due_date,
            c.$COLUMN_INTERVAL as card_interval,
            c.$COLUMN_REPETITIONS as card_repetitions,
            c.$COLUMN_EASE_FACTOR as card_ease_factor,
            c.$COLUMN_IS_BURIED as card_is_buried,
            c.$COLUMN_DECK_LEVEL as card_deck_level,
            w.$COLUMN_ID as word_id,
            w.$COLUMN_LANGUAGE as word_language,
            w.$COLUMN_WORD as word_word,
            w.$COLUMN_MEANING as word_meaning,
            w.$COLUMN_WRITING as word_writing,
            w.$COLUMN_WORD_TYPE as word_word_type,
            w.$COLUMN_CATEGORY_1 as word_category_1,
            w.$COLUMN_CATEGORY_2 as word_category_2,
            w.$COLUMN_PHONETICS as word_phonetics,
            w.$COLUMN_TAGS as word_tags
        FROM $TABLE_SRS_CARDS c
        INNER JOIN $TABLE_WORDS w ON c.$COLUMN_WORD_ID = w.$COLUMN_ID
        WHERE c.$COLUMN_LANGUAGE = ?
        AND DATE(c.$COLUMN_DUE_DATE) <= DATE(?)
        AND c.$COLUMN_IS_BURIED = 0
        ORDER BY c.$COLUMN_DUE_DATE ASC
        LIMIT ?
    """.trimIndent()

        Log.d(TAG, "getDueCards Query: $query")
        Log.d(TAG, "getDueCards Args: [language=$language, currentTime=$currentTime, limit=$limit]")

        db.rawQuery(query, arrayOf(language, currentTime, limit.toString())).use { cursor ->
            Log.d(TAG, "getDueCards Cursor count: ${cursor.count}")
            cursor.mapToList {
                val srsCard = parseSrsCardFromCursor(it, "card_")
                val word = parseWordFromCursor(it, "word_")
                Log.d(TAG, "Fetched Due Card: ID=${srsCard.id}, DueDate=${srsCard.dueDate}, IsBuried=${srsCard.isBuried}, Word='${word.word}'")
                DueCardWithWord(srsCard, word)
            }
        }
    } ?: emptyList()

    // --- Analytics and Learning Module Operations ---


    fun getWordCountByCategory(language: String, category: String): Int = safeDatabaseRead(this.readableDatabase) { db ->
        val query = """
            SELECT COUNT(*) FROM $TABLE_WORDS
            WHERE $COLUMN_LANGUAGE = ? AND $COLUMN_CATEGORY_1 = ?
        """.trimIndent()
        db.rawQuery(query, arrayOf(language, category)).use { cursor ->
            if (cursor.moveToFirst()) cursor.getInt(0) else 0
        }
    } ?: 0

    fun getPopularCategories(limit: Int): List<String> = safeDatabaseRead(this.readableDatabase) { db ->
        val query = """
            SELECT $COLUMN_CATEGORY_1 FROM $TABLE_WORDS
            GROUP BY $COLUMN_CATEGORY_1
            ORDER BY COUNT(*) DESC
            LIMIT ?
        """.trimIndent()
        db.rawQuery(query, arrayOf(limit.toString())).use { cursor ->
            cursor.mapToList { it.getString(0) }
        }
    } ?: emptyList()

    fun getRecommendedTopics(language: String): List<String> = safeDatabaseRead(this.readableDatabase) { db ->
        val query = """
            SELECT $COLUMN_CATEGORY_1
            FROM $TABLE_WORDS
            WHERE $COLUMN_LANGUAGE = ? AND $COLUMN_TIMESTAMP >= strftime('%Y-%m-%d %H:%M:%S', 'now', '-30 days')
            GROUP BY $COLUMN_CATEGORY_1
            ORDER BY COUNT(*) DESC
            LIMIT 3
        """.trimIndent()
        db.rawQuery(query, arrayOf(language)).use { cursor ->
            cursor.mapToList { it.getString(0) }
        }
    } ?: emptyList()

    fun getWeakCategories(language: String): List<String> = safeDatabaseRead(this.readableDatabase) { db ->
        val query = """
            SELECT w.$COLUMN_CATEGORY_1
            FROM $TABLE_SRS_REVIEWS r
            JOIN $TABLE_SRS_CARDS c ON r.$COLUMN_CARD_ID = c.$COLUMN_CARD_ID
            JOIN $TABLE_WORDS w ON c.$COLUMN_WORD_ID = w.$COLUMN_ID
            WHERE r.$COLUMN_QUALITY < 3 AND w.$COLUMN_LANGUAGE = ?
            GROUP BY w.$COLUMN_CATEGORY_1
            ORDER BY COUNT(*) DESC
            LIMIT 3
        """.trimIndent()
        db.rawQuery(query, arrayOf(language)).use { cursor ->
            cursor.mapToList { it.getString(0) }
        }
    } ?: emptyList()

    fun getExistingTopics(language: String, limit: Int): List<String> = safeDatabaseRead(this.readableDatabase) { db ->
        val query = """
            SELECT $COLUMN_CATEGORY_1 FROM $TABLE_WORDS
            WHERE $COLUMN_LANGUAGE = ?
            GROUP BY $COLUMN_CATEGORY_1
            ORDER BY COUNT(*) DESC
            LIMIT ?
        """.trimIndent()
        db.rawQuery(query, arrayOf(language, limit.toString())).use { cursor ->
            cursor.mapToList { it.getString(0) }
        }
    } ?: emptyList()
}

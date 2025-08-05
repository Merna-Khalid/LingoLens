import { AntDesign, FontAwesome5, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import LingoProMultimodal from 'lingopro-multimodal-module';

// Define the structure of a Word object
type Word = {
    id: number;
    language: string;
    word: string;
    meaning: string;
    writing: string;
    wordType: string;
    category1: string;
    category2?: string | null;
    phonetics?: string | null;
    tags: string[];
};

// Define the structure of an SrsCard object
type SrsCard = {
    id: number;
    wordId: number;
    language: string;
    dueDate: string; // ISO 8601 string
    interval: number;
    repetitions: number;
    easeFactor: number;
    isBuried: boolean;
    deckLevel: string;
};

// Define the combined type for due cards fetched from the native module
type DueCardWithWord = {
    card: SrsCard;
    word: Word;
};

const LANGUAGE_KEY = 'lingopro_selected_language';
const LEVEL_KEY = 'lingopro_selected_level';
const PROGRESS_KEY = 'lingopro_language_progress';

export default function App() {
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [isDbInitialized, setIsDbInitialized] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [currentCard, setCurrentCard] = useState<SrsCard | null>(null); // Use SrsCard type
    const [currentWord, setCurrentWord] = useState<Word | null>(null); // Use Word type
    const [isCardFlipped, setIsCardFlipped] = useState(false);
    const [dueCardsCount, setDueCardsCount] = useState(0);
    const [showAddWordModal, setShowAddWordModal] = useState(false);
    const [newWordData, setNewWordData] = useState<Omit<Word, 'id' | 'tags'> & { tags: string[] | null }>({
        language: 'English',
        word: '',
        meaning: '',
        writing: '',
        wordType: '',
        category1: '',
        category2: null,
        phonetics: null,
        tags: null,
    });

    const [selectedLanguage, setSelectedLanguage] = useState('English');
    const [isLanguageLoaded, setIsLanguageLoaded] = useState(false);
    const [formErrors, setFormErrors] = useState({});

    useEffect(() => {
        const initializeDbStatus = async () => {
            setIsLoading(true);
            try {
                console.log("Checking database initialization status...");
                const dbAlreadyInitialized = await LingoProMultimodal.isDatabaseInitialized();

                if (!dbAlreadyInitialized) {
                    console.log("Database not initialized. Proceeding with initialization...");
                    const dbInitSuccess = await LingoProMultimodal.initializeDatabase();
                    setIsDbInitialized(dbInitSuccess);
                    if (!dbInitSuccess) {
                        console.warn("Database initialization failed.");
                        Alert.alert("Error", "Failed to initialize SRS database.");
                        return;
                    }
                    console.log("SRS Database initialized successfully.");
                } else {
                    console.log("SRS Database already initialized.");
                    setIsDbInitialized(true);
                }
            } catch (error: any) {
                console.error("SRS Initialization error:", error);
                Alert.alert("Error", `Failed to initialize SRS: ${error.message}`);
            } finally {
                setIsLoading(false);
            }
        };

        initializeDbStatus();
    }, []);

    useEffect(() => {
        if (isDbInitialized) {
            console.log("Database confirmed initialized. Loading user settings.");
            loadUserSettings();
        }
    }, [isDbInitialized]);

    useEffect(() => {
        if (isDbInitialized && isLanguageLoaded && selectedLanguage) {
            console.log(`Fetching due cards for language: ${selectedLanguage}`);
            fetchDueCards();
        }
    }, [isDbInitialized, selectedLanguage, isLanguageLoaded]);


    const resetForm = () => {
        setNewWordData({
            language: 'English',
            word: '',
            meaning: '',
            writing: '',
            wordType: '',
            category1: '',
            category2: null,
            phonetics: null,
            tags: null,
        });
        setFormErrors({});
        setShowAddWordModal(false);
    };

    const loadUserSettings = async () => {
        try {
            const storedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
            if (storedLanguage) {
                setSelectedLanguage(storedLanguage);
                console.log(`User language loaded from AsyncStorage: ${storedLanguage}`);
            } else {
                console.log("No language found in AsyncStorage. Defaulting to English.");
                setSelectedLanguage('English'); // Explicitly set default if nothing is stored
            }
        } catch (error) {
            console.error('Failed to load user settings:', error);
            // Fallback to default if loading fails
            setSelectedLanguage('English');
        } finally {
            setIsLanguageLoaded(true); // Set this flag once loading is complete (success or failure)
        }
    };

    const fetchDueCards = async () => {
        if (!isDbInitialized) {
            console.log("fetchDueCards called but DB not initialized.");
            return;
        }

        setIsLoading(true);
        try {
            const limit = 20;
            const dueCardsWithWordsJson = await LingoProMultimodal.getDueCards(selectedLanguage, limit);
            console.log("Raw JSON from native module:", dueCardsWithWordsJson);

            const dueCardsWithWords: DueCardWithWord[] = JSON.parse(dueCardsWithWordsJson);



            if (!dueCardsWithWords || dueCardsWithWords.length === 0) {
                setDueCardsCount(0);
                setCurrentCard(null);
                setCurrentWord(null);
                console.log("No due cards found.");
            } else {
                setDueCardsCount(dueCardsWithWords.length);
                const firstDueCard = dueCardsWithWords[0];
                setCurrentCard(firstDueCard.card);
                setCurrentWord(firstDueCard.word);
                console.log("Fetched new card and word:", firstDueCard.word);
            }

        } catch (error) {
            console.warn('Network/API error:', error);
            Alert.alert("Error", "Failed to fetch due cards.");
            setDueCardsCount(0);
            setCurrentCard(null);
            setCurrentWord(null);
        } finally {
            setIsCardFlipped(false);
            setIsLoading(false);
        }
    };

    const handleLogReview = async (quality: number) => {
        if (!currentCard) {
            console.warn("Attempted to log review with no active card.");
            return;
        }
        setIsLoading(true);
        try {
            // The logReview function returns the updated SrsCard directly
            const updatedCard: SrsCard = await LingoProMultimodal.logReview(currentCard.id, quality);
            console.log('Review logged, updated card:', updatedCard);
            // After logging review, re-fetch due cards to get the next one
            await fetchDueCards();
        } catch (error: any) {
            console.error("Error logging review:", error);
            Alert.alert("Error", `Failed to log review: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddWord = async () => {
        if (!isDbInitialized) {
            Alert.alert("Error", "Database not initialized.");
            return;
        }
        if (!newWordData.word || !newWordData.meaning || !newWordData.language || !newWordData.wordType || !newWordData.category1) {
            Alert.alert("Missing Info", "Please fill in all required word fields (Word, Meaning, Language, Type, Category 1).");
            return;
        }

        setIsLoading(true);
        try {
            // The insertWord function in Kotlin returns the ID of the inserted word
            const wordId = await LingoProMultimodal.insertWord({
                language: newWordData.language,
                word: newWordData.word,
                meaning: newWordData.meaning,
                writing: newWordData.writing || newWordData.word,
                wordType: newWordData.wordType,
                category1: newWordData.category1,
                category2: newWordData.category2,
                phonetics: newWordData.phonetics,
                tags: newWordData.tags || []
            });

            if (wordId !== -1) { // Assuming -1L is returned on failure from Kotlin
                Alert.alert("Success", `Word "${newWordData.word}" added!`);
                resetForm();
                // After adding a word, you might want to add it to SRS immediately
                // For now, just re-fetch due cards to see if it becomes due soon
                await fetchDueCards();
            } else {
                Alert.alert("Error", "Failed to add word.");
            }
        } catch (error: any) {
            console.error("Error adding word:", error);
            Alert.alert("Error", `Failed to add word: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLearnMore = async () => {
        if (!isDbInitialized) {
            Alert.alert("Error", "Database not initialized.");
            return;
        }
        setIsLoading(true);
        try {
            const allWordsJson = await LingoProMultimodal.getAllWords();
            const allWords: Word[] = JSON.parse(allWordsJson); // Parse the JSON string
            const wordList = allWords.map((w: Word) => `${w.word} (${w.language}) - ${w.meaning}`).join('\n');
            Alert.alert("All Saved Words", wordList || "No words saved yet.");
        } catch (error: any) {
            console.error("Error fetching all words:", error);
            Alert.alert("Error", `Failed to get all words: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleQuiz = async () => {
        await fetchDueCards();
    };

    const cardDisabled = dueCardsCount === 0;

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 15 }]}>
                <TouchableOpacity onPress={() => router.back()}>
                    <AntDesign name="arrowleft" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Flashcards</Text>
                <View style={styles.badgeContainer}>
                    <Text style={styles.badgeText}>{dueCardsCount}</Text>
                </View>
            </View>

            {/* Daily Progress */}
            <View style={styles.progressSection}>
                <Text style={styles.progressLabel}>Daily Progress</Text>
                <View style={styles.progressBarWrapper}>
                    <View style={styles.progressBarPlaceholder}>
                        <View style={[styles.progressBarFill, { width: `${(dueCardsCount > 0 ? (20 - dueCardsCount) / 20 : 1) * 100}%` }]} />
                    </View>
                    <Text style={styles.cardsLeftText}>{dueCardsCount} cards left</Text>
                </View>
            </View>

            {/* Flashcard Area */}
            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#6200EE" />
                    <Text style={styles.loadingText}>Loading card...</Text>
                </View>
            ) : !isDbInitialized ? (
                <View style={styles.emptyStateContainer}>
                    <Text style={styles.emptyStateText}>Database not initialized.</Text>
                    <Text style={styles.emptyStateSubText}>Please ensure your native module is set up correctly.</Text>
                </View>
            ) : (
                <TouchableOpacity
                    style={[styles.flashcardContainer, cardDisabled && styles.flashcardContainerDisabled]}
                    onPress={() => {
                        if (currentWord) {
                            setIsCardFlipped(!isCardFlipped);
                        }
                    }}
                    disabled={cardDisabled || isLoading}
                >
                    {currentWord ? (
                        <>
                            <Text style={styles.cardCounter}>Card ID: {currentCard?.id || 'N/A'}</Text>
                            <Text style={styles.flashcardQuestion}>
                                {isCardFlipped ? currentWord.meaning : currentWord.word}
                            </Text>
                            <Text style={styles.flipInstruction}>Tap to flip the card</Text>
                        </>
                    ) : (
                        <View style={styles.noCardContent}>
                            <FontAwesome5 name="check-circle" size={50} color="#4CAF50" />
                            <Text style={styles.noCardText}>You're all caught up!</Text>
                            <Text style={styles.noCardSubText}>Add new words or check again later.</Text>
                        </View>
                    )}
                </TouchableOpacity>
            )}

            {/* Spaced Repetition Buttons */}
            {currentCard && isCardFlipped && (
                <View style={styles.repetitionButtonsContainer}>
                    <TouchableOpacity style={[styles.repetitionButton, styles.againButton]} onPress={() => handleLogReview(0)} disabled={isLoading}>
                        <Text style={styles.repetitionButtonText}>Again</Text>
                        <Text style={styles.repetitionButtonTime}>0 min</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.repetitionButton, styles.hardButton]} onPress={() => handleLogReview(1)} disabled={isLoading}>
                        <Text style={styles.repetitionButtonText}>Hard</Text>
                        <Text style={styles.repetitionButtonTime}>10 min</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.repetitionButton, styles.goodButton]} onPress={() => handleLogReview(3)} disabled={isLoading}>
                        <Text style={styles.repetitionButtonText}>Good</Text>
                        <Text style={styles.repetitionButtonTime}>1 day</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.repetitionButton, styles.easyButton]} onPress={() => handleLogReview(5)} disabled={isLoading}>
                        <Text style={styles.repetitionButtonText}>Easy</Text>
                        <Text style={styles.repetitionButtonTime}>4 days</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Action Buttons (Tools) */}
            <View style={styles.actionButtonsContainer}>
                <TouchableOpacity style={styles.actionButton} onPress={() => setShowAddWordModal(true)} disabled={isLoading || !isDbInitialized}>
                    <MaterialCommunityIcons name="pencil-outline" size={20} color="#333" />
                    <Text style={styles.actionButtonText}>Write</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} onPress={handleLearnMore} disabled={isLoading || !isDbInitialized}>
                    <Ionicons name="information-circle-outline" size={20} color="#333" />
                    <Text style={styles.actionButtonText}>Learn More</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} onPress={handleQuiz} disabled={isLoading || !isDbInitialized}>
                    <AntDesign name="questioncircleo" size={20} color="#333" />
                    <Text style={styles.actionButtonText}>Quiz</Text>
                </TouchableOpacity>
            </View>

            {/* Stats */}
            <View style={styles.statsContainer}>
                <View style={styles.statItem}>
                    <Text style={styles.statValue}>N/A</Text>
                    <Text style={styles.statLabel}>Correct</Text>
                </View>
                <View style={styles.statItem}>
                    <Text style={styles.statValue}>N/A</Text>
                    <Text style={styles.statLabel}>Studied</Text>
                </View>
                <View style={styles.statItem}>
                    <Text style={styles.statValue}>N/A</Text>
                    <Text style={styles.statLabel}>Total</Text>
                </View>
            </View>

            {/* Bottom Navigation */}
            <View style={[styles.bottomNavigation, { paddingBottom: insets.bottom + 10 }]}>
                <TouchableOpacity style={styles.navItem} onPress={() => router.navigate('LearningSystem/all-cards')}>
                    <MaterialCommunityIcons name="cards-outline" size={24} color="#888" />
                    <Text style={[styles.navText]}>All Cards</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navItem} onPress={() => router.navigate('LearningSystem/learning-page')}>
                    <Ionicons name="book-outline" size={24} color="#888" />
                    <Text style={styles.navText}>Learn</Text>
                </TouchableOpacity>

            </View>

            {/* Add Word Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={showAddWordModal}
                onRequestClose={() => setShowAddWordModal(false)}
            >
                <View style={styles.centeredView}>
                    <View style={styles.modalView}>
                        <Text style={styles.modalTitle}>Add New Word</Text>
                        <ScrollView style={styles.modalScrollView}>
                            <TextInput
                                style={styles.modalInput}
                                placeholder="Language (e.g., English)"
                                value={newWordData.language}
                                onChangeText={(text) => setNewWordData({ ...newWordData, language: text })}
                            />
                            <TextInput
                                style={styles.modalInput}
                                placeholder="Word"
                                value={newWordData.word}
                                onChangeText={(text) => setNewWordData({ ...newWordData, word: text })}
                            />
                            <TextInput
                                style={styles.modalInput}
                                placeholder="Meaning"
                                value={newWordData.meaning}
                                onChangeText={(text) => setNewWordData({ ...newWordData, meaning: text })}
                            />
                            <TextInput
                                style={styles.modalInput}
                                placeholder="Writing (optional, defaults to Word)"
                                value={newWordData.writing || ''}
                                onChangeText={(text) => setNewWordData({ ...newWordData, writing: text })}
                            />
                            <TextInput
                                style={styles.modalInput}
                                placeholder="Word Type (e.g., noun, verb, phrase)"
                                value={newWordData.wordType}
                                onChangeText={(text) => setNewWordData({ ...newWordData, wordType: text })}
                            />
                            <TextInput
                                style={styles.modalInput}
                                placeholder="Category 1 (e.g., Animals, Food)"
                                value={newWordData.category1}
                                onChangeText={(text) => setNewWordData({ ...newWordData, category1: text })}
                            />
                            <TextInput
                                style={styles.modalInput}
                                placeholder="Category 2 (optional)"
                                value={newWordData.category2 || ''}
                                onChangeText={(text) => setNewWordData({ ...newWordData, category2: text })}
                            />
                            <TextInput
                                style={styles.modalInput}
                                placeholder="Phonetics (optional)"
                                value={newWordData.phonetics || ''}
                                onChangeText={(text) => setNewWordData({ ...newWordData, phonetics: text })}
                            />
                            <TextInput
                                style={styles.modalInput}
                                placeholder="Tags (comma-separated, e.g., common, easy)"
                                value={newWordData.tags?.join(', ') || ''}
                                onChangeText={(text) => setNewWordData({ ...newWordData, tags: text.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0) })}
                            />
                        </ScrollView>
                        <View style={styles.modalButtonContainer}>
                            <Pressable
                                style={[styles.modalButton, styles.buttonClose]}
                                onPress={() => resetForm()}
                            >
                                <Text style={styles.textStyle}>Cancel</Text>
                            </Pressable>
                            <Pressable
                                style={[styles.modalButton, styles.buttonAdd]}
                                onPress={handleAddWord}
                                disabled={isLoading}
                            >
                                <Text style={styles.textStyle}>Add Word</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f8f8',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomColor: '#eee',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
    },
    badgeContainer: {
        backgroundColor: '#e0e0e0',
        borderRadius: 15,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    badgeText: {
        fontSize: 14,
        color: '#555',
        fontWeight: 'bold',
    },
    progressSection: {
        paddingHorizontal: 20,
        paddingVertical: 15,
    },
    progressLabel: {
        fontSize: 14,
        color: '#777',
        marginBottom: 5,
    },
    progressBarWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    progressBarPlaceholder: {
        flex: 1,
        height: 10,
        backgroundColor: '#e0e0e0',
        borderRadius: 5,
        overflow: 'hidden',
        marginRight: 10,
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: '#6200EE',
        borderRadius: 5,
    },
    cardsLeftText: {
        fontSize: 14,
        color: '#555',
    },
    mainContentArea: {
        flex: 1,
    },
    flashcardContainer: {
        backgroundColor: '#fff',
        marginHorizontal: 20,
        borderRadius: 15,
        padding: 30,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 180,
        maxHeight: 250,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
        marginBottom: 20,
    },
    flashcardContainerDisabled: {
        backgroundColor: '#f0f0f0',
        opacity: 0.7,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 180,
    },
    loadingText: {
        marginTop: 10,
        color: '#555',
    },
    cardCounter: {
        fontSize: 14,
        color: '#888',
        marginBottom: 10,
    },
    flashcardQuestion: {
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 10,
        color: '#333',
    },
    flipInstruction: {
        fontSize: 16,
        color: '#aaa',
    },
    noCardContent: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 20,
    },
    noCardText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#555',
        textAlign: 'center',
        marginTop: 15,
    },
    noCardSubText: {
        fontSize: 14,
        color: '#777',
        textAlign: 'center',
        marginTop: 5,
    },
    actionButtonsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginHorizontal: 20,
        marginTop: 20,
        marginBottom: 10,
    },
    actionButton: {
        backgroundColor: '#e0e0e0',
        borderRadius: 10,
        paddingVertical: 15,
        paddingHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        marginHorizontal: 5,
    },
    actionButtonText: {
        marginLeft: 8,
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
    },
    repetitionButtonsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-around',
        marginHorizontal: 15,
        marginTop: 20,
    },
    repetitionButton: {
        borderRadius: 15,
        paddingVertical: 15,
        paddingHorizontal: 10,
        alignItems: 'center',
        justifyContent: 'center',
        width: '45%',
        margin: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
    },
    repetitionButtonText: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 5,
    },
    repetitionButtonTime: {
        fontSize: 14,
        color: '#666',
    },
    againButton: {
        backgroundColor: '#ffe0e0',
    },
    hardButton: {
        backgroundColor: '#fff0d0',
    },
    goodButton: {
        backgroundColor: '#e0ffe0',
    },
    easyButton: {
        backgroundColor: '#e0e0ff',
    },
    statsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginHorizontal: 20,
        marginTop: 20,
        paddingVertical: 15,
        borderTopWidth: 1,
        borderTopColor: '#eee',
    },
    statItem: {
        alignItems: 'center',
    },
    statValue: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#333',
    },
    statLabel: {
        fontSize: 14,
        color: '#777',
    },
    bottomNavigation: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        borderTopWidth: 1,
        borderTopColor: '#eee',
        paddingVertical: 10,
        backgroundColor: '#fff',
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
    },
    navItem: {
        alignItems: 'center',
        paddingVertical: 5,
    },
    navText: {
        fontSize: 12,
        marginTop: 5,
        color: '#888',
    },
    centeredView: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalView: {
        margin: 20,
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 35,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
        width: '90%',
        maxHeight: '80%',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 15,
        color: '#333',
    },
    modalScrollView: {
        width: '100%',
        maxHeight: 300,
        marginBottom: 20,
    },
    modalInput: {
        height: 50,
        borderColor: '#ddd',
        borderWidth: 1,
        borderRadius: 10,
        marginBottom: 10,
        paddingHorizontal: 15,
        fontSize: 16,
        width: '100%',
    },
    modalButtonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        width: '100%',
    },
    modalButton: {
        borderRadius: 10,
        padding: 15,
        elevation: 2,
        flex: 1,
        marginHorizontal: 5,
        alignItems: 'center',
    },
    buttonClose: {
        backgroundColor: '#f44336',
    },
    buttonAdd: {
        backgroundColor: '#4CAF50',
    },
    textStyle: {
        color: 'white',
        fontWeight: 'bold',
        textAlign: 'center',
        fontSize: 16,
    },
    emptyStateContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    emptyStateText: {
        fontSize: 20,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 10,
        color: '#333',
    },
    emptyStateSubText: {
        fontSize: 16,
        textAlign: 'center',
        color: '#666',
    },
});

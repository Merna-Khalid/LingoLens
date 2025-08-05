import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, SafeAreaView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

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


export default function AllCardsPage() {
    const router = useRouter();
    const [allCardsWithWords, setAllCardsWithWords] = useState<DueCardWithWord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchAllCards = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // First, check if the database is initialized
                const isDbInitialized = await LingoProMultimodal.isDatabaseInitialized();
                if (!isDbInitialized) {
                    setError("Database not initialized. Please ensure it's set up correctly.");
                    setIsLoading(false);
                    return;
                }

                // Fetch all SRS cards (which only returns SrsCard objects)
                const allSrsCardsJson = await LingoProMultimodal.getAllSrsCards();
                const allSrsCards: SrsCard[] = JSON.parse(allSrsCardsJson);

                if (allSrsCards.length === 0) {
                    setAllCardsWithWords([]);
                    setIsLoading(false);
                    return;
                }

                // For each SrsCard, fetch its corresponding Word data
                const cardsWithWordsPromises = allSrsCards.map(async (card) => {
                    try {
                        const wordJson = await LingoProMultimodal.getWordById(card.wordId);
                        const word: Word = JSON.parse(wordJson);
                        return { card, word };
                    } catch (wordError) {
                        console.error(`Error fetching word for card ID ${card.id}:`, wordError);
                        // Return null or a partial object if word fetching fails for a card
                        return null;
                    }
                });

                const fetchedCardsWithWords = (await Promise.all(cardsWithWordsPromises)).filter(Boolean) as DueCardWithWord[];
                setAllCardsWithWords(fetchedCardsWithWords);

            } catch (e: any) {
                console.error("Error fetching all cards:", e);
                setError(`Failed to load cards: ${e.message}`);
            } finally {
                setIsLoading(false);
            }
        };

        fetchAllCards();
    }, []);

    if (isLoading) {
        return (
            <SafeAreaView style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#6200EE" />
                <Text style={styles.loadingText}>Loading all cards...</Text>
            </SafeAreaView>
        );
    }

    if (error) {
        return (
            <SafeAreaView style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={() => router.replace(router.asPath)}>
                    <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <AntDesign name="arrowleft" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>All Saved Cards</Text>
                <View style={styles.backButton} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollViewContent}>
                {allCardsWithWords.length === 0 ? (
                    <View style={styles.emptyStateContainer}>
                        <MaterialCommunityIcons name="cards-outline" size={50} color="#888" />
                        <Text style={styles.emptyStateText}>No cards found in your collection.</Text>
                        <Text style={styles.emptyStateSubText}>Start by generating new words or adding them manually!</Text>
                    </View>
                ) : (
                    allCardsWithWords.map((item, index) => (
                        <View key={item.card.id || index} style={styles.cardItem}>
                            <View style={styles.cardDetails}>
                                <Text style={styles.wordText}>{item.word.word}</Text>
                                <Text style={styles.meaningText}>{item.word.meaning}</Text>
                            </View>
                            <View style={styles.cardMeta}>
                                <Text style={styles.metaText}>Due: {new Date(item.card.dueDate).toLocaleDateString()}</Text>
                                <Text style={styles.metaText}>Level: {item.card.deckLevel}</Text>
                                <Text style={styles.metaText}>Reps: {item.card.repetitions}</Text>
                            </View>
                        </View>
                    ))
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F0F2F5',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F0F2F5',
    },
    loadingText: {
        marginTop: 10,
        fontSize: 16,
        color: '#555',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F0F2F5',
        padding: 20,
    },
    errorText: {
        fontSize: 18,
        color: '#D32F2F',
        textAlign: 'center',
        marginBottom: 20,
    },
    retryButton: {
        backgroundColor: '#6200EE',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
    },
    retryButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E6EBF0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 3,
    },
    backButton: {
        width: 24,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#2C3E50',
    },
    scrollViewContent: {
        padding: 15,
    },
    cardItem: {
        backgroundColor: '#FFFFFF',
        borderRadius: 15,
        padding: 15,
        marginBottom: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    cardDetails: {
        flex: 2,
    },
    wordText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1A237E',
    },
    meaningText: {
        fontSize: 16,
        color: '#555',
        marginTop: 5,
    },
    cardMeta: {
        flex: 1,
        alignItems: 'flex-end',
    },
    metaText: {
        fontSize: 12,
        color: '#777',
        marginTop: 2,
    },
    emptyStateContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        minHeight: 200, // Ensure it takes up some space
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

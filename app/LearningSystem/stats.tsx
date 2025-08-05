import React, { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, ScrollView, SafeAreaView } from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import LingoProMultimodal from 'lingopro-multimodal-module';

// Represents the data structure for the statistics returned from the native module.
interface StatsResult {
  wordsCount: number;
  totalCards: number;
  cardsByDeckLevel: Record<string, number>;
  reviewsOverTime: Array<{
    date: string;
    count: number;
    avgEase: number;
    avgInterval: number;
  }>;
}

const LANGUAGE_KEY = 'lingopro_selected_language';

export default function Stats() {
  const router = useRouter();
  const [stats, setStats] = useState<StatsResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // A helper function to call the native module for fetching stats.
  const fetchAndSetStats = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Call the native module function to fetch statistics
      const storedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
      const resultString: string = await LingoProMultimodal.fetchStats(storedLanguage);
      console.log(resultString);
      const result: StatsResult = JSON.parse(resultString);
      setStats(result);
    } catch (e) {
      console.error('Failed to load stats:', e);
      setError(`Failed to load statistics: ${e.message}`);
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Effect to load initial data and fetch stats when the component mounts.
  useEffect(() => {
    fetchAndSetStats();
  }, []);

  // Reusable component for a statistic card
  const StatCard = ({ title, value, icon }) => (
    <View style={styles.statCard}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <AntDesign name="arrowleft" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your Stats</Text>
        <View style={styles.backButton} /> {/* Placeholder for consistent spacing */}
      </View>

      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        <View style={styles.card}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4f46e5" />
              <Text style={styles.loadingText}>Loading statistics...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={fetchAndSetStats} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Tap to Retry</Text>
              </TouchableOpacity>
            </View>
          ) : stats ? (
            <>
              {/* Database Statistics Section */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionIcon}>📊</Text>
                  <Text style={styles.sectionTitle}>Overview</Text>
                </View>
                <View style={styles.statsGrid}>
                  <StatCard title="Total Words" value={stats.wordsCount} icon="📖" />
                  <StatCard title="Total SRS Cards" value={stats.totalCards} icon="🃏" />
                  <StatCard title="Reviews Logged" value={stats.reviewsOverTime.reduce((sum, r) => sum + r.count, 0)} icon="📝" />
                  {/* You might want to calculate "Due Today" here if needed, based on reviewsOverTime or a dedicated native call */}
                  {/* <StatCard title="Due Today" value={stats.dueCards} icon="⏰" /> */}
                </View>

                {stats.cardsByDeckLevel && Object.keys(stats.cardsByDeckLevel).length > 0 ? (
                  <View style={styles.popularCategoriesContainer}>
                    <Text style={styles.popularCategoriesTitle}>Cards by Deck Level</Text>
                    <View style={styles.categoryChips}>
                      {Object.entries(stats.cardsByDeckLevel).map(([level, count], index) => (
                        <Text key={index} style={styles.categoryChip}>
                          {level}: {count}
                        </Text>
                      ))}
                    </View>
                  </View>
                ) : (
                  <Text style={styles.noDataText}>No cards found across any deck levels.</Text>
                )}
              </View>

              {/* You can add more sections for charts or detailed review history here */}
              {/* For example, a section for reviewsOverTime */}
              {stats.reviewsOverTime.length > 0 ? (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionIcon}>📈</Text>
                    <Text style={styles.sectionTitle}>Review History (Last 30 Days)</Text>
                  </View>
                  {stats.reviewsOverTime.map((review, index) => (
                    <View key={index} style={styles.reviewItem}>
                      <Text style={styles.reviewDate}>{review.date}</Text>
                      <Text style={styles.reviewDetails}>Reviews: {review.count}</Text>
                      <Text style={styles.reviewDetails}>Avg. Ease: {review.avgEase.toFixed(2)}</Text>
                      <Text style={styles.reviewDetails}>Avg. Interval: {review.avgInterval.toFixed(1)} days</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.noDataText}>No review history available for the last 30 days.</Text>
              )}

            </>
          ) : (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>No statistics available.</Text>
              <TouchableOpacity onPress={fetchAndSetStats} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Load Stats</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F9FC', // Light blue-gray background
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E6EBF0',
  },
  backButton: {
    width: 24, // Consistent touch target
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A237E', // Dark blue text
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 800,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 200,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 200,
  },
  errorText: {
    fontSize: 16,
    color: '#D9534F',
    textAlign: 'center',
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 10,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  section: {
    marginBottom: 30,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionIcon: {
    fontSize: 24,
    color: '#1A237E',
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  statCard: {
    backgroundColor: '#EAEFF7',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    justifyContent: 'center',
    width: '48%', // Adjust for two columns
    marginVertical: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statIcon: {
    fontSize: 30,
    marginBottom: 5,
  },
  statTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A237E',
    marginTop: 5,
  },
  popularCategoriesContainer: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#F0F4F8',
    borderRadius: 12,
  },
  popularCategoriesTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  categoryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  categoryChip: {
    backgroundColor: '#D1E7DD', // Light green
    color: '#155724', // Dark green text
    fontSize: 12,
    fontWeight: 'bold',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
  },
  reviewItem: {
    backgroundColor: '#F0F4F8',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  reviewDate: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A237E',
    marginBottom: 5,
  },
  reviewDetails: {
    fontSize: 14,
    color: '#666',
  },
  noDataText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },
});

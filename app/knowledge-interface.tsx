import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Modal, Alert, ScrollView } from 'react-native';
import LingoProMultimodal from 'lingopro-multimodal-module';

// Represents the data structure for the statistics returned from the native module.
interface StatsResult {
  wordsCount: number;
  cardsByDeckLevel: Record<string, number>;
  reviewsOverTime: Array<{
    date: string;
    count: number;
    avgEase: number;
    avgInterval: number;
  }>;
  totalCards: number;
}

export default function KnowledgeInterface() {
  const [stats, setStats] = useState<StatsResult | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // A helper function to call the native module for fetching stats.
  const fetchAndSetStats = async (language = 'en') => {
    setIsLoading(true);
    try {
      const result: StatsResult = await LingoProMultimodal.fetchStats(language);
      setStats(result);
    } catch (error) {
      console.error('Failed to load stats:', error);
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Handler for clearing the database.
  const handleClearDatabase = async () => {
    console.log('Clearing database via native call...');
    setIsLoading(true);
    await LingoProMultimodal.forceInitializeDatabase();
    // After clearing, re-fetch the stats to show an empty state.
    await fetchAndSetStats();
    setShowClearModal(false);
    console.log('Database cleared.');
  };

  // Handler for downloading a database backup.
  const handleDownloadBackup = () => {
    console.log('Download backup button pressed. A native file-saving solution would be implemented here.');
    Alert.alert('Download Initiated', 'A backup file would be saved to your device.');
  };

  // Effect to load initial data and fetch stats when the component mounts.
  useEffect(() => {
    fetchAndSetStats();
  }, []);

  const StatCard = ({ title, value, icon }) => (
    <View style={styles.statCard}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );

  const ActionButton = ({ title, description, onPress, color }) => (
    <TouchableOpacity onPress={onPress} style={[styles.actionButton, { backgroundColor: color }]}>
      <View style={styles.actionButtonContent}>
        <Text style={styles.actionButtonTitle}>{title}</Text>
        <Text style={styles.actionButtonDescription}>{description}</Text>
      </View>
    </TouchableOpacity>
  );

  // UI for a confirmation modal before clearing the database.
  const ClearConfirmationModal = () => (
    <Modal
      animationType="fade"
      transparent={true}
      visible={showClearModal}
      onRequestClose={() => setShowClearModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Confirm Deletion</Text>
            <TouchableOpacity onPress={() => setShowClearModal(false)}>
              <Text style={styles.closeModalButton}>❌</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.modalText}>
            This action will permanently delete all data from your database. This cannot be undone.
            Do you want to proceed?
          </Text>
          <View style={styles.modalFooter}>
            <TouchableOpacity onPress={() => setShowClearModal(false)} style={styles.cancelButton}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleClearDatabase} style={styles.confirmButton}>
              <Text style={styles.confirmButtonText}>Clear Database</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <ScrollView contentContainerStyle={styles.scrollViewContainer}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.headerIcon}>📚</Text>
          <Text style={styles.headerTitle}>Database Stats</Text>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4f46e5" />
          </View>
        ) : stats ? (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>📊</Text>
                <Text style={styles.sectionTitle}>Statistics</Text>
              </View>
              <View style={styles.statsGrid}>
                <StatCard title="Total Words" value={stats.wordsCount} icon="📖" />
                <StatCard title="Total SRS Cards" value={stats.totalCards} icon="🃏" />
                <StatCard title="Reviews Over Time" value={stats.reviewsOverTime.length} icon="📝" />
              </View>
              {stats.cardsByDeckLevel && Object.keys(stats.cardsByDeckLevel).length > 0 && (
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
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Actions</Text>
              <View style={styles.actionButtonsContainer}>
                <ActionButton
                  title="Clear Database"
                  description="Permanently delete all words, cards, and review history."
                  onPress={() => setShowClearModal(true)}
                  color="#dc2626"
                />
                <ActionButton
                  title="Download Backup"
                  description="Export all data to a local JSON file for safekeeping."
                  onPress={handleDownloadBackup}
                  color="#10b981"
                />
              </View>
            </View>
          </>
        ) : (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Failed to load statistics.</Text>
          </View>
        )}

        {showClearModal && <ClearConfirmationModal />}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollViewContainer: {
    flexGrow: 1,
    backgroundColor: '#f0f4f8',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 800,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginBottom: 24,
  },
  headerIcon: {
    fontSize: 32,
    color: '#4f46e5',
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2937',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 256,
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 256,
  },
  errorText: {
    fontSize: 18,
    color: '#ef4444',
  },
  section: {
    marginBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionIcon: {
    fontSize: 24,
    color: '#4f46e5',
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1f2937',
  },
  statsGrid: {
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  statCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    marginBottom: 16,
  },
  statIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  statTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  statValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#4f46e5',
    marginTop: 8,
  },
  popularCategoriesContainer: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#f3f4f6',
    borderRadius: 16,
  },
  popularCategoriesTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#1f2937',
  },
  categoryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  categoryChip: {
    backgroundColor: '#eef2ff',
    color: '#4f46e5',
    fontSize: 12,
    fontWeight: '600',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    overflow: 'hidden',
    marginRight: 8,
    marginBottom: 8,
  },
  actionButtonsContainer: {
    flexDirection: 'column',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    padding: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 16,
  },
  actionButtonContent: {
    alignItems: 'center',
  },
  actionButtonTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  actionButtonDescription: {
    fontSize: 12,
    color: '#d1d5db',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  closeModalButton: {
    fontSize: 20,
    color: '#6b7280',
  },
  modalText: {
    fontSize: 16,
    color: '#4b5563',
    marginBottom: 24,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4b5563',
  },
  confirmButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#dc2626',
    borderRadius: 20,
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});

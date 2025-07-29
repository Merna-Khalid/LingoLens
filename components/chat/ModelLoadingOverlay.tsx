import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

interface ModelLoadingOverlayProps {
  isVisible: boolean;
}

export default function ModelLoadingOverlay({ isVisible }: ModelLoadingOverlayProps) {
  if (!isVisible) return null;

  return (
    <View style={styles.modelLoadingOverlay}>
      <View style={styles.modelLoadingCard}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.modelLoadingTitle}>Loading AI Model</Text>
        <Text style={styles.modelLoadingSubtitle}>Please wait while we prepare the AI...</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modelLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(240, 244, 248, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modelLoadingCard: {
    backgroundColor: '#fff',
    padding: 30,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 200,
  },
  modelLoadingTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 15,
    textAlign: 'center',
  },
  modelLoadingSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
});

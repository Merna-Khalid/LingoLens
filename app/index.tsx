import { LlamaService, LLMS_DIRECTORY } from '@/src/llm/llama.config';
import { Link } from 'expo-router'; // Import Link for navigation
import { initLlama, loadLlamaModelInfo } from 'llama.rn';
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';



export default function LandingScreen() {


  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.headerSection}>
          <Image
            source={{ uri: 'https://placehold.co/80x80/007AFF/FFFFFF?text=A' }}
            style={styles.lingoProIcon}
            accessibilityLabel="LingoLens Icon"
          />
          <Text style={styles.lingoProTitle}>LingoLens</Text>
        </View>

        <Link href="/select-languages" asChild>
          <TouchableOpacity style={styles.chooseLanguageButton}>
            <Text style={styles.chooseLanguageButtonText}>Choose Your Language</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f0f4f8', // Light background color for the entire screen
  },
  container: {
    flex: 1,
    justifyContent: 'center', // Center content vertically
    alignItems: 'center',     // Center content horizontally
    paddingHorizontal: 20,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 60, // More space below the logo for a cleaner look
  },
  lingoProIcon: {
    width: 100, // Slightly larger icon for the landing page
    height: 100,
    borderRadius: 50, // Make it circular
    backgroundColor: '#007AFF', // Example background for the placeholder
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  lingoProTitle: {
    fontSize: 32, // Larger title
    fontWeight: 'bold',
    color: '#333',
  },
  chooseLanguageButton: {
    backgroundColor: '#fff',
    paddingVertical: 18, // Larger padding
    paddingHorizontal: 40,
    borderRadius: 12, // More rounded
    width: '90%', // Wider button
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 }, // More pronounced shadow
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5, // For Android shadow
  },
  chooseLanguageButtonText: {
    fontSize: 18,
    color: '#555',
    fontWeight: '600', // Slightly bolder text
  },
});

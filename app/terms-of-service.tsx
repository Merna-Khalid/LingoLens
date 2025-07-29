import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, BackHandler, Linking, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

export const TERMS_ACCEPTED_KEY = 'gemma_terms_accepted';

export default function TermsOfService() {
  const [isAccepting, setIsAccepting] = useState(false);

  const handleAcceptTerms = async () => {
    setIsAccepting(true);
    try {
      await AsyncStorage.setItem(TERMS_ACCEPTED_KEY, 'true');
      router.replace('/initial-page');
    } catch (error) {
      console.error('Error saving terms acceptance:', error);
      Alert.alert('Error', 'Failed to save your acceptance. Please try again.');
    } finally {
      setIsAccepting(false);
    }
  };

  const handleDeclineTerms = () => {
    BackHandler.exitApp();
  };

  // const showTermsRequiredAlert = () => {
  //   Alert.alert(
  //     'Terms Required',
  //     'You must accept the Terms of Service to use this application.',
  //     [{ text: 'OK' }]
  //   );
  // };

  const openGemmaTerms = () => {
    Linking.openURL('https://ai.google.dev/gemma/terms');
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator>
        <ThemedText type="title" style={styles.title}>
          Terms of Service
        </ThemedText>
        
        <ThemedText type="subtitle" style={styles.subtitle}>
          Gemma Model Usage Agreement
        </ThemedText>

        <ThemedView style={styles.termsContainer}>
          <ThemedText style={styles.termsText}>
            By using this application, you agree to be bound by these Terms of Service, which incorporate by reference the Google Gemma Terms of Use (available at{' '}
            <ThemedText style={styles.linkText} onPress={openGemmaTerms}>
              Google Gemma Terms of Use
            </ThemedText>
            ).
          </ThemedText>

          <ThemedText style={styles.termsText}>
            You acknowledge and agree to the terms and restrictions set forth in the Google Gemma Terms of Use, including but not limited to the Prohibited Use Policy.
          </ThemedText>

          <ThemedText style={styles.termsText}>
            You will not, and will not permit others to, use this application or any functionality powered by the Gemma model for any prohibited uses as described in the Google Gemma Terms of Use.
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.acceptButton, isAccepting && styles.disabledButton]}
            onPress={handleAcceptTerms}
            disabled={isAccepting}
          >
            <ThemedText style={styles.acceptButtonText}>
              {isAccepting ? 'Accepting...' : 'Accept and Continue'}
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.declineButton}
            onPress={handleDeclineTerms}
            disabled={isAccepting}
          >
            <ThemedText style={styles.declineButtonText}>
              Decline
            </ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 30,
    opacity: 0.8,
  },
  termsContainer: {
    backgroundColor: 'rgba(0, 122, 255, 0.05)',
    borderRadius: 12,
    padding: 20,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.2)',
  },
  termsText: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 15,
    textAlign: 'justify',
  },
  linkText: {
    color: '#007AFF',
    textDecorationLine: 'underline',
  },
  buttonContainer: {
    gap: 15,
  },
  acceptButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 3,
  },
  acceptButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  declineButton: {
    backgroundColor: 'transparent',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#dc3545',
  },
  declineButtonText: {
    color: '#dc3545',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
});

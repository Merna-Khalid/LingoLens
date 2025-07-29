// app/index.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { TERMS_ACCEPTED_KEY } from './terms-of-service';


export default function Index() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);

  useEffect(() => {
    checkTermsAcceptance();
  }, []);

  const checkTermsAcceptance = async () => {
    try {
      const termsAccepted = await AsyncStorage.getItem(TERMS_ACCEPTED_KEY);
      setHasAcceptedTerms(termsAccepted === 'true');
    } catch (error) {
      console.error('Error checking terms acceptance:', error);
      setHasAcceptedTerms(false);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!hasAcceptedTerms) {
    return <Redirect href="/terms-of-service" />;
  }

  return <Redirect href="/initial-page" />;
}

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Link } from 'expo-router'; // Import Link for navigation
import { initLlama, loadLlamaModelInfo } from 'llama.rn';
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';



export default function LandingScreen() {
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  console.log("Component Rendered!");
  useEffect(() => {
    const loadModelInfo = async () => {
      try {
        const modelPath = await pickFile();
        console.log('Model Path:', modelPath);
        console.log('Model Info:', await loadLlamaModelInfo(modelPath))
        const stopWords = ['</s>', '<|end|>', '<|eot_id|>', '<|end_of_text|>', '<|im_end|>', '<|EOT|>', '<|END_OF_TURN_TOKEN|>', '<|end_of_turn|>', '<|endoftext|>']


        const context = await initLlama({
          model: modelPath.replace('file://', ''),
          use_mlock: true,
          n_ctx: 2048,
          // embedding: true, // use embedding
        })
        console.log('Model initialized:', context);
        const textResult = await context.completion(
          {
            prompt: 'This is a conversation between user and llama, a friendly chatbot. respond in simple markdown.\n\nUser: Hello!\nLlama:',
            n_predict: 10,
            stop: [...stopWords, 'Llama:', 'User:'],
            // ...other params
          },
          (data) => {
            // This is a partial completion callback
            const { token } = data
          },
        )
        console.log('===Result:', textResult.text)
        console.log('===Timings:', textResult.timings)
        // const stopWords = ['</s>', '<|end|>', '<|eot_id|>', '<|end_of_text|>', '<|im_end|>', '<|EOT|>', '<|END_OF_TURN_TOKEN|>', '<|end_of_turn|>', '<|endoftext|>']
        // Do chat completion
        // const textResult = await context.completion(
        //   {
        //     prompt: 'This is a conversation between user and llama, a friendly chatbot. respond in simple markdown.\n\nUser: Hello!\nLlama:',
        //     n_predict: 100,
        //     stop: [...stopWords, 'Llama:', 'User:'],
        //     // ...other params
        //   },
        //   (data) => {
        //     // This is a partial completion callback
        //     const { token } = data
        //   },
        // )
        // console.log('Result:', textResult.text)

        // console.log('Model Path:', modelPath);
        // const modelInfo = await loadLlamaModelInfo(modelPath.replace('file://', ''));
        // console.log('Model Info:', modelInfo ?? 'null');
        // setInfo(JSON.stringify(modelInfo));
      } catch (error: any) {
        setError(error?.message || JSON.stringify(error));
        console.error('Error loading model info:', error);
      }
    };
    loadModelInfo();
  }, []);
  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: false,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const fileUri = result.assets[0].uri;
      console.log('Picked file URI:', fileUri);
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      console.log('File Info in pick file:', fileInfo);
      if (!fileInfo.exists) {
        return '';
      } else {
        // Copy to app's document directory for native access
        const destPath = FileSystem.documentDirectory + 'model.gguf';
        console.log('1 File copied');
        await FileSystem.copyAsync({ from: fileUri, to: destPath });
        console.log('2 File copied to:', destPath);
        return destPath;
      }
    } else {
      return '';
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.headerSection}>
          <Image
            source={{ uri: 'https://placehold.co/80x80/007AFF/FFFFFF?text=A' }}
            style={styles.lingoProIcon}
            accessibilityLabel="LingoPro Icon"
          />
          <Text style={styles.lingoProTitle}>LingoPro</Text>
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

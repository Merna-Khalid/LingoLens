import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

interface ChatHeaderProps {
  title: string;
  onBack: () => void;
  onShare?: () => void;
  rightComponents?: React.ReactNode[];
}

export default function ChatHeader({ title, onBack, onShare, rightComponents }: ChatHeaderProps) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Icon name="arrow-back" size={24} color="#000" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      {/* <View style=styles.rightActions> */}
      <View >
          {rightComponents && rightComponents.map((component, index) => (
            <React.Fragment key={index}>{component}</React.Fragment>
          ))}
          {onShare && (
            <TouchableOpacity style={styles.shareButton} onPress={onShare}>
              <Text style={styles.shareButtonText}>📤</Text>
            </TouchableOpacity>
          )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  backButton: {
    padding: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  shareButton: {
    padding: 10,
  },
  shareButtonText: {
    fontSize: 20,
    color: '#007AFF',
  },
});

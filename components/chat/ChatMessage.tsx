import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Markdown from 'react-native-markdown-display';
import { ChatMessage as ChatMessageType } from './types';

interface ChatMessageProps {
  message: ChatMessageType;
  onPlayVoiceMessage: (audioUri: string) => void;
  onPlayAiAudio: (text: string) => void;
}

export default function ChatMessage({ message, onPlayVoiceMessage, onPlayAiAudio }: ChatMessageProps) {
  return (
    <View
      style={[
        styles.messageBubble,
        message.sender === 'user' ? styles.userBubble : styles.aiBubble,
      ]}
    >
      {message.imageUrl && (
        <Image 
          source={{ uri: message.imageUrl }} 
          style={styles.messageImage} 
          resizeMode="cover" 
          onError={(e) => console.log('Image Error:', e.nativeEvent.error)} 
        />
      )}
      {message.attachedImageUrl && (
        <Image 
          source={{ uri: message.attachedImageUrl }} 
          style={styles.messageImage} 
          resizeMode="cover" 
          onError={(e) => console.log('Attached Image Error:', e.nativeEvent.error)} 
        />
      )}
      {message.audioUri ? (
        <View style={styles.voiceMessageContainer}>
          <TouchableOpacity
            style={styles.voicePlayButton}
            onPress={() => onPlayVoiceMessage(message.audioUri!)}
          >
            <Icon name="play" size={20} color="#007AFF" />
          </TouchableOpacity>
          <Text style={styles.voiceMessageText}>Voice message</Text>
        </View>
      ) : (
        <Text style={styles.messageText}>
          {message.sender === 'user' ? (
            message.text
          ) : (
            <Markdown>
              {message.text}
            </Markdown>
          )}
        </Text>
      )}
      <View style={styles.messageFooter}>
        {message.sender === 'system' && (
          <TouchableOpacity
            style={styles.playButton}
            onPress={() => onPlayAiAudio(message.text)}
          >
            <Text style={styles.playButtonIcon}>🔊</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.timestamp}>{message.timestamp}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#f1ecf1',
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
  },
  messageText: {
    fontSize: 16,
    color: '#333',
    flexShrink: 1,
  },
  messageImage: {
    width: 150,
    height: 150,
    borderRadius: 10,
    marginBottom: 10,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
    marginTop: 5,
  },
  playButton: {
    padding: 5,
    borderRadius: 15,
    backgroundColor: '#e0e0e0',
  },
  playButtonIcon: {
    fontSize: 16,
    color: '#007AFF',
  },
  timestamp: {
    fontSize: 10,
    color: '#777',
    alignSelf: 'flex-end',
    marginLeft: 8,
  },
  voiceMessageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f4f8',
    borderRadius: 20,
    padding: 10,
    minWidth: 120,
  },
  voicePlayButton: {
    backgroundColor: '#e0eaff',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  voiceMessageText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
});

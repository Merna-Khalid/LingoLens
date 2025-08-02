import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import { ChatMessage as ChatMessageType } from './types';
import Clipboard from '@react-native-clipboard/clipboard';

interface ChatMessageProps {
  message: ChatMessageType;
  isStreaming?: boolean;
  isThinking?: boolean;
  onPlayVoiceMessage: (audioUri: string) => void;
  onPlayAiAudio: (text: string) => void;
  animatePerChar?: boolean;
  onEndAnimatePerChar?: () => void;
}

export default function ChatMessage({
  message,
  isStreaming = false,
  isThinking = false,
  onPlayVoiceMessage,
  onPlayAiAudio,
  animatePerChar = false,
  onEndAnimatePerChar,
}: ChatMessageProps) {
  // Copy to clipboard handler
  const handleCopy = () => {
    Clipboard.setString(message.text);
  };

  // Animated text state for per-character animation
  const [displayedText, setDisplayedText] = useState(animatePerChar ? '' : message.text);
  const prevTextRef = React.useRef('');

  useEffect(() => {
    if (!animatePerChar) {
      setDisplayedText(message.text);
      prevTextRef.current = message.text;
      return;
    }
    // Only animate new characters appended to the message
    const prev = prevTextRef.current;
    if (
      message.text.startsWith(prev) &&
      message.text.length > prev.length
    ) {
      // Animate only the new characters
      const newChars = message.text.slice(prev.length);
      let i = 0;
      const interval = setInterval(() => {
        setDisplayedText((current) => {
          const next = prev + newChars.slice(0, i + 1);
          return next;
        });
        i++;
        if (i >= newChars.length) {
          clearInterval(interval);
          prevTextRef.current = message.text;
          if (onEndAnimatePerChar) onEndAnimatePerChar();
        }
      }, 18); // ~55 chars/sec
      return () => clearInterval(interval);
    } else if (
      message.text.length < prev.length ||
      !message.text.startsWith(prev)
    ) {
      // If message changed in a non-append way, just set it
      setDisplayedText(message.text);
      prevTextRef.current = message.text;
      if (onEndAnimatePerChar) onEndAnimatePerChar();
    }
  }, [message.text, animatePerChar, onEndAnimatePerChar]);

  return (
    <View
      style={[
        styles.messageRow,
        message.sender === 'user' ? styles.rowRight : styles.rowLeft,
      ]}
    >
      {/* Show action buttons on the empty side */}
      {message.sender === 'user' && (
        <View style={styles.actionColumn}>
          {message.audioUri && !isStreaming && (
            <TouchableOpacity
              style={styles.voicePlayButton}
              onPress={() => onPlayVoiceMessage(message.audioUri!)}
            >
              <FontAwesome name="play" size={20} color="#007AFF" />
            </TouchableOpacity>
          )}
          {!message.audioUri && !isStreaming && (
            <TouchableOpacity
              onPress={handleCopy}
              style={styles.iconButton}
              accessibilityLabel="Copy to clipboard"
            >
              <FontAwesome name="copy" size={20} color="#888" />
            </TouchableOpacity>
          )}
        </View>
      )}
      {/* Message bubble and content */}
      <View
        style={[
          styles.messageBubble,
          message.sender === 'user' ? styles.userBubble : styles.aiBubble,
          { alignSelf: message.sender === 'user' ? 'flex-end' : 'flex-start', minWidth: 60, maxWidth: '90%' }, // ensure bubble grows and doesn't crop
        ]}
      >
        {message.imageUrl && (
          <Image
            source={{ uri: message.imageUrl }}
            style={styles.messageImage}
            resizeMode="cover"
            onError={e => console.log('Image Error:', e.nativeEvent.error)}
          />
        )}
        {message.attachedImageUrl && (
          <Image
            source={{ uri: message.attachedImageUrl }}
            style={styles.messageImage}
            resizeMode="cover"
            onError={e => console.log('Attached Image Error:', e.nativeEvent.error)}
          />
        )}
        {message.audioUri ? (
          <Text style={styles.voiceMessageText}>Voice message</Text>
        ) : (
          <View style={styles.textContainer}>
            <Text selectable style={styles.messageText}>
              {animatePerChar ? displayedText : message.text}
            </Text>
          </View>
        )}
        <View style={styles.messageFooter}>
          <Text style={styles.timestamp}>{message.timestamp}</Text>
        </View>
      </View>
      {/* Show action buttons for system messages on the right */}
      {message.sender === 'system' && (
        <View style={styles.actionColumn}>
          {message.audioUri && !isStreaming && (
            <TouchableOpacity
              style={styles.voicePlayButton}
              onPress={() => onPlayVoiceMessage(message.audioUri!)}
            >
              <FontAwesome name="play" size={20} color="#007AFF" />
            </TouchableOpacity>
          )}
          {!message.audioUri && !isStreaming && (
            <TouchableOpacity
              onPress={handleCopy}
              style={styles.iconButton}
              accessibilityLabel="Copy to clipboard"
            >
              <FontAwesome name="copy" size={20} color="#888" />
            </TouchableOpacity>
          )}
          {/* Play TTS for AI text */}
          {message.sender === 'system' && !isStreaming && !isThinking && (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => onPlayAiAudio(message.text)}
            >
              <FontAwesome name="volume-up" size={20} color="#666" />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 10,
    width: '100%',
  },
  rowLeft: {
    justifyContent: 'flex-start',
  },
  rowRight: {
    justifyContent: 'flex-end',
  },
  actionColumn: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    minWidth: 36,
    marginHorizontal: 2,
    gap: 8,
  },
  iconButton: {
    padding: 4,
  },
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
    alignSelf: 'auto',
    minWidth: 60,
    maxWidth: '90%',
  },
  textContainer: {
    flexShrink: 1,
    flexGrow: 1,
    alignSelf: 'stretch',
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
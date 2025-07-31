import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import ChatMessage from './ChatMessage';
import { ChatMessage as ChatMessageType } from './types';

interface MessageListProps {
  messages: ChatMessageType[];
  streamedMessage: ChatMessageType | null;
  aiThinking: boolean;
  onPlayVoiceMessage: (audioUri: string) => void;
  onPlayAiAudio: (text: string) => void;
}

export default React.memo(function MessageList({
  messages,
  streamedMessage,
  aiThinking,
  onPlayVoiceMessage,
  onPlayAiAudio
}: MessageListProps) {
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  return (
    <ScrollView
      ref={scrollViewRef}
      style={styles.chatContainer}
      contentContainerStyle={styles.chatContentContainer}
    >
      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          message={message}
          onPlayVoiceMessage={onPlayVoiceMessage}
          onPlayAiAudio={onPlayAiAudio}
        />
      ))}

      {streamedMessage && (
        <ChatMessage
          key={streamedMessage.id}
          message={streamedMessage}
          onPlayVoiceMessage={onPlayVoiceMessage}
          onPlayAiAudio={onPlayAiAudio}
        />)}
      {aiThinking && (
        <View style={[styles.messageBubble, styles.aiBubble, styles.aiThinkingBubble]}>
          <ActivityIndicator size="small" color="#333" />
          <Text style={styles.timestamp}>AI is thinking...</Text>
        </View>
      )}
    </ScrollView>
  );
})

const styles = StyleSheet.create({
  chatContainer: {
    flex: 1,
  },
  chatContentContainer: {
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
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
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
  },
  aiThinkingBubble: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  timestamp: {
    fontSize: 10,
    color: '#777',
    alignSelf: 'flex-end',
    marginLeft: 8,
  },
});

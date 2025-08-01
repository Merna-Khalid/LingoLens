import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import ChatMessage from './ChatMessage';
import { ChatMessage as ChatMessageType } from './types';

interface MessageListProps {
  messages: ChatMessageType[];
  streamedMessage: ChatMessageType | null;
  isStreamingMessage?: boolean;
  aiThinking: boolean;
  onPlayVoiceMessage: (audioUri: string) => void;
  onPlayAiAudio: (text: string) => void;
}

export default React.memo(function MessageList({
  messages,
  streamedMessage,
  isStreamingMessage,
  aiThinking,
  onPlayVoiceMessage,
  onPlayAiAudio
}: MessageListProps) {
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, [messages, streamedMessage]);

    // Determine if we should show the streamed message
    const shouldShowStreamedMessage = streamedMessage &&
                                   isStreamingMessage &&
                                   !messages.some(msg => msg.id === streamedMessage.id);

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
            isStreaming={isStreamingMessage && message.id === streamedMessage?.id} // Completed messages are never streaming
            isThinking={aiThinking}
            onPlayVoiceMessage={onPlayVoiceMessage}
            onPlayAiAudio={onPlayAiAudio}
          />
        ))}

        {shouldShowStreamedMessage && (
          <ChatMessage
            key={streamedMessage.id}
            message={streamedMessage}
            isStreaming={true}
            isThinking={aiThinking}
            onPlayVoiceMessage={onPlayVoiceMessage}
            onPlayAiAudio={onPlayAiAudio}
          />
        )}

        {aiThinking && (
          <View style={[styles.messageBubble, styles.aiBubble, styles.aiThinkingBubble]}>
            <ActivityIndicator size="small" color="#333" />
            <Text style={styles.timestamp}>AI is thinking...</Text>
          </View>
        )}
      </ScrollView>
    );
  });

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

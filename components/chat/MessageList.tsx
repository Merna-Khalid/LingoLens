import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import ChatMessage from './ChatMessage';
import ChatSuggestions from './ChatSuggestions';
import { ChatMessage as ChatMessageType } from './types';

interface MessageListProps {
  messages: ChatMessageType[];
  streamedMessage: ChatMessageType | null;
  isStreamingMessage?: boolean;
  aiThinking: boolean;
  onPlayVoiceMessage: (audioUri: string) => void;
  onPlayAiAudio: (text: string) => void;
  showSuggestions?: boolean;
  onSuggestionClick?: (suggestion: string) => void;
  isPlayingAudio?: boolean;
  onCancelAudio?: () => void;
}

export default React.memo(function MessageList({
  messages,
  streamedMessage,
  isStreamingMessage,
  aiThinking,
  onPlayVoiceMessage,
  onPlayAiAudio,
  showSuggestions = false,
  onSuggestionClick,
  isPlayingAudio = false,
  onCancelAudio
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
      <View style={{ flex: 1 }}>
        {/* Cancel audio button (red) above input, right side */}
        {isPlayingAudio && (
          <View style={styles.cancelAudioContainer}>
            <TouchableOpacity onPress={onCancelAudio} style={styles.cancelAudioButton}>
              <Icon name="close-circle" size={32} color="#e53935" />
            </TouchableOpacity>
          </View>
        )}
        <ScrollView
          ref={scrollViewRef}
          style={styles.chatContainer}
          contentContainerStyle={styles.chatContentContainer}
        >
          {messages.map((message) => {
            const isStreamed = isStreamingMessage && message.id === streamedMessage?.id;
            return (
              <ChatMessage
                key={message.id}
                message={message}
                isStreaming={isStreamed}
                isThinking={isStreamed ? aiThinking : false}
                onPlayVoiceMessage={onPlayVoiceMessage}
                onPlayAiAudio={onPlayAiAudio}
                animatePerChar={message.sender === 'system'}
              />
            );
          })}

          {shouldShowStreamedMessage && (
            <ChatMessage
              key={streamedMessage.id}
              message={streamedMessage}
              isStreaming={true}
              isThinking={aiThinking}
              onPlayVoiceMessage={onPlayVoiceMessage}
              onPlayAiAudio={onPlayAiAudio}
              // Pass prop to animate per character for system messages
              animatePerChar={true}
            />
          )}

          {aiThinking && (
            // Only show AI is thinking if there is no system message with text
            !(messages.some(m => m.sender === 'system' && m.text && m.text.trim() !== '')) && (
              <View style={[styles.messageBubble, styles.aiBubble, styles.aiThinkingBubble]}>
                <ActivityIndicator size="small" color="#333" />
                <Text style={styles.timestamp}>AI is thinking...</Text>
              </View>
            )
          )}
        </ScrollView>
        {/* Suggestions absolute above input */}
        {showSuggestions && onSuggestionClick && (
          <View style={styles.suggestionsContainer} pointerEvents="box-none">
            <ChatSuggestions onSuggestionClick={onSuggestionClick} />
          </View>
        )}
      </View>
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
  suggestionsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    backgroundColor: '#f0f4f8',
    paddingTop: 10,
    paddingBottom: 8,
  },
  cancelAudioContainer: {
    position: 'absolute',
    right: 10,
    bottom: 70, // above input field
    zIndex: 200,
  },
  cancelAudioButton: {
    backgroundColor: 'transparent',
    borderRadius: 16,
    padding: 2,
  },
});

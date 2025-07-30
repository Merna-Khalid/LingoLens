import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { InputMode } from './types';

// Waveform bar component
const WaveformBar: React.FC<{ height: number }> = ({ height }) => (
  <View style={[styles.waveformBar, { height: Math.max(5, height) }]} />
);

interface MessageInputProps {
  currentMode: InputMode;
  inputText: string;
  selectedImage: string | null;
  isRecording: boolean;
  waveformHeights: number[];
  isModelReady: boolean;
  isLoadingModel: boolean;
  onTextChange: (text: string) => void;
  onSendText: () => void;
  onImageSelect: () => void;
  onRemoveImage: () => void;
  onToggleMode: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

export default function MessageInput({
  currentMode,
  inputText,
  selectedImage,
  isRecording,
  waveformHeights,
  isModelReady,
  isLoadingModel,
  onTextChange,
  onSendText,
  onImageSelect,
  onRemoveImage,
  onToggleMode,
  onStartRecording,
  onStopRecording,
}: MessageInputProps) {
  const isDisabled = !isModelReady || isLoadingModel;

  return (
    <View style={styles.inputAreaContainer}>
      {selectedImage && (
        <View style={styles.imagePreviewContainer}>
          <Image source={{ uri: selectedImage }} style={styles.imagePreview} resizeMode="cover" />
          <TouchableOpacity
            style={styles.removeImageButton}
            onPress={onRemoveImage}
          >
            <Icon name="close" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
      
      {currentMode === 'text' ? (
        <View style={styles.textInputToolbar}>
          <TextInput
            style={styles.textInput}
            placeholder="Type your message..."
            placeholderTextColor="#999"
            value={inputText}
            onChangeText={onTextChange}
            multiline
            returnKeyType="send"
            onSubmitEditing={onSendText}
            editable={isModelReady && !isLoadingModel}
          />
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onImageSelect}
            disabled={isDisabled}
          >
            <Icon name="camera-outline" size={20} color="#007AFF" />
          </TouchableOpacity>
          {inputText.trim() || selectedImage ? (
            <TouchableOpacity
              style={[styles.sendButton, isDisabled && styles.disabledButton]}
              onPress={onSendText}
              disabled={isDisabled}
            >
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.modeToggleButton, isDisabled && styles.disabledButton]}
              onPress={onToggleMode}
              disabled={isDisabled}
            >
              <Text style={styles.modeToggleButtonText}>🎤</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.voiceInputToolbar}>
          <View style={styles.waveformRow}>
            {waveformHeights.map((h, index) => (
              <WaveformBar key={index} height={h} />
            ))}
          </View>

          <View style={styles.controlsRow}>
            <TouchableOpacity
              style={[styles.controlButton, isDisabled && styles.disabledButton]}
              onPress={onToggleMode}
              disabled={isDisabled}
            >
              <Text style={styles.controlIcon}>📝</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.recordButton, isDisabled && styles.disabledButton]}
              onPress={isRecording ? onStopRecording : onStartRecording}
              disabled={isDisabled}
            >
              {isRecording ? (
                <ActivityIndicator size="large" color="#fff" />
              ) : (
                <Text style={styles.recordButtonIcon}>●</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlButton}>
              <Text style={styles.controlIcon}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputAreaContainer: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  textInputToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#f0f4f8',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 16,
    marginRight: 10,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  iconButton: {
    padding: 10,
    marginRight: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceInputToolbar: {
    flex: 1,
    alignItems: 'center',
    marginRight: 10,
  },
  waveformRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    height: 60,
    width: '100%',
    marginBottom: 15,
  },
  waveformBar: {
    width: 4,
    backgroundColor: '#007AFF',
    marginHorizontal: 1,
    borderRadius: 2,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
  },
  controlButton: {
    backgroundColor: '#f0f4f8',
    borderRadius: 30,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlIcon: {
    fontSize: 28,
    color: '#555',
  },
  recordButton: {
    backgroundColor: '#dc3545',
    borderRadius: 40,
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#dc3545',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  recordButtonIcon: {
    fontSize: 40,
    color: '#fff',
  },
  modeToggleButton: {
    backgroundColor: '#e0eaff',
    borderRadius: 30,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  modeToggleButtonText: {
    fontSize: 28,
  },
  disabledButton: {
    opacity: 0.5,
  },
  imagePreviewContainer: {
    position: 'relative',
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 10,
  },
  removeImageButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

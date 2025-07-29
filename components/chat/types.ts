// Define chat message interface
export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'system';
  timestamp: string;
  imageUrl?: string;
  audioUri?: string;
  attachedImageUrl?: string; // For user-attached images in new messages
}

export type InputMode = 'text' | 'voice';

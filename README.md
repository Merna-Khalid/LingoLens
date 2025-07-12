# LingoPro: Language Learning Companion

## Project Overview

LingoPro is a mobile language learning companion built with Expo and React Native. It aims to provide an interactive platform for users to learn new languages, track their progress, and engage with AI models through both voice and text about real-world images.

## Key Features

* **Camera Integration**:
    * A full-screen camera interface for capturing images.
    * Controls for toggling camera facing (front/back) and flash mode (off/on/auto).
    * Saves captured images to a permanent location within the app's file system for persistence.
* **Quick Session Preview**:
    * Displays the captured image for review.
    * Options to "Back" (to camera), "Retake" (to camera), "Chat AI," and "Voice AI."
* **AI-Powered Voice Chat**:
    * Allows users to record voice messages about the captured image.
    * Integrates with Gemma 3n to receive AI responses based on the image context and simulated voice input (text transcript).
    * AI responses are spoken aloud using `expo-speech`.
    * Displays chat messages in a conversational bubble format.
* **AI-Powered Text Chat**:
    * A text-based chat interface for interacting with the AI about the captured image.
    * Users can type messages, and the AI responds using the Gemma 3n.
    * Displays chat messages in a conversational bubble format.
    * `KeyboardAvoidingView` ensures the input field is not obscured by the keyboard.

## Technologies Used

* **Expo**: The framework for building universal React applications.
* **React Native**: For building native mobile UI.
* **Gemma 3n**: For multimodal AI capabilities (image understanding and text generation).

## Setup and Installation

1.  **Clone the Repository (or create a new Expo project):**
    If starting fresh, create a new Expo project with `expo-router` template:
    ```bash
    npx create-expo-app LingoPro --template tabs@latest
    ```

2.  **Install Dependencies:**
    Navigate into your project directory and install all necessary packages:
    ```bash
    cd LingoPro
    npx expo install expo-router @react-native-async-storage/async-storage expo-camera expo-file-system expo-audio expo-speech
    ```

3.  **Place the Code Files:**
    * Ensure `app/_layout.tsx` contains all the `Stack.Screen` entries for the pages: `index`, `select-language`, `select-language-level`, `main-page`, `camera-page`, `quick-session`, `voice-chat`, `text-chat`, and `+not-found`.
    * Create the following files inside your `app/` directory and paste the corresponding code provided in the previous conversations:
        * `app/index.tsx`
        * `app/select-language.tsx`
        * `app/select-language-level.tsx`
        * `app/main-page.tsx`
        * `app/camera-page.tsx`
        * `app/quick-session.tsx`
        * `app/voice-chat.tsx`
        * `app/text-chat.tsx`
## How to Run

1.  **Start the Expo Development Server:**
    It's crucial to clear the cache when adding new files or changing navigation:
    ```bash
    npx expo start --clear
    ```
2.  **Open on Device/Emulator:**
    * Scan the QR code with the Expo Go app on your phone.
    * Press `a` for Android emulator/device.
    * Press `i` for iOS simulator.

## Usage Flow

1.  **Landing Page**: The app starts here. Tap "Choose Your Language."
2.  **Select Language**: Choose a language from the grid. It will be highlighted. Tap "Proceed."
3.  **Select Language Level**: Choose your proficiency level. Tap "Proceed."
4.  **Main Page**: Your selected language and initial progress will be displayed (and persisted locally).
    * Tap the language name to change it.
    * Tap the **Camera Icon** (middle bottom) to open the camera.
5.  **Camera Page**: Capture an image.
    * Grant camera permissions if prompted.
    * Use controls for flash and camera flip.
    * Tap the capture button.
6.  **Quick Session Page**: Preview the captured image.
    * Tap "Chat AI" for text-based interaction.
    * Tap "Voice AI" for voice-based interaction.
7.  **Text Chat / Voice Chat**: Engage with the AI about the image.
    * **Voice Chat**: Tap the red record button to speak.
    * **Text Chat**: Type your message in the input field.

## Future Enhancements

* **Full `expo-audio` Migration**: Complete the migration from `expo-av`'s global audio settings to `expo-audio`'s recommended practices to remove the deprecation warning.
* **Advanced Camera Features**: Implement true low-light "night mode" or other camera filters.
* **Real-time Waveform**: Connect the waveform visualization in Voice Chat to actual audio amplitude data.
* **Chat History Persistence**: Save chat conversations (text and voice transcripts) locally.
* **User Authentication**: Implement user accounts for personalized experiences and cloud synchronization.
* **Learning Modules**: Develop actual language learning content, exercises, and interactive lessons.
* **Progress Tracking**: Implement more sophisticated progress tracking and analytics.
* **Sharing Functionality**: Implement the share button using `expo-sharing`.
* **Voice-to-Text Transcription**: Integrate a robust speech-to-text API for accurate transcription of user's voice messages.
* **UI/UX Refinements**: Continuous improvement of the user interface and experience.
# LingoLens: Multimodal Language Learning Companion

---

## Project Overview

LingoLens is a sophisticated mobile application developed using Expo and React Native, designed to revolutionize language acquisition. It provides users with an immersive and interactive platform that integrates advanced AI capabilities for learning, progress tracking, and real-world language engagement through multimodal interactions.

---

## Key Features

* **Integrated Camera System**:
    * Offers a full-screen camera interface with comprehensive controls for toggling camera orientation (front/rear) and flash modes (off/on/auto).
    * Securely saves captured images to the application's persistent file system.

* **Interactive Session Preview**:
    * Presents a dedicated screen for immediate review of flashcards.
    * SRS for improved learning and AI model integration.

* **AI-Powered Multimodal Chat**:
    * **Text Chat**: Facilitates text-based conversations with the AI regarding the captured image. Utilizes **Gemma 3n** for intelligent text generation.
    * **Image Input**: Model is able to analyze images provided by the user to extract words and input them into the database to be used as flashcards.

---

## What Sets LingoLens Apart

LingoLens differentiates itself from traditional language learning applications through its innovative approach to personalized and context-rich learning:

* **Real-World Context**: Unlike abstract lessons, LingoLens directly connects language learning to your physical environment and personal interests, making the experience more relevant and engaging.
* **Complete Personalization**: The application dynamically adapts not only difficulty levels but also the entire learning content based on your preferences and learning style.
* **Integrated Skill Development**: LingoLens seamlessly combines vocabulary acquisition, grammar rules, and conversational skills into a unified and fluid learning experience.
* **Spaced Repetition System (SRS)**: An intelligent SRS personalizes content, adapts to your performance, and effectively reinforces challenging material through multimodal, context-rich reviews, optimizing retention.

This comprehensive feature set addresses the limitations of conventional language learning apps by providing personalized, context-rich, and immediately applicable language learning experiences.

---

## Technologies Utilized

* **Expo**: A robust framework for building universal React applications, streamlining development and deployment.
* **React Native**: The foundational framework for constructing high-performance, native mobile user interfaces.
* **Gemma 3n**: A cutting-edge multimodal AI model, providing advanced image understanding and natural language generation capabilities.

---

## Getting Started

To set up and run the LingoLens application locally, follow these instructions:

1.  **Install Node Modules:**
    It is recommended to clear the cache when adding new dependencies or modifying navigation structures.
    ```bash
    npm install
    ```

2.  **Run on Device/Emulator:**
    * Ensure you have the Expo Go app installed on your mobile device or an Android emulator/iOS simulator configured.
    * To launch on an **Android** emulator/device:
        ```bash
        npx expo prebuild --clean
        npx expo run:android
        ```
    * To launch on an **iOS** simulator:
        ```bash
        npx expo prebuild --clean
        npx expo run:ios
        ```

---

## Application Usage Flow

1.  **Landing Page**: Initiate your learning journey by tapping "Choose Your Language."
2.  **Language Selection**: Select your desired language from the provided grid. Your choice will be visually highlighted. Proceed by tapping "Proceed."
3.  **Proficiency Level Selection**: Define your current language proficiency level. Confirm your selection by tapping "Proceed."
4.  **Main Page**: This dashboard displays your chosen language and current learning progress, which is automatically persisted locally.
    * To modify your selected language, tap on its name.
    * Access the camera interface by tapping the **Camera Icon** located at the bottom center.
5.  **Camera Page**: Capture an image for contextual learning.
    * Grant necessary camera permissions when prompted.
    * Utilize the on-screen controls for flash management and camera switching.
    * Tap the capture button to take a photo.
6.  **Quick Session Page**: Review your captured image.
    * Select "Chat AI" to engage in a text-based dialogue about the image.
    * Select "Voice AI" to interact with the AI using voice commands.
7.  **Chat Interface (Text/Voice)**: Interact with the AI regarding the image content.
    * **Voice Chat**: Press and hold the red record button to speak your message.
    * **Text Chat**: Type your message into the designated input field.

5.  **Start Session**: SRS learning session.
    * Shows flashcards for review, no flashcards if all is due
    * choose either Learn or Stats tab, there is a deck tab to show all learned words per selected languages.
6.  **Learn Tab**: Select topic to generate contextual story and flashcards.
    * Select a topic from recommended topics based on your knowledge.
    * Type in a topic name of your interest and pick the number of flashcards to be generated.
7.  **Contextual Story Page**: Original story, translated story, and words cards for learning.
    * Listen to the story in learning language TTS, click on highlighted words to learn.
    * See cards of new words.
---

## Technical Challenges & Solutions

Developing LingoLens presented several significant technical hurdles, each requiring innovative engineering solutions:

### Challenge 1: Multimodal Runtime Dilemma

**The Roadblock:**
* Initial success with `llama.cpp` (React Native bindings) was limited by its lack of image support.
* MediaPipe's official support for multimodal capabilities lacked crucial React Native bindings for session configuration controls and multimodal fusion.

**Our Engineering Response:**
* **Custom React Native Bridge**: We developed a custom bridge for MediaPipe's LLM Inference API, enabling seamless integration with React Native.
* **Extended SDK Functionality**: The SDK was extended to support configurable session options (e.g., threads, token limits) and implement adaptive image caching, optimizing data transfer by only sending new images and summarizing previously processed ones.

### Challenge 2: Memory Wall

**The Reality:**
* Despite being a "4-bit" model, Gemma 3n still required approximately 8GB of RAM.
* This high memory requirement led to crashes on budget Android devices (typically with 6GB RAM) during intensive LLM workflows.

**Our Engineering Response:**
* **Image Summarization**: Instead of transmitting the full image with every inference request, we implemented image summarization to reduce the memory footprint.
* **Context Summarization**: Similar to images, conversational context is summarized to limit the memory consumption during inference.
* **Smart Model Session Management**: Guard functions were introduced to manage model sessions efficiently, preventing memory leaks and crashes.
* **Session Job Tracking**: A system for tracking session jobs using pools was developed to further mitigate memory leakage and enhance stability.

### Challenge 3: Agentic Workflow Gap

**The Problem:**
* Existing native solutions lacked support for advanced agentic AI workflows, including:
    * Chain-of-thought prompting
    * Structured JSON output
    * Multi-turn tutoring sequences
    * Native tool usage

**Our Engineering Response:**
* **Context-Aware Batching**: We maintained session state across multiple turns, limiting usage based on the inference engine and model context to prevent device overload.
* **Fallback Mechanisms**: Robust fallback mechanisms were implemented to revert to text-only interactions if image processing encountered issues.
* **Structured Output Enforcement**: Regex-based XML tag parsing was employed to enforce structured JSON output from the model.
* **Tool Integration**: Tools are passed by the model, where each tool consists of a meta-function capable of manipulating the database.
* **Database Operations**: The model can retrieve and add database entries directly via these tool meta-functions.
* **Flexible Tool Usage**: The system supports the invocation of multiple tools within a single message.

### Challenge 4: Consistency of Quality

**The Constraint:**
* Memory limitations restricted the model's input length, posing a challenge to maintaining consistent response quality.

**Our Engineering Response:**
* **Strategic System Prompts**: We utilized carefully crafted system prompts to ensure the model adheres to clear and precise instructions despite input length constraints.


## Planned Enhancements

### Gemma-3n Optimization

* **Dynamic Quantization**: Our goal is to enable runtime switching between 2-bit (for review mode) and 4-bit (for teaching mode) model quantization based on task complexity, optimizing performance and memory usage.
* **Domain-Specific Fine-Tuning**: We plan curriculum-based training with synthetic student interactions (e.g., "Explain calculus like I’m 15") and will partner with educators to anonymize real tutoring sessions for data collection.

### Multimodal Breakthroughs

* **Batch Image Processing v2**: Target support for 5+ images through diffusion-based stitching (merging diagrams/questions into a single context) and attention masking to prioritize relevant image regions (e.g., snapping multiple textbook pages).
* **Real-Time Visual QA**: Develop real-time visual question-answering using MediaPipe + Gemma-3n streaming for live camera input (e.g., "Explain this chemistry lab setup").

### Latency & Memory

* **KV-Caching**: Implement KV-caching to reduce recomputation during sequential token generation.
* **FlashAttention for Mobile**: Experiment with porting optimized attention kernels to TensorFlow Lite for improved performance.
* **Model Swapping Strategy**: Maintain Gemma-3n resident in RAM while dynamically loading and unloading vision models as needed.
* **Attention Mechanisms**: Utilize Multi-Head Attention (MHA), Grouped-Query Attention (GQA), and Multi-Query Attention (MQA) for enhanced efficiency.

### Real-time Voice Tutor

* **Tech Stack**: Leveraging MediaPipe + `whisper.cpp` for Automatic Speech Recognition (ASR), or exploring `llama.cpp` if it gains multimodal support for Gemma-3n.
* **Impact**: This will enable a real-time interactive voice tutor, significantly aiding users in practicing spoken language and improving pronunciation.

---

## Conclusion

1.  **Proven Innovation**:
    We successfully transformed Gemma-3n from a cloud-bound LLM into a fully offline, multimodal tutor by:
    * Engineering custom React Native bindings for MediaPipe to unlock multi-image support.
    * Designing agentic workflows from scratch in the absence of existing libraries.
    * Developing a system that offers a personalized, performance-driven language learning experience tailored to individual user needs.

2.  **Beyond the Technical**:
    LingoLens is more than just a technical achievement; it embodies a commitment to:
    * **Democratized Access**: Empowering students in low-connectivity regions with access to advanced AI tutors.
    * **Privacy-First Design**: Ensuring all processing remains on-device, enabling sensitive educational use cases with enhanced data privacy.
    * **Personalized Learning**: Providing a highly targeted language learning experience, ensuring that every moment spent learning is optimized for the user's desired approach.

---

## References

* [Expo LLM MediaPipe GitHub Repository](https://github.com/tirthajyoti-ghosh/expo-llm-mediapipe)
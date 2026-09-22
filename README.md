# Myraa AI Assistant

Welcome to the **Myraa AI Assistant**, an advanced, interactive AI desktop and web application built with React, Vite, Electron, and Three.js. Myraa goes beyond text-based chat, featuring a fully animated 3D VRM avatar, holographic environments, and real-time multimodal capabilities powered by Google's Gemini AI.

## 🌟 Key Features

*   **Interactive 3D Avatar:** Leverages `@pixiv/three-vrm` and React Three Fiber to render a responsive, fully-animated 3D character (Myraa).
*   **Holographic UI & Visualizers:** Immersive holographic environments and core visualizers designed with Three.js.
*   **Real-time AI Integration:** Built-in WebSocket server (`server.ts`) connecting natively to the Gemini API (`@google/genai`) for real-time inference and voice/text interaction.
*   **Autonomous Browser Agent:** Integrated component allowing the AI to browse the web autonomously to fetch information.
*   **Memory Dashboard:** Persistent memory systems to keep track of conversations, state, and user preferences over time.
*   **Cross-Platform Ready:** Can be run as a modern web application (Vite) or compiled as a standalone desktop app using Electron.
*   **Modern Tech Stack:** React 19, Tailwind CSS v4, Framer Motion, and TypeScript.

## 🛠️ Tech Stack

*   **Frontend Framework:** React 19, Vite
*   **Styling & Animation:** Tailwind CSS, Motion (Framer Motion), Lucide React
*   **3D Rendering:** Three.js, React Three Fiber, React Three Drei
*   **Backend & Networking:** Express, WebSockets (`ws`), TSX
*   **AI Engine:** Google Gemini GenAI SDK
*   **Desktop Environment:** Electron
*   **Database (Optional):** Supabase

## 🚀 Getting Started

### Prerequisites

*   Node.js (v18+)
*   A Gemini API Key from Google AI Studio.

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/yash091122/Myraa-ai-assistant.git
    cd Myraa-ai-assistant
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Configure environment variables:
    *   Rename `.env.example` to `.env`
    *   Add your `GEMINI_API_KEY` to the `.env` file.

### Running the App

**Option 1: Web Browser (Development)**
Starts the Vite frontend and Express WebSocket server.
```bash
npm run dev
```
The app will be available at `http://localhost:5173` (or port specified by Vite) and the backend server runs on `http://localhost:3001`.

**Option 2: Desktop App (Electron)**
Runs the application as a standalone desktop widget using Electron.
```bash
npm run dev:electron
```

## 🏗️ Project Structure

*   `src/`: React frontend code.
    *   `components/`: Reusable UI elements (`VRMAvatar`, `MemoryDashboard`, `BrowserAgent`, etc.)
    *   `lib/`: Utility functions and type definitions (`audio.ts`, `memoryTypes.ts`)
*   `electron/`: Electron desktop application entry points and preloads.
*   `server.ts`: The Express/WebSocket backend responsible for handling Gemini AI Live sessions.
*   `server_memory.ts`: Handles reading/writing the persistent `memories.json` state.
*   `public/`: Static assets, including the `.vrm` 3D model files.

## 📜 License

This project is licensed under the MIT License.

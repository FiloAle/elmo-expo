# Elmo - In-Car Navigation System 🚙💨

The in-car software component of the **Elmo** ecosystem, prototyped for iPad to simulate the vehicle's embedded infotainment system (Front & Rear screens).

## 📖 Overview
This repository contains the source code for the vehicle's main interface. It handles navigation visualization, instrument cluster data, and synchronizes real-time state with passenger devices.

## ✨ Key Features
* **Dual-Role Interface:** Supports two operation modes:
    * **Front Display:** Driver-focused dashboard with speed, navigation instructions, and stop management.
    * **Rear Display:** Passenger view with route progress, ETA, and collaborative suggestions.
* **Ambient Light Control:** Signals directional cues to the connected Arduino-controlled LED strip.
* **Ecosystem Sync:** Acts as the central hub, synchronizing trip data and stop requests with the mobile companion app.
* **Intelligent Routing:** Integrated OpenStreetMap for real-time mapping and POI discovery.
* **Voice Assistant:** Hands-free interaction powered by Llama (via Groq API).

## 🛠️ Tech Stack
* **Framework:** React Native (Expo).
* **Backend & Sync:** Node.js local server for device orchestration.
* **AI & Maps:** Llama LLM (Groq) & OpenStreetMap API.
* * **Weather:** OpenWeather API.

## 🚀 Getting Started
1. Clone the repository.
2. Install dependencies: `npm install`.
3. Ensure the Node.js server is running.
4. Configure the `.env` file with API keys (Groq & OpenWeather as `EXPO_PUBLIC_GROQ_API_KEY` and `EXPO_PUBLIC_OPENWEATHER_API_KEY`).
5. Start the prototype: `npx expo start` (run on iPad Simulator or physical device).

---
*Developed for the "Mobility Futures" exhibition at Politecnico di Milano (2026).*

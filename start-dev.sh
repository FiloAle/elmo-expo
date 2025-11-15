#!/bin/bash

# Start both Expo dev server and Sync server

echo "🚀 Starting Elmo Development Environment..."
echo ""

# Start sync server in background
echo "📡 Starting Sync Server on port 3001..."
cd server && npm start &
SYNC_PID=$!

# Wait for sync server to start
sleep 2

# Start Expo dev server
echo "📱 Starting Expo Dev Server..."
cd ..
npx expo start --dev-client

# Cleanup on exit
trap "kill $SYNC_PID" EXIT

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let currentServerUrl: string = '';

// Initialize socket connection
export function initSyncClient(serverUrl?: string) {
  const url = serverUrl || 'http://192.168.1.78:3001';
  
  // If server URL changed, disconnect and recreate
  if (socket && currentServerUrl !== url) {
    console.log('[Sync] Server URL changed, reconnecting...');
    socket.disconnect();
    socket = null;
  }
  
  if (socket) return socket;
  
  currentServerUrl = url;
  console.log('[Sync] Connecting to server:', url);
  
  socket = io(url, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10
  });
  
  socket.on('connect', () => {
    console.log('[Sync] Connected to sync server');
  });
  
  socket.on('disconnect', () => {
    console.log('[Sync] Disconnected from sync server');
  });
  
  socket.on('connect_error', (error) => {
    console.error('[Sync] Connection error:', error.message);
  });
  
  return socket;
}

// Register device with server
export function registerDevice(carId: string, role: 'main' | 'rear', serverUrl?: string) {
  const client = initSyncClient(serverUrl);
  console.log(`[Sync] Registering as ${carId} (${role})`);
  client.emit('register', { carId, role });
}

// Convoy state management
export interface ConvoyState {
  destination: any;
  waypoints: any[];
  weather: any;
  routeInfo: any;
  navigationState: string;
}

export interface CarState {
  position: any;
  battery: number | null;
  speed: number;
  speedLimit: number | null;
  heading: number;
}

// Hook for convoy state synchronization
export function useConvoySync(initialState: Partial<ConvoyState> = {}) {
  const [convoyState, setConvoyState] = useState<ConvoyState>({
    destination: null,
    waypoints: [],
    weather: null,
    routeInfo: null,
    navigationState: 'idle',
    ...initialState
  });
  
  const client = useRef<Socket | null>(null);
  
  useEffect(() => {
    client.current = initSyncClient();
    
    // Listen for convoy state updates from server
    const handleConvoyState = (state: ConvoyState) => {
      console.log('[Sync] Received convoy state update');
      setConvoyState(state);
    };
    
    client.current.on('convoy:state', handleConvoyState);
    
    return () => {
      client.current?.off('convoy:state', handleConvoyState);
    };
  }, []);
  
  // Function to update convoy state
  const updateConvoy = (updates: Partial<ConvoyState>) => {
    console.log('[Sync] Sending convoy update:', Object.keys(updates));
    client.current?.emit('convoy:update', updates);
  };
  
  return { convoyState, updateConvoy };
}

// Hook for car-specific state synchronization
export function useCarSync(carId: string, initialState: Partial<CarState> = {}) {
  const [carState, setCarState] = useState<CarState>({
    position: null,
    battery: null,
    speed: 0,
    speedLimit: null,
    heading: 0,
    ...initialState
  });
  
  const client = useRef<Socket | null>(null);
  
  useEffect(() => {
    client.current = initSyncClient();
    
    // Listen for car state updates from server
    const handleCarState = (state: CarState) => {
      console.log('[Sync] Received car state update for', carId);
      setCarState(state);
    };
    
    client.current.on('car:state', handleCarState);
    
    return () => {
      client.current?.off('car:state', handleCarState);
    };
  }, [carId]);
  
  // Function to update car state
  const updateCar = (updates: Partial<CarState>) => {
    console.log('[Sync] Sending car update for', carId, ':', Object.keys(updates));
    client.current?.emit('car:update', updates);
  };
  
  return { carState, updateCar };
}

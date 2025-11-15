const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json()); // Enable JSON body parsing for HTTP endpoints

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// State storage
const convoyState = {
  destination: null,
  waypoints: [],
  weather: null,
  routeInfo: null,
  navigationState: 'idle'
};

const carStates = {
  'car1': {
    position: null,
    battery: null,
    speed: 0,
    speedLimit: null,
    heading: 0,
    chatHistory: [],
    range: null
  },
  'car2': {
    position: null,
    battery: null,
    speed: 0,
    speedLimit: null,
    heading: 0,
    chatHistory: [],
    range: null
  }
};

// Connected clients tracking
const clients = new Map(); // ws -> { carId, role }
const connectedRoles = new Map(); // role (e.g. 'car1-main') -> ws

// Helper to broadcast to a specific "room" (filter)
function broadcast(filterFn, message, excludeWs) {
  const msgString = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client === excludeWs) return;
    if (client.readyState === WebSocket.OPEN) {
      const clientData = clients.get(client);
      if (clientData && filterFn(clientData)) {
        client.send(msgString);
      }
    }
  });
}

wss.on('connection', (ws) => {
  console.log('[Server] Client connected');

  ws.on('message', (message) => {
    try {
      const parsedMsg = JSON.parse(message);
      handleMessage(ws, parsedMsg);
    } catch (err) {
      console.error('[Server] Failed to parse message:', err);
    }
  });

  ws.on('close', () => {
    const client = clients.get(ws);
    if (client) {
      const fullRole = `${client.carId}-${client.role}`;
      console.log(`[Server] Client disconnected: ${fullRole}`);
      
      // Remove from connectedRoles if it matches
      if (connectedRoles.get(fullRole) === ws) {
        connectedRoles.delete(fullRole);
        console.log(`[Server] Freed role slot: ${fullRole}`);
      }
      
      clients.delete(ws);
    } else {
      console.log('[Server] Client disconnected');
    }
  });
});

function handleMessage(ws, msg) {
  // Handle device registration
  if (msg.type === 'register') {
    // Dynamic Role Assignment: First come, first served.
    // Order: car1-main -> car1-rear -> car2-main -> car2-rear
    
    let assignedRole = null;
    let assignedCarId = null;
    let assignedRoleSuffix = null;

    const rolesToCheck = [
      { role: 'car1-main', carId: 'car1', suffix: 'main' },
      { role: 'car1-rear', carId: 'car1', suffix: 'rear' },
      { role: 'car2-main', carId: 'car2', suffix: 'main' },
      { role: 'car2-rear', carId: 'car2', suffix: 'rear' }
    ];

    for (const r of rolesToCheck) {
      const existingSocket = connectedRoles.get(r.role);
      // Check if role is free or if the socket is closed/dead
      if (!existingSocket || existingSocket.readyState !== WebSocket.OPEN) {
        assignedRole = r.role;
        assignedCarId = r.carId;
        assignedRoleSuffix = r.suffix;
        break;
      }
    }

    if (!assignedRole) {
      console.log('[Server] All roles taken, rejecting connection');
      // Optionally send error or just close
      return;
    }

    // Register the final role
    console.log(`[Server] Device registered as ${assignedRole}`);
    clients.set(ws, { carId: assignedCarId, role: assignedRoleSuffix });
    connectedRoles.set(assignedRole, ws);

    // Notify client of assigned role
    ws.send(JSON.stringify({ 
      type: 'role_assigned', 
      deviceRole: 'server', 
      data: { assignedRole: assignedRole } 
    }));

    // Send initial state
    ws.send(JSON.stringify({ type: 'convoy:state', data: convoyState, deviceRole: 'server' }));
    
    if (assignedRoleSuffix === 'main' || assignedRoleSuffix === 'rear') {
      ws.send(JSON.stringify({ type: 'car:state', data: carStates[assignedCarId] || {}, deviceRole: 'server' }));
    }
    return;
  }

  // Handle other messages
  const client = clients.get(ws);
  if (!client) return;

  // Map client message types to server logic
  // Client sends: { type, deviceRole, timestamp, data }
  
  console.log(`[Server] Message from ${client.carId}: ${msg.type}`);

  if (msg.type === 'location') {
    // Update car state
    if (!carStates[client.carId]) carStates[client.carId] = {};
    Object.assign(carStates[client.carId], msg.data);
    
    // Broadcast to same car
    broadcast(
      (c) => c.carId === client.carId,
      { type: 'car:state', data: carStates[client.carId], deviceRole: 'server' },
      ws
    );
    
    // Also broadcast location as 'location' type to others if needed?
    // The client expects 'location' messages from other cars?
    // Looking at index.tsx:
    // 1st Car Rear receives: location, destination, waypoints, route...
    // 2nd Car Main receives: destination, waypoints...
    
    // Let's just broadcast the raw message to everyone for simplicity, 
    // clients will filter based on role/logic
    broadcast(() => true, msg, ws);
  }
  else if (['destination', 'waypoints', 'route', 'navigation_info', 'navigation_state', 'waypoint_added', 'request_add_waypoint', 'resume_navigation'].includes(msg.type)) {
    // Update convoy state if it's a convoy property
    if (msg.type === 'destination') convoyState.destination = msg.data;
    if (msg.type === 'waypoints') convoyState.waypoints = msg.data;
    if (msg.type === 'navigation_state') convoyState.navigationState = msg.data.state;
    
    // Broadcast to everyone
    broadcast(() => true, msg, ws);
  }
  else if (msg.type === 'chat_history') {
    // Update car state
    if (!carStates[client.carId]) carStates[client.carId] = {};
    carStates[client.carId].chatHistory = msg.data.messages;
    
    // Broadcast to same car (main + rear)
    broadcast(
      (c) => c.carId === client.carId,
      msg,
      ws
    );
  }
  else if (msg.type === 'range') {
    // Update car state
    if (!carStates[client.carId]) carStates[client.carId] = {};
    carStates[client.carId].range = msg.data.remainingRange;
    
    // Broadcast to same car
    broadcast(
      (c) => c.carId === client.carId,
      msg,
      ws
    );
  }
  else if (msg.type === 'weather') {
     // Weather is technically global/convoy wide usually, but could be car specific if based on location
     // Let's treat it as convoy wide for now as per original plan, or car specific?
     // Plan said "Broadcast Weather from car1-main". 
     // Let's make it convoy wide for simplicity, or just broadcast it.
     convoyState.weather = msg.data;
     broadcast(() => true, msg, ws);
  }
}

// HTTP Endpoints for Polling/Fallback
app.post('/convoy/send', (req, res) => {
  const msg = req.body;
  // Handle message logic (same as WS)
  // For simplicity, we just broadcast it to WS clients
  // In a real polling setup, we'd need a message queue for polling clients
  
  console.log(`[Server] HTTP Send: ${msg.type}`);
  
  // Broadcast to WS clients
  broadcast(() => true, msg);
  
  res.json({ success: true });
});

app.post('/convoy/poll', (req, res) => {
  // Return pending messages? 
  // For now, just return empty or current state if needed
  res.json([]);
});

app.get('/health', (req, res) => {
  res.json({
    status: 'running',
    clients: clients.size,
    convoy: convoyState,
    cars: Object.keys(carStates)
  });
});

const PORT = 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Elmo Sync Server running on port ${PORT}`);
  console.log(`[Server] Listening on all network interfaces (0.0.0.0)`);
  console.log(`[Server] Ready for connections from LAN devices`);
});

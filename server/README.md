# Elmo Sync Server

Real-time synchronization server for multi-device convoy coordination.

## Setup

1. Install dependencies:
```bash
cd server
npm install
```

2. Start the server:
```bash
npm start
```

The server will start on port 3001 and listen on all network interfaces (0.0.0.0).

## API

### Events

**Client → Server:**
- `register` - Register device with carId and role
- `convoy:update` - Update convoy-wide state (destination, waypoints, weather)
- `car:update` - Update car-specific state (position, battery, speed)

**Server → Client:**
- `convoy:state` - Receive convoy state updates
- `car:state` - Receive car-specific state updates

## Health Check

Visit `http://localhost:3001/health` to see server status and connected clients.

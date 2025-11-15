# Convoy Sync Setup Guide

## Configuration Steps

### 1. Start the Sync Server

On your Mac:
```bash
cd server
npm start
```

The server will display its IP address. Note this down (e.g., `192.168.1.78:3001`).

### 2. Configure Each iPad

On each iPad, open the app and:
1. Tap the **Settings** button (gear icon)
2. Tap "Show Developer Options"
3. Scroll to "**Convoy Sync**" section
4. Enter the **Server IP Address** (e.g., `192.168.1.78:3001`)
5. Select the **Device Role**:
   - **1st Car Main** - Primary dashboard (Car 1)
   - **1st Car Rear** - Rear display (Car 1)
   - **2nd Car Main** - Primary dashboard (Car 2)
6. Tap "Close"

### 3. Verify Connection

Check the server terminal for connection messages:
```
[Server] Client connected: xyz123
[Server] Device registered: car1 (main)
```

## What Syncs

### Car 1 Main ↔ Car 1 Rear
**Everything syncs** (full mirror):
- Navigation (destination, waypoints, ETA, distance)
- Position & speed
- Battery level
- Speed limit
- Weather
- Route state

### Car  1 Main ↔ Car 2 Main
**Partial sync** (convoy coordination):
- ✅ Destination
- ✅ Waypoints (can be updated by either car)
- ✅ Weather
- ✅ Route info
- ❌ Position (each car tracks its own)
- ❌ Battery (each car shows its own)
- ❌ Speed/Speed limit (car-specific)

## Troubleshooting

### iPads can't connect
- Ensure all devices are on the **same WiFi network**
- Check the server IP address is correct
- Restart the sync server
- Check firewall isn't blocking port 3001

### Changes not syncing
- Check server terminal for errors
- Verify device role is set correctly
- Try toggling Autopilot off/on to force a sync

### Server not starting
```bash
cd server
npm install  # Reinstall dependencies
npm start
```

## Testing Sync

1. **Set a destination** on Car 1 Main
2. **Check** if it appears on Car 1 Rear (should be identical)
3. **Check** if it appears on Car 2 Main (destination only)
4. **Add a waypoint** on Car 2 Main
5. **Check** if it appears on both Car 1 displays

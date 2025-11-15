import { DeviceRole } from "../components/SettingsModal";

// Types for convoy sync messages
export interface ConvoyLocation {
	latitude: number;
	longitude: number;
	heading?: number;
	speed?: number;
}

export interface ConvoyDestination {
	latitude: number;
	longitude: number;
	name: string;
}

export interface ConvoyWaypoint {
	latitude: number;
	longitude: number;
	name: string;
}

export interface ConvoyRoute {
	coordinates: { latitude: number; longitude: number }[];
	duration: number;
	distance: number;
	legs: { duration: number; distance: number }[];
}

export interface ConvoyNavigationInfo {
	eta: number; // timestamp
	timeLeft: number; // seconds
	distance: number; // meters
	nextStopDistance: number | null;
	nextStopDuration: number | null;
}

export interface ConvoyWeather {
	temp: number;
	code: number;
}

export interface ConvoyChatHistory {
	messages: { role: "user" | "assistant"; content: string }[];
}

export interface ConvoyRange {
	remainingRange: number;
}

export interface ConvoyData {
	type: 
		| "location"
		| "destination"
		| "route"
		| "navigation_info"
		| "weather"
		| "waypoints"
		| "navigation_state"
		| "stop_request"
		| "request_add_waypoint"
		| "waypoint_added"
		| "chat_history"
		| "range"
		| "role_assigned"
		| "resume_navigation";
	deviceRole: DeviceRole;
	timestamp: number;
	data: any;
}

type ConvoyDataCallback = (data: ConvoyData) => void;

class ConvoySync {
	private serverUrl: string | null = null;
	private deviceRole: DeviceRole | null = null;
	private ws: WebSocket | null = null;
	private pollingInterval: number | null = null;
	private listeners: ConvoyDataCallback[] = [];
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 10;
	private reconnectTimeout: number | null = null;
	private isConnecting = false;

	// Initialize convoy sync
	init(serverUrl: string, deviceRole: DeviceRole) {
		if (!serverUrl) {
			console.log("[ConvoySync] No server URL provided, sync disabled");
			return;
		}

		this.serverUrl = serverUrl;
		this.deviceRole = deviceRole;
		this.reconnectAttempts = 0;

		console.log(`[ConvoySync] Initializing as ${deviceRole} with server ${serverUrl}`);
		
		// Try WebSocket first
		this.connectWebSocket();
	}

	// Connect via WebSocket
	private connectWebSocket() {
		if (this.isConnecting || !this.serverUrl) return;

		this.isConnecting = true;
		const wsUrl = this.serverUrl.startsWith("http")
			? this.serverUrl.replace("http", "ws")
			: `ws://${this.serverUrl}`;

		try {
			console.log(`[ConvoySync] Connecting to WebSocket: ${wsUrl}`);
			this.ws = new WebSocket(wsUrl);

			this.ws.onopen = () => {
				console.log("[ConvoySync] WebSocket connected");
				this.isConnecting = false;
				this.reconnectAttempts = 0;

				// Register device role
				this.ws?.send(
					JSON.stringify({
						type: "register",
						deviceRole: this.deviceRole,
					})
				);
			};

			this.ws.onmessage = (event) => {
				try {
					const data: ConvoyData = JSON.parse(event.data);
					this.notifyListeners(data);
				} catch (err) {
					console.error("[ConvoySync] Failed to parse message:", err);
				}
			};

			this.ws.onerror = (error) => {
				console.error("[ConvoySync] WebSocket error:", error);
			};

			this.ws.onclose = () => {
				console.log("[ConvoySync] WebSocket closed");
				this.isConnecting = false;
				this.ws = null;

				// Fall back to polling or reconnect
				if (this.reconnectAttempts < this.maxReconnectAttempts) {
					this.scheduleReconnect();
				} else {
					console.log("[ConvoySync] Max reconnect attempts reached, falling back to polling");
					this.startPolling();
				}
			};
		} catch (err) {
			console.error("[ConvoySync] Failed to create WebSocket:", err);
			this.isConnecting = false;
			this.startPolling();
		}
	}

	// Schedule reconnection with exponential backoff
	private scheduleReconnect() {
		if (this.reconnectTimeout) return;

		this.reconnectAttempts++;
		const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

		console.log(`[ConvoySync] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

		this.reconnectTimeout = setTimeout(() => {
			this.reconnectTimeout = null;
			this.connectWebSocket();
		}, delay) as unknown as number;
	}

	// Fall back to HTTP polling
	private startPolling() {
		if (this.pollingInterval || !this.serverUrl) return;

		console.log("[ConvoySync] Starting HTTP polling (every 2s)");

		this.pollingInterval = setInterval(async () => {
			try {
				const httpUrl = this.serverUrl!.startsWith("http")
					? this.serverUrl
					: `http://${this.serverUrl}`;

				const response = await fetch(`${httpUrl}/convoy/poll`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ deviceRole: this.deviceRole }),
				});

				if (response.ok) {
					const data: ConvoyData[] = await response.json();
					data.forEach((msg) => this.notifyListeners(msg));
				}
			} catch (err) {
				// Silently fail - server might be down
			}
		}, 2000) as unknown as number;
	}

	// Send data to server
	send(type: ConvoyData["type"], data: any) {
		if (!this.serverUrl || !this.deviceRole) {
			console.log("[ConvoySync] Not initialized, cannot send data");
			return;
		}

		const message: ConvoyData = {
			type,
			deviceRole: this.deviceRole,
			timestamp: Date.now(),
			data,
		};

		// Try WebSocket first
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(message));
			console.log(`[ConvoySync] Sent ${type} via WebSocket`);
			return;
		}

		// Fall back to HTTP POST
		this.sendViaHttp(message);
	}

	// Send via HTTP POST
	private async sendViaHttp(message: ConvoyData) {
		if (!this.serverUrl) return;

		try {
			const httpUrl = this.serverUrl.startsWith("http")
				? this.serverUrl
				: `http://${this.serverUrl}`;

			await fetch(`${httpUrl}/convoy/send`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(message),
			});

			console.log(`[ConvoySync] Sent ${message.type} via HTTP`);
		} catch (err) {
			console.error("[ConvoySync] Failed to send via HTTP:", err);
		}
	}

	// Subscribe to incoming data
	onData(callback: ConvoyDataCallback) {
		this.listeners.push(callback);

		// Return unsubscribe function
		return () => {
			this.listeners = this.listeners.filter((cb) => cb !== callback);
		};
	}

	// Notify all listeners
	private notifyListeners(data: ConvoyData) {
		this.listeners.forEach((callback) => {
			try {
				callback(data);
			} catch (err) {
				console.error("[ConvoySync] Listener error:", err);
			}
		});
	}

	// Disconnect and cleanup
	disconnect() {
		console.log("[ConvoySync] Disconnecting");

		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}

		if (this.pollingInterval) {
			clearInterval(this.pollingInterval);
			this.pollingInterval = null;
		}

		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = null;
		}

		this.listeners = [];
		this.serverUrl = null;
		this.deviceRole = null;
	}

	// Get connection status
	isConnected(): boolean {
		return (
			(this.ws !== null && this.ws.readyState === WebSocket.OPEN) ||
			this.pollingInterval !== null
		);
	}
}

// Singleton instance
export const convoySync = new ConvoySync();

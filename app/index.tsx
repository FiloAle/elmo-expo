import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import {
	ExpoSpeechRecognitionModule,
	useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import {
	Alert,
	Platform,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
	Animated,
	Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import MapView, {
	Marker,
	Polyline,
	PROVIDER_DEFAULT,
	Callout,
	MapMarker,
} from "react-native-maps";

import { StopsPanel } from "@/components/StopsPanel";
import { RearLeftPanel } from "@/components/RearLeftPanel";
import { StopAddedNotification } from "@/components/StopAddedNotification";
import { convoySync } from "@/lib/convoySync";
import { FakeRoad } from "../components/FakeRoad";
import { NavigationInfoPanel } from "../components/NavigationInfoPanel";
import { Place, PlacesList } from "../components/PlacesList";
import { RoutePreview } from "../components/RoutePreview";
import { ScenarioModal } from "../components/ScenarioModal";
import {
	DeviceRole,
	RouteOptions,
	SettingsModal,
} from "../components/SettingsModal";
import { Speedometer } from "../components/Speedometer";
import { TopBar } from "../components/TopBar";
import { TurnDirections } from "../components/TurnDirections";
import { askElmoLLM, ChatMsg } from "../lib/elmoClient";
import { PlaceResult, searchPlaces, generatePlaceImage } from "../lib/places";
import { getRoute, RouteResult } from "../lib/routing";
import {
	Maneuver,
	getDistance,
	getBearing,
	getNextManeuverFromRoute,
} from "../lib/navigation";

// --- Types ---
type NavigationState = "idle" | "preview" | "active";

interface RouteWaypoint {
	latitude: number;
	longitude: number;
	name: string;
	category?: string; // Optional category for icons
}

interface NotificationStop {
	stop: RouteWaypoint;
	distance: number;
	duration: number;
}

// Mock Places
const FAVORITE_PLACES = [
	{
		id: "1",
		name: "Home",
		icon: "home" as const,
		address: "Via Luigi Mercantini 1, Milan, Italy",
	},
	{
		id: "2",
		name: "Work",
		icon: "briefcase" as const,
		address: "Via Magenta 15, Busto Garolfo, Italy",
	},
	{
		id: "3",
		name: "Gym",
		icon: "barbell" as const,
		address: "Viale Vincenzo Lancetti 32, Milan, Italy",
	},
];

const getOrdinal = (n: number) => {
	const words = [
		"zeroth",
		"first",
		"second",
		"third",
		"fourth",
		"fifth",
		"sixth",
		"seventh",
		"eighth",
		"ninth",
	];
	if (n < 10 && n >= 0) return words[n];

	const s = ["th", "st", "nd", "rd"];
	const v = n % 100;
	return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const SpeedLimitSign = ({ limit }: { limit: number }) => (
	<View style={styles.speedLimitSign}>
		<View style={styles.speedLimitInner}>
			<Text style={styles.speedLimitText}>{limit}</Text>
		</View>
	</View>
);

export default function App() {
	// --- State ---
	const [userRegion, setUserRegion] = useState<{
		latitude: number;
		longitude: number;
		latitudeDelta: number;
		longitudeDelta: number;
	} | null>({
		latitude: 45.5121490834915,
		longitude: 9.110004203867218,
		latitudeDelta: 0.01,
		longitudeDelta: 0.01,
	});
	const [userHeading, setUserHeading] = useState<number>(0);
	const [speed, setSpeed] = useState<number>(0);
	const [remainingRange, setRemainingRange] = useState<number>(478);

	const [destination, setDestination] = useState<{
		latitude: number;
		longitude: number;
		name: string;
	} | null>(null);

	const [routeCoords, setRouteCoords] = useState<
		{ latitude: number; longitude: number }[]
	>([]);
	const [routeWaypoints, setRouteWaypoints] = useState<RouteWaypoint[]>([]);
	const [routeInfo, setRouteInfo] = useState<RouteResult | null>(null);
	const [weather, setWeather] = useState<{ temp: number; code: number } | null>(
		null
	);

	// Navigation State
	const [nextManeuver, setNextManeuver] = useState<Maneuver | null>(null);

	const [isRecording, setIsRecording] = useState(false);
	const [messages, setMessages] = useState<ChatMsg[]>([]);
	const [inputText, setInputText] = useState("");
	const [isProcessing, setIsProcessing] = useState(false);

	const [navigationState, setNavigationState] = useState<
		"idle" | "preview" | "active"
	>("idle");
	const [isPausedAtStop, setIsPausedAtStop] = useState(false);
	const [shouldAutoStart, setShouldAutoStart] = useState(false);

	// Refs for stale closures
	const navigationStateRef = useRef(navigationState);
	const isTransitioningRef = useRef(false);
	useEffect(() => {
		navigationStateRef.current = navigationState;
	}, [navigationState]);

	const userRegionRef = useRef(userRegion);
	useEffect(() => {
		userRegionRef.current = userRegion;
	}, [userRegion]);

	// Dashboard State
	const [showChat, setShowChat] = useState(false);
	const [showSettings, setShowSettings] = useState(false);
	// Autopilot is always enabled - we only use simulated position
	const autopilotEnabled = true;
	// Native TTS is now default and only option
	const [isMuted, setIsMuted] = useState(false);
	const [currentSpeedLimit, setCurrentSpeedLimit] = useState(50); // Default speed limit
	const [nextStopDistance, setNextStopDistance] = useState<number | null>(null);
	const [nextStopDuration, setNextStopDuration] = useState<number | null>(null);
	const [routeOptions, setRouteOptions] = useState<RouteOptions>({
		avoidTolls: false,
		avoidFerries: false,
		avoidHighways: false,
	});
	const [syncServerUrl, setSyncServerUrl] = useState("192.168.1.78");
	const [deviceRole, setDeviceRole] = useState<DeviceRole>("car1-main");

	// Convoy Sync State
	const [isSyncConnected, setIsSyncConnected] = useState(false);
	const [pendingStopRequest, setPendingStopRequest] = useState<{
		name: string;
		latitude: number;
		longitude: number;
		id?: string;
	} | null>(null);
	const [myStopRequests, setMyStopRequests] = useState<string[]>([]);
	const [declinedStopRequests, setDeclinedStopRequests] = useState<string[]>(
		[]
	);
	const [addedStops, setAddedStops] = useState<string[]>([]);

	// Stops Panel State
	const [showStopsPanel, setShowStopsPanel] = useState(false);
	const [stopsPanelCategory, setStopsPanelCategory] = useState<string | null>(
		null
	);
	const [stopsSearchResults, setStopsSearchResults] = useState<PlaceResult[]>(
		[]
	);
	const [isSearchingStops, setIsSearchingStops] = useState(false);

	// Left Panel State
	const [activeTab, setActiveTab] = useState<"favorites" | "recents">(
		"favorites"
	);
	const [isSearching, setIsSearching] = useState(false);

	// Notification for added stops
	const [notificationStop, setNotificationStop] =
		useState<NotificationStop | null>(null);

	// Testing Scenarios State
	const [activeScenario, setActiveScenario] = useState<null | 1 | 2>(null);
	const [scenarioStep, setScenarioStep] = useState<"modal" | "question">(
		"modal"
	);

	// Voice Overlay States
	const [showVoiceOverlay, setShowVoiceOverlay] = useState(false);
	const [voiceOverlayText, setVoiceOverlayText] = useState("I'm listening...");
	const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
	const selectedPlaceRef = useRef<PlaceResult | null>(null);

	const [voiceOverlayFade] = useState(new Animated.Value(0));
	const [streamingVoiceText, setStreamingVoiceText] = useState<
		string | undefined
	>(undefined);

	const voiceMode = useRef<"standard" | "interactive">("standard");
	const lastTranscript = useRef<string>("");

	// --- Refs ---
	const mapRef = useRef<MapView>(null);
	const currentAudioRef = useRef<Audio.Sound | null>(null);
	const ttsQueue = useRef<
		{
			text: string;
			shouldActivateMic: boolean;
			onDone?: () => void;
			force?: boolean;
		}[]
	>([]);
	const isProcessingTTS = useRef<boolean>(false);
	const locationSubscription = useRef<Location.LocationSubscription | null>(
		null
	);
	const headingSubscription = useRef<Location.LocationSubscription | null>(
		null
	);

	// Autopilot Refs
	const autopilotSpeed = useRef(0); // m/s
	const autopilotIndex = useRef(0); // current index in routeCoords
	const autopilotProgress = useRef(0); // progress between index and index+1 (0-1)
	const lastAutopilotUpdate = useRef(0);
	const autopilotInterval = useRef<any>(null);
	const autopilotEnabledRef = useRef(false);
	const prevAutopilotEnabled = useRef(false);
	const distanceTraveled = useRef(0); // Track total distance traveled for progress bar (cumulative for session)
	const distanceTraveledOnCurrentRoute = useRef(0); // Track distance on current route (resets on reroute)
	const routeInfoRef = useRef<RouteResult | null>(null);
	const lastPausedLegIndex = useRef<number>(-1); // Track last leg index where we paused to avoid loops
	const navigationStartTime = useRef<number | null>(null);

	// Fake Stop Timer Logic Refs
	const hasTriggeredFakeStopRef = useRef(false);
	const addedStopsRef = useRef(addedStops);
	const myStopRequestsRef = useRef(myStopRequests);
	const pendingStopRequestRef = useRef(pendingStopRequest);

	// Keep refs in sync
	useEffect(() => {
		addedStopsRef.current = addedStops;
	}, [addedStops]);
	useEffect(() => {
		myStopRequestsRef.current = myStopRequests;
	}, [myStopRequests]);
	useEffect(() => {
		pendingStopRequestRef.current = pendingStopRequest;
	}, [pendingStopRequest]);

	// Voice Guidance State
	// Format: "lat,lng_distanceStage" -> e.g., "45.5,9.1_250"
	const lastAnnouncement = useRef<string | null>(null);
	const lastSpokenManeuverPoint = useRef<{
		coordinate: { latitude: number; longitude: number };
		type: string;
		stage: string;
	} | null>(null);

	// Start autopilot loop when navigating
	useEffect(() => {
		autopilotEnabledRef.current = autopilotEnabled;
	}, [autopilotEnabled]);

	// Reset to real location when autopilot is disabled
	useEffect(() => {
		if (prevAutopilotEnabled.current && !autopilotEnabled && !isPausedAtStop) {
			// Autopilot was just turned off, reset to real location
			(async () => {
				try {
					const { status } = await Location.getForegroundPermissionsAsync();
					if (status !== "granted") {
						console.log(
							"[App] Location permission not granted, skipping reset to real location"
						);
						return;
					}

					const location = await Location.getCurrentPositionAsync({});
					setUserRegion({
						latitude: location.coords.latitude,
						longitude: location.coords.longitude,
						latitudeDelta: 0.01,
						longitudeDelta: 0.01,
					});
					const realSpeed =
						location.coords.speed && location.coords.speed > 0
							? location.coords.speed * 3.6
							: 0;
					setSpeed(realSpeed);
				} catch (error) {
					console.error("Error resetting to real location:", error);
					setSpeed(0);
				}
			})();
		}
		prevAutopilotEnabled.current = autopilotEnabled;
	}, [autopilotEnabled, isPausedAtStop]);

	// Reset autopilot when route changes
	useEffect(() => {
		autopilotIndex.current = 0;
		autopilotProgress.current = 0;
		// Only reset speed if not already navigating (to prevent stopping when rerouting)
		if (navigationStateRef.current !== "active") {
			autopilotSpeed.current = 0;
		}
		setNextStopDistance(null);
		setNextStopDistance(null);
		setNextStopDuration(null);
		setNextManeuver(null);
		setNextStopDuration(null);
		setNextManeuver(null);

		// Do NOT reset distanceTraveled here, as routeCoords changes when adding a stop.
		// We only reset distanceTraveled when starting a NEW navigation session (startNavigation).
		distanceTraveledOnCurrentRoute.current = 0;
		lastPausedLegIndex.current = -1;
	}, [routeCoords]);

	// Update routeInfoRef
	useEffect(() => {
		routeInfoRef.current = routeInfo;
	}, [routeInfo]);

	// Autopilot Simulation Loop
	useEffect(() => {
		if (
			autopilotEnabled &&
			!isPausedAtStop &&
			navigationState === "active" &&
			routeCoords.length > 1
		) {
			// Start simulation
			if (!autopilotInterval.current) {
				lastAutopilotUpdate.current = Date.now();
				// Find closest point on route to start from if just enabled?
				// For simplicity, if index is 0, we start from start.
				// If we want to resume, we keep the index.

				autopilotInterval.current = setInterval(() => {
					const now = Date.now();
					const dt = (now - lastAutopilotUpdate.current) / 1000; // seconds
					lastAutopilotUpdate.current = now;

					if (dt > 0.5) return; // Skip large jumps (e.g. if app was backgrounded)

					// 1. Calculate Target Speed
					// Look ahead to see if there's a sharp turn
					let targetSpeed = 50 / 3.6; // Default 50 km/h in m/s

					// Simple turn detection: look 3 points ahead
					if (autopilotIndex.current + 3 < routeCoords.length) {
						const p1 = routeCoords[autopilotIndex.current];
						const p2 = routeCoords[autopilotIndex.current + 1];
						const p3 = routeCoords[autopilotIndex.current + 2];

						// Calculate bearings
						const b1 = getBearing(p1, p2);
						const b2 = getBearing(p2, p3);
						const diff = Math.abs(b1 - b2);

						// If turn > 20 degrees, slow down
						if (diff > 20) {
							targetSpeed = 20 / 3.6; // Slow to 20 km/h
						}
					}

					// 2. Update Speed (Physics)
					// Prevent acceleration if we are essentially arrived
					if (autopilotIndex.current >= routeCoords.length - 1) {
						autopilotSpeed.current = 0;
						setSpeed(0); // explicitly force React state update
					} else {
						const currentSpeed = autopilotSpeed.current;
						if (currentSpeed < targetSpeed) {
							// Accelerate (2 m/s^2)
							autopilotSpeed.current = Math.min(
								targetSpeed,
								currentSpeed + 2 * dt
							);
						} else {
							// Decelerate (4 m/s^2)
							autopilotSpeed.current = Math.max(
								targetSpeed,
								currentSpeed - 4 * dt
							);
						}
					}

					// 3. Move
					const distanceToMove = autopilotSpeed.current * dt; // meters

					// Update range (convert meters to km)
					setRemainingRange((prev) =>
						Math.max(0, prev - distanceToMove / 1000)
					);

					// Update total distance traveled (for progress bar)
					distanceTraveled.current += distanceToMove;
					distanceTraveledOnCurrentRoute.current += distanceToMove;

					// Get current segment distance
					const pStart = routeCoords[autopilotIndex.current];
					const pEnd = routeCoords[autopilotIndex.current + 1];

					if (!pStart || !pEnd) {
						// End of route - keep navigation active, just stop moving
						return;
					}

					const segmentDist = getDistance(
						{ latitude: pStart.latitude, longitude: pStart.longitude },
						{ latitude: pEnd.latitude, longitude: pEnd.longitude }
					);

					// Update progress
					const progressIncrement = distanceToMove / segmentDist;
					autopilotProgress.current += progressIncrement;

					// Check if we finished segment
					if (autopilotProgress.current >= 1) {
						autopilotIndex.current++;
						autopilotProgress.current = 0;

						if (autopilotIndex.current >= routeCoords.length - 1) {
							// Arrived
							setSpeed(0);
							autopilotSpeed.current = 0;

							// Force exact 100% progress
							if (routeInfoRef.current) {
								distanceTraveledOnCurrentRoute.current =
									routeInfoRef.current.distance;
							}

							// Force "Arrived" maneuver to keep the panel visible
							setNextManeuver({
								type: "arrive",
								distance: 0,
								coordinate: routeCoords[routeCoords.length - 1],
								angle: 0,
							});
							return;
						}
					}

					// 4. Calculate new position
					const currentPStart = routeCoords[autopilotIndex.current];
					const currentPEnd = routeCoords[autopilotIndex.current + 1];

					const newLat =
						currentPStart.latitude +
						(currentPEnd.latitude - currentPStart.latitude) *
							autopilotProgress.current;
					const newLng =
						currentPStart.longitude +
						(currentPEnd.longitude - currentPStart.longitude) *
							autopilotProgress.current;

					if (isNaN(newLat) || isNaN(newLng)) {
						return;
					}

					// 5. Calculate Bearing for Camera
					const bearing = getBearing(
						{
							latitude: currentPStart.latitude,
							longitude: currentPStart.longitude,
						},
						{ latitude: currentPEnd.latitude, longitude: currentPEnd.longitude }
					);

					// 6. Update State
					setUserRegion({
						latitude: newLat,
						longitude: newLng,
						latitudeDelta: 0.005,
						longitudeDelta: 0.005,
					});
					setUserHeading(bearing);
					setSpeed(autopilotSpeed.current * 3.6); // km/h

					// Use accurate OSRM steps instead of geometric fallback
					const currentRouteInfo = routeInfoRef.current;
					const maneuver = currentRouteInfo
						? getNextManeuverFromRoute(
								currentRouteInfo,
								distanceTraveledOnCurrentRoute.current
						  )
						: null;
					setNextManeuver(maneuver);

					// Calculate leg info
					let currentLegIndex = 0;
					let remainingDistInLeg = 0;
					if (currentRouteInfo) {
						let dist = 0;
						for (let i = 0; i < currentRouteInfo.legs.length; i++) {
							const leg = currentRouteInfo.legs[i];
							if (
								dist + leg.distance >
								distanceTraveledOnCurrentRoute.current
							) {
								currentLegIndex = i;
								remainingDistInLeg =
									dist + leg.distance - distanceTraveledOnCurrentRoute.current;
								break;
							}
							dist += leg.distance;
						}
					}

					// --- Voice Guidance Logic ---
					if (maneuver) {
						const { type, modifier, exit, distance, coordinate } = maneuver;
						const maneuverId = `${coordinate.latitude.toFixed(
							5
						)},${coordinate.longitude.toFixed(5)}`;

						// Helper to speak and record it
						const speak = (text: string, stage: string) => {
							if (deviceRole === "car1-rear") return;
							const key = `${maneuverId}_${stage}`;
							if (lastAnnouncement.current !== key) {
								// Check for spam
								const isSpam =
									lastSpokenManeuverPoint.current &&
									getDistance(
										lastSpokenManeuverPoint.current.coordinate,
										coordinate
									) < 80 &&
									lastSpokenManeuverPoint.current.type === type && // Comparison relying on string equality is fine
									lastSpokenManeuverPoint.current.stage === stage;

								if (!isSpam) {
									playActualTTS(text);

									lastSpokenManeuverPoint.current = {
										coordinate,
										type: type as any,
										stage,
									};
								}
								lastAnnouncement.current = key;
							}
						};

						// Check for Intermediate Arrival
						if (
							currentRouteInfo &&
							currentLegIndex < currentRouteInfo.legs.length - 1 &&
							remainingDistInLeg < 50 &&
							remainingDistInLeg > 0 &&
							currentLegIndex !== lastPausedLegIndex.current
						) {
							const waypointName =
								routeWaypoints[currentLegIndex]?.name || "stop";
							speak(`You have arrived at ${waypointName}`, "leg_arrive");
							setIsPausedAtStop(true);
							setSpeed(0);
							autopilotSpeed.current = 0;
							lastPausedLegIndex.current = currentLegIndex;
						} else {
							if (distance < remainingDistInLeg) {
								// Phrase generation helper
								const getPhrase = (distStr: string) => {
									// Roundabout handling
									if (type === "roundabout" || type === "rotary") {
										if (exit)
											return `${distStr}, at the roundabout take the ${getOrdinal(
												exit
											)} exit`;
										return `${distStr}, enter the roundabout`;
									}

									// Standard turns based on modifier
									const direction = modifier?.replace("_", " "); // e.g. "slight right"
									if (type === "turn" || type === "merge" || type === "fork") {
										if (modifier === "left") return `${distStr}, turn left`;
										if (modifier === "right") return `${distStr}, turn right`;
										if (modifier === "uturn")
											return `${distStr}, make a U-turn`;
										if (modifier && modifier.includes("left"))
											return `${distStr}, keep left`;
										if (modifier && modifier.includes("right"))
											return `${distStr}, keep right`;
									}

									if (type === "arrive")
										return `${distStr}, you will reach your destination`;

									return "";
								};

								// Distance triggers
								let text = "";
								let stage = "";

								if (distance <= 770 && distance > 550) {
									text = getPhrase("In 750 meters");
									stage = "770";
								} else if (distance <= 520 && distance > 300) {
									text = getPhrase("In 500 meters");
									stage = "520";
								} else if (distance <= 270 && distance > 150) {
									text = getPhrase("In 250 meters");
									stage = "270";
								} else if (distance <= 120 && distance > 60) {
									text = getPhrase("In 100 meters");
									stage = "120";
								} else if (distance <= 35) {
									if (type === "roundabout" || type === "rotary") {
										if (exit) text = `Take the ${getOrdinal(exit)} exit`;
										else text = "Enter the roundabout";
									} else if (modifier === "left") text = "Turn left";
									else if (modifier === "right") text = "Turn right";
									else if (modifier === "uturn") text = "Make a U-turn";
									else if (type === "arrive") text = "You have arrived";

									stage = "20";
								}

								if (text) speak(text, stage);
							}
						}
					}

					if (maneuver) {
						const effectiveDistance =
							remainingDistInLeg > 0
								? Math.min(maneuver.distance, remainingDistInLeg)
								: maneuver.distance;

						if (effectiveDistance > 1000 && remainingDistInLeg > 50) {
							const key = `${maneuver.coordinate.latitude.toFixed(
								5
							)},${maneuver.coordinate.longitude.toFixed(5)}_continue`;
							if (lastAnnouncement.current !== key) {
								const km = Math.round(effectiveDistance / 1000);
								const text = `Continue straight for ${km} kilometers`;
								if (deviceRole !== "car1-rear") playActualTTS(text);
								lastAnnouncement.current = key;
							}
						}
					}

					// 7. Update Camera with proper centering
					if (mapRef.current && !selectedPlaceRef.current) {
						mapRef.current.animateCamera(
							{
								center: { latitude: newLat, longitude: newLng },
								heading: bearing,
								pitch: 60,
								zoom: 18,
								altitude: 100, // Required for iOS
							},
							{ duration: 100 }
						); // Smooth update
					}

					// 9. Estimate speed limit based on current speed (simulating road type)
					const speedKmh = autopilotSpeed.current * 3.6;
					let limit = 50;
					if (speedKmh > 90) limit = 130;
					else if (speedKmh > 70) limit = 90;
					else if (speedKmh > 40) limit = 50;
					else limit = 30;

					setCurrentSpeedLimit(limit);
				}, 16); // 60fps
			}
		} else {
			// Stop simulation
			if (autopilotInterval.current) {
				clearInterval(autopilotInterval.current);
				autopilotInterval.current = null;
			}
			autopilotSpeed.current = 0;
		}

		return () => {
			if (autopilotInterval.current) {
				clearInterval(autopilotInterval.current);
				autopilotInterval.current = null;
			}
		};
	}, [
		autopilotEnabled,
		isPausedAtStop,
		navigationState,
		routeCoords,
		deviceRole,
	]);

	// 2. Location Tracking (Real)
	useEffect(() => {
		if (autopilotEnabled) return; // Disable real location updates when autopilot is on

		// Only main screens should track GPS. Rear screens follow main.
		if (deviceRole === "car1-rear" || deviceRole === "car2-rear") return;

		(async () => {
			const { status } = await Location.requestForegroundPermissionsAsync();
			if (status !== "granted") {
				Alert.alert(
					"Permission denied",
					"Allow location access to use the map."
				);
				return;
			}

			const { status: audioStatus } = await Audio.requestPermissionsAsync();
			if (audioStatus !== "granted") {
				Alert.alert(
					"Permission denied",
					"Allow microphone access to talk to Elmo."
				);
			}

			// Initial location
			const location = await Location.getCurrentPositionAsync({});
			setUserRegion({
				latitude: location.coords.latitude,
				longitude: location.coords.longitude,
				latitudeDelta: 0.01,
				longitudeDelta: 0.01,
			});
			setSpeed(
				location.coords.speed && location.coords.speed > 0
					? location.coords.speed * 3.6
					: 0
			); // m/s to km/h

			// Start tracking
			startLocationTracking();
			startHeadingTracking();
		})();

		return () => {
			locationSubscription.current?.remove();
			headingSubscription.current?.remove();
		};
	}, []);

	// Convoy Sync - Initialize and handle data based on device role
	useEffect(() => {
		if (!syncServerUrl) {
			console.log("[ConvoySync] No server URL configured");
			return;
		}

		// Initialize connection
		convoySync.init(syncServerUrl, deviceRole);

		// Set connection status checker
		const statusInterval = setInterval(() => {
			setIsSyncConnected(convoySync.isConnected());
		}, 2000);

		return () => {
			clearInterval(statusInterval);
			convoySync.disconnect();
		};
	}, [syncServerUrl, deviceRole]);

	// Convoy Sync - Subscribe to incoming data
	useEffect(() => {
		if (!syncServerUrl) return; // Only subscribe if sync is initialized

		const unsubscribe = convoySync.onData((data) => {
			console.log(`[ConvoySync] Received ${data.type} from ${data.deviceRole}`);

			// Handle role_assigned globally for any device
			if (data.type === "role_assigned") {
				const assignedRole = data.data.assignedRole;
				if (assignedRole && assignedRole !== deviceRole) {
					console.log(`[App] Role reassigned by server: ${assignedRole}`);
					setDeviceRole(assignedRole);
				}
				return; // Stop processing if it's a role assignment
			}

			// 1st Car Rear - Replicate everything from 1st Main
			if (deviceRole === "car1-rear" && data.deviceRole === "car1-main") {
				switch (data.type) {
					case "location":
						setUserRegion((prev) => ({
							...prev!,
							latitude: data.data.latitude,
							longitude: data.data.longitude,
						}));
						setUserHeading(data.data.heading || 0);
						setSpeed(data.data.speed || 0);

						// Force map to center on new location
						if (isTransitioningRef.current) return; // Skip updates during start animation
						if (selectedPlaceRef.current) return; // Skip updates when viewing a selected place marker

						const isNavigating = navigationStateRef.current === "active";
						const newLoc = {
							latitude: data.data.latitude,
							longitude: data.data.longitude,
						};

						// Calculate distance from current location
						let dist = 0;
						if (userRegionRef.current) {
							dist = getDistance(userRegionRef.current, newLoc);
						}

						// If distance is large (> 500m), jump instantly (e.g. Reset to Default)
						if (dist > 500) {
							mapRef.current?.setCamera({
								center: newLoc,
								heading: data.data.heading || 0,
								pitch: isNavigating ? 60 : 0,
								altitude: isNavigating ? 100 : 1000,
								zoom: isNavigating ? 18 : 17,
							});
						} else {
							// Smooth animation for small movements
							mapRef.current?.animateCamera(
								{
									center: newLoc,
									heading: data.data.heading || 0,
									pitch: isNavigating ? 60 : 0,
									altitude: isNavigating ? 100 : 1000,
									zoom: isNavigating ? 18 : 17,
								},
								{ duration: 1000 }
							); // Smoother animation matching update interval
						}
						break;

						break;

					case "stop_request_declined":
						const declinedName = data.data.name;
						const declinedId = data.data.id;
						// Show declined feedback
						setDeclinedStopRequests((prev) => [...prev, declinedName]);
						setMyStopRequests((prev) =>
							prev.filter(
								(req) =>
									req !== declinedName && (!declinedId || req !== declinedId)
							)
						);

						// Remove from declined list after 3 seconds
						setTimeout(() => {
							setDeclinedStopRequests((prev) =>
								prev.filter((req) => req !== declinedName)
							);
						}, 3000);
						break;

					case "waypoint_added":
						const wp = data.data;
						setAddedStops((prev) => [...prev, wp.id || wp.name]);
						// Remove from pending if it was there (check ID or name)
						setMyStopRequests((prev) =>
							prev.filter((req) => req !== (wp.id || wp.name))
						);
						break;

					case "range":
						setRemainingRange(data.data.remainingRange);
						break;

					case "weather":
						setWeather(data.data);
						break;

					case "chat_history":
						setMessages(data.data.messages);
						break;

					case "destination":
						setDestination(data.data);
						break;

					case "waypoints":
						// Detect if a new waypoint was added (length increased)
						// Ignore if we are the ones who added it (though 'waypoints' message comes from main usually)
						// Actually, if we are Main, we receive from ourselves via re-broadcast? No.
						// If we are Main, we get this from Rear?
						// "1st Car Rear - Replicate everything from 1st Main" -> logic here is for Rear receiving from Main.
						// We need the reverse logic: Main receiving from Rear?
						// Or Main receiving a "waypoints" update in general?

						// Let's implement logical check in the generic listener or separate block.
						console.log(
							`[App] Received waypoints update on ${deviceRole}: ${JSON.stringify(
								data.data
							)}`
						);
						setRouteWaypoints(data.data);
						break;

					case "route":
						setRouteCoords(data.data.coordinates);
						setRouteInfo(data.data);

						// Fit map to route (Preview Mode)
						if (data.data.coordinates.length > 0) {
							mapRef.current?.fitToCoordinates(data.data.coordinates, {
								edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
								animated: true,
							});
						}
						break;

					case "navigation_info":
						setRouteInfo((prev) => ({
							...prev!,
							duration: data.data.timeLeft,
							distance: data.data.distance,
						}));
						setNextStopDistance(data.data.nextStopDistance);
						setNextStopDuration(data.data.nextStopDuration);
						break;

					case "navigation_state":
						setNavigationState(data.data.state);

						if (data.data.state === "active") {
							// Start transition animation
							isTransitioningRef.current = true;
							if (userRegionRef.current) {
								mapRef.current?.animateCamera(
									{
										center: {
											latitude: userRegionRef.current.latitude,
											longitude: userRegionRef.current.longitude,
										},
										heading: userHeading, // Heading might still be stale, but less critical
										pitch: 60,
										altitude: 100,
										zoom: 18,
									},
									{ duration: 1000 }
								);
							}

							setTimeout(() => {
								isTransitioningRef.current = false;
							}, 1000);
						}

						if (data.data.state === "idle") {
							setRouteCoords([]);
							setRouteInfo(null);
							setDestination(null);
							setRouteWaypoints([]);
							setShowStopsPanel(false);
							setAddedStops([]);
							setMyStopRequests([]);
							setDeclinedStopRequests([]);

							// Reset camera to idle view
							if (userRegionRef.current) {
								mapRef.current?.animateCamera(
									{
										center: {
											latitude: userRegionRef.current.latitude,
											longitude: userRegionRef.current.longitude,
										},
										heading: userHeading,
										pitch: 0,
										altitude: 2000,
										zoom: 17,
									},
									{ duration: 1000 }
								);
							}
						}
						break;
				}
			}

			// Catch-all for waypoints updates from ANY other device if we are Main
			if (
				deviceRole === "car1-main" &&
				data.type === "waypoints" &&
				data.deviceRole !== "car1-main"
			) {
				// Check if length increased = new stop added
				const newWaypoints = data.data as RouteWaypoint[];
				if (newWaypoints.length > routeWaypoints.length) {
					const newStop = newWaypoints[newWaypoints.length - 1]; // Assuming appended
					// Calculate estimated distance/time from current location
					let dist = 0;
					if (userRegionRef.current) {
						dist = getDistance(
							{
								latitude: userRegionRef.current.latitude,
								longitude: userRegionRef.current.longitude,
							},
							{ latitude: newStop.latitude, longitude: newStop.longitude }
						);
					}

					// Simple estimate: 50km/h avg speed
					const dur = dist / 13.89;

					setNotificationStop({
						stop: newStop,
						distance: dist,
						duration: dur,
					});

					// TTS Announcement - Use speakText to ensure role checks and queuing
					speakText(`A stop at ${newStop.name} has been added`);

					// Update state
					setRouteWaypoints(newWaypoints);
				}
			}

			// Handle stop requests (Main Car Only)
			if (deviceRole === "car1-main" && data.type === "request_add_waypoint") {
				console.log(
					`[ConvoySync] Received request_add_waypoint: ${data.data.name}`
				);
				// Instead of auto-adding, show the request card
				setPendingStopRequest({
					name: data.data.name,
					latitude: data.data.latitude,
					longitude: data.data.longitude,
					id: data.data.id,
				});
			}

			if (
				deviceRole === "car1-main" &&
				data.type === "stop_request_cancelled"
			) {
				console.log(
					`[ConvoySync] Received stop_request_cancelled: ${data.data.name} (id: ${data.data.id})`
				);
				// Check if this matches our pending request using functional update to avoid stale closure
				setPendingStopRequest((current) => {
					// Match by ID if available (most robust), otherwise fallback to name
					const matchById =
						current?.id && data.data.id && current.id === data.data.id;
					const matchByName = current && current.name === data.data.name;

					if (matchById || matchByName) {
						return null;
					}
					return current;
				});
			}

			// 2nd Car Main - Selective sync
			if (deviceRole === "car2-main" && data.deviceRole === "car1-main") {
				switch (data.type) {
					case "destination":
						// Set same destination
						if (navigationState === "idle") {
							setDestination(data.data);
						}
						break;

					case "waypoints":
						// Set same waypoints if not navigating
						if (navigationState === "idle") {
							setRouteWaypoints(data.data);
						}
						break;

					case "waypoint_added":
						// Show modal for mid-navigation stop addition
						if (navigationState === "active") {
							setPendingStopRequest({
								name: data.data.name,
								latitude: data.data.latitude,
								longitude: data.data.longitude,
							});
						} else {
							// If not navigating, just add it
							setRouteWaypoints((prev) => [...prev, data.data]);
						}
						break;
				}
			}
		});

		return () => {
			unsubscribe();
		};
	}, [syncServerUrl, deviceRole, navigationState, userHeading]);

	// 1st Car Main - Broadcast Range (only on integer change)
	const prevBroadcastRangeRef = useRef<number>(Math.round(remainingRange));
	useEffect(() => {
		if (deviceRole !== "car1-main" || !isSyncConnected) return;

		const currentIntRange = Math.round(remainingRange);
		if (currentIntRange !== prevBroadcastRangeRef.current) {
			convoySync.send("range", { remainingRange: currentIntRange });
			prevBroadcastRangeRef.current = currentIntRange;
		}
	}, [remainingRange, deviceRole, isSyncConnected]);

	// 1st Car Main - Broadcast route changes
	useEffect(() => {
		if (deviceRole !== "car1-main" || !isSyncConnected) return;

		if (routeCoords.length > 0 && routeInfo) {
			convoySync.send("route", {
				coordinates: routeCoords,
				duration: routeInfo.duration,
				distance: routeInfo.legs.reduce((acc, leg) => acc + leg.distance, 0),
				legs: routeInfo.legs,
			});
		}
	}, [routeCoords, routeInfo, deviceRole, isSyncConnected]);

	// Chat history is NOT synced - each device maintains its own chat history

	// Weather Logic (Moved from TopBar)
	const weatherIntervalRef = useRef<number | null>(null);
	const weatherLocationRef = useRef<{
		latitude: number;
		longitude: number;
	} | null>(null);

	// Effect 1: Watch for location and store it once
	useEffect(() => {
		if (userRegion && !weatherLocationRef.current) {
			weatherLocationRef.current = {
				latitude: userRegion.latitude,
				longitude: userRegion.longitude,
			};
		}
	}, [userRegion]);

	// Effect 2: Set up weather fetching
	useEffect(() => {
		const checkInterval = setInterval(() => {
			if (weatherLocationRef.current && !weatherIntervalRef.current) {
				clearInterval(checkInterval);

				const OPENWEATHER_API_KEY = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY;

				if (!OPENWEATHER_API_KEY) {
					console.error("[Weather] OpenWeatherMap API key not found");
					return;
				}

				const fetchWeather = async () => {
					try {
						const loc = weatherLocationRef.current;
						if (!loc) return;

						const url = `https://api.openweathermap.org/data/2.5/weather?lat=${loc.latitude}&lon=${loc.longitude}&appid=${OPENWEATHER_API_KEY}&units=metric`;

						const response = await fetch(url);
						if (!response.ok) return;

						const data = await response.json();

						if (data && data.main && data.weather && data.weather[0]) {
							const newWeather = {
								temp: Math.round(data.main.temp),
								code: data.weather[0].id,
							};
							setWeather(newWeather);

							// Broadcast if car1-main
							if (deviceRole === "car1-main" && isSyncConnected) {
								convoySync.send("weather", newWeather);
							}
						}
					} catch (error) {
						console.error("[Weather] Network error:", error);
					}
				};

				fetchWeather();

				weatherIntervalRef.current = setInterval(() => {
					fetchWeather();
				}, 5 * 60 * 1000);
			}
		}, 1000);

		return () => {
			clearInterval(checkInterval);
			if (weatherIntervalRef.current) {
				clearInterval(weatherIntervalRef.current);
				weatherIntervalRef.current = null;
			}
		};
	}, [deviceRole, isSyncConnected]); // Re-run if role/connection changes to ensure broadcast works, routeCoords, routeInfo]);

	// 1st Car Main - Broadcast destination changes
	useEffect(() => {
		if (deviceRole !== "car1-main" || !isSyncConnected) return;

		if (destination) {
			convoySync.send("destination", destination);
		}
	}, [deviceRole, isSyncConnected, destination]);

	// 1st Car Main - Broadcast waypoints changes
	useEffect(() => {
		if (deviceRole !== "car1-main" || !isSyncConnected) return;

		convoySync.send("waypoints", routeWaypoints);
	}, [deviceRole, isSyncConnected, routeWaypoints]);

	// 1st Car Main - Broadcast navigation state changes
	useEffect(() => {
		if (deviceRole !== "car1-main" || !isSyncConnected) return;

		convoySync.send("navigation_state", { state: navigationState });
	}, [deviceRole, isSyncConnected, navigationState]);

	// 1st Car Main - Broadcast navigation info (every minute)
	useEffect(() => {
		if (deviceRole !== "car1-main" || !isSyncConnected) return;

		const interval = setInterval(() => {
			if (navigationState === "active" && routeInfo) {
				convoySync.send("navigation_info", {
					eta: Date.now() + routeInfo.duration * 1000,
					timeLeft: routeInfo.duration,
					distance: routeInfo.distance,
					nextStopDistance,
					nextStopDuration,
				});
			}
		}, 60000); // Every minute

		return () => clearInterval(interval);
	}, [
		deviceRole,
		isSyncConnected,
		navigationState,
		routeInfo,
		nextStopDistance,
		nextStopDuration,
	]);

	// 2. Location Tracking
	const startLocationTracking = async () => {
		locationSubscription.current = await Location.watchPositionAsync(
			{
				accuracy: Location.Accuracy.BestForNavigation,
				timeInterval: 1000,
				distanceInterval: 1, // Update every meter
			},
			(loc) => {
				// If autopilot is on, ignore real location updates
				if (autopilotEnabledRef.current) return;

				const { latitude, longitude, heading, speed: rawSpeed } = loc.coords;
				setSpeed(rawSpeed && rawSpeed > 0 ? rawSpeed * 3.6 : 0);

				// Update user region state (for logic)
				setUserRegion((prev) => {
					if (!prev) return null;
					return { ...prev, latitude, longitude };
				});

				// Animate Camera
				if (mapRef.current) {
					const cameraHeading = heading ?? 0;
					const pitch = navigationState === "active" ? 45 : 0;
					const altitude = navigationState === "active" ? 300 : 2000; // Lower altitude for nav

					// If active navigation, follow user closely and rotate map
					if (navigationState === "active") {
						mapRef.current.animateCamera(
							{
								center: { latitude, longitude },
								heading: cameraHeading,
								pitch: pitch,
								altitude: altitude,
								zoom: Platform.OS === "android" ? 18 : undefined,
							},
							{ duration: 1000 }
						);
					} else if (navigationState === "idle") {
						// Idle mode: just center, don't rotate aggressively
						// We keep the user centered but maybe not rotated
						// mapRef.current.animateCamera({ center: { latitude, longitude } }, { duration: 1000 });
					}
				}
			}
		);
	};

	// 3. Heading Tracking (Compass)
	const startHeadingTracking = async () => {
		headingSubscription.current = await Location.watchHeadingAsync((obj) => {
			setUserHeading(obj.trueHeading);
			// If we wanted to rotate map based on compass when idle, we could do it here
			// But usually GPS heading (course) is better for driving
		});
	};

	// --- Logic ---

	// Audio feedback for recording
	async function playRecordingBeep(type: "start" | "stop") {
		try {
			// Haptic feedback
			await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

			// Create a simple beep sound
			const frequency = type === "start" ? 800 : 600; // Higher pitch for start, lower for stop
			const duration = 0.1; // 100ms

			// Generate a simple sine wave beep
			const sampleRate = 44100;
			const numSamples = Math.floor(sampleRate * duration);
			const buffer = new ArrayBuffer(44 + numSamples * 2); // WAV header + 16-bit PCM data
			const view = new DataView(buffer);

			// WAV header
			const writeString = (offset: number, str: string) => {
				for (let i = 0; i < str.length; i++) {
					view.setUint8(offset + i, str.charCodeAt(i));
				}
			};

			writeString(0, "RIFF");
			view.setUint32(4, 36 + numSamples * 2, true);
			writeString(8, "WAVE");
			writeString(12, "fmt ");
			view.setUint32(16, 16, true); // fmt chunk size
			view.setUint16(20, 1, true); // PCM format
			view.setUint16(22, 1, true); // mono
			view.setUint32(24, sampleRate, true);
			view.setUint32(28, sampleRate * 2, true); // byte rate
			view.setUint16(32, 2, true); // block align
			view.setUint16(34, 16, true); // bits per sample
			writeString(36, "data");
			view.setUint32(40, numSamples * 2, true);

			// Generate sine wave
			for (let i = 0; i < numSamples; i++) {
				const t = i / sampleRate;
				const envelope = Math.min(1, (numSamples - i) / (sampleRate * 0.02)); // Fade out
				const sample = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.3; // 30% volume
				const intSample = Math.max(
					-32768,
					Math.min(32767, Math.floor(sample * 32767))
				);
				view.setInt16(44 + i * 2, intSample, true);
			}

			// Write to temp file and play
			const beepPath = `${
				FileSystem.Paths.cache.uri
			}beep_${type}_${Date.now()}.wav`;
			const beepFile = new FileSystem.File(beepPath);
			await beepFile.create({ overwrite: true });
			await beepFile.write(new Uint8Array(buffer));

			const { sound } = await Audio.Sound.createAsync(
				{ uri: beepPath },
				{ shouldPlay: true, volume: 0.5 }
			);

			// Clean up after playing
			sound.setOnPlaybackStatusUpdate(async (status) => {
				if (status.isLoaded && status.didJustFinish) {
					await sound.unloadAsync();
					try {
						await beepFile.delete();
					} catch (e) {
						// Ignore cleanup errors
					}
				}
			});
		} catch (err) {
			console.warn("Failed to play recording beep:", err);
		}
	}

	// TTS Playback with Queue
	async function playActualTTS(text: string): Promise<void> {
		// Removed blocking check here; policy is handled in processNextInQueue
		console.log("[TTS] Starting playback for:", text.substring(0, 50));
		return new Promise(async (resolve) => {
			try {
				// Stop any currently playing audio
				if (currentAudioRef.current) {
					await currentAudioRef.current.stopAsync();
					await currentAudioRef.current.unloadAsync();
					currentAudioRef.current = null;
				}

				// Set audio mode for playback
				await Audio.setAudioModeAsync({
					allowsRecordingIOS: false,
					playsInSilentModeIOS: true,
					interruptionModeIOS: 1, // Duck others
					shouldDuckAndroid: true,
				});

				console.log("[TTS] Using native TTS...");
				Speech.speak(text, {
					language: "en-US",
					pitch: 1.0,
					rate: 0.9,
					onDone: () => {
						console.log("[TTS] Native TTS playback complete");
						resolve();
					},
					onError: (error) => {
						console.error("[TTS] Native TTS error:", error);
						resolve();
					},
				});
			} catch (err) {
				console.error("[TTS] Playback error:", err);
				resolve();
			}
		});
	}

	async function processNextInQueue() {
		console.log(
			`[TTS] processNextInQueue called. Queue length: ${ttsQueue.current.length}, isProcessing: ${isProcessingTTS.current}`
		);

		// STRICTLY prevent TTS for rear seat UNLESS forced (replies)
		if (deviceRole === "car1-rear") {
			const nextItem = ttsQueue.current[0];
			if (!nextItem?.force) {
				console.log(
					"[TTS] Device is rear seat, clearing queue and skipping playback (not forced)"
				);
				ttsQueue.current = [];
				isProcessingTTS.current = false;
				return;
			}
		}

		if (isProcessingTTS.current || ttsQueue.current.length === 0) {
			console.log("[TTS] Skipping - already processing or queue empty");
			return;
		}

		isProcessingTTS.current = true;
		const item = ttsQueue.current.shift();

		if (item) {
			if (isMuted) {
				console.log("[TTS] Muted, skipping audio generation");
				isProcessingTTS.current = false;
				if (ttsQueue.current.length > 0) {
					processNextInQueue();
				}
				return;
			}
			await playActualTTS(item.text);

			// Check if we have an onDone callback
			if (item.onDone) {
				// We need to wait for playActualTTS to finish.
				// playActualTTS is async but currently we await it above.
				// However, audio might still be playing if not awaited properly deep down?
				// Assuming await playActualTTS resolves when playback finishes.
				// If playActualTTS uses Sound object, we need to ensure it waits.
				// Let's check playActualTTS implementation...
				// It uses `Speech.speak` (native) or `Audio.Sound`.
				// If native, `Speech.speak` is fire-and-forget unless we trap onDone.
				// But `playActualTTS` logic (lines 1220-1250) handles this?
				// Actually `processNextInQueue` is inside `app/index.tsx`.
				// Let's assume for now we call it after await.
				item.onDone();
			}

			// If this message should activate the mic and we're not already recording
			if (item.shouldActivateMic) {
				console.log("TTS ended with question, will activate mic");
				// Small delay to let the audio finish cleanly
				setTimeout(() => {
					console.log("Activating voice recognition automatically");
					// Need to call this asynchronously
					(async () => {
						try {
							const result =
								await ExpoSpeechRecognitionModule.requestPermissionsAsync();
							if (!result.granted) {
								return;
							}

							await Audio.setAudioModeAsync({
								allowsRecordingIOS: true,
								playsInSilentModeIOS: true,
							});

							setIsProcessing(true);
							ExpoSpeechRecognitionModule.start({
								lang: "en-US",
								interimResults: false,
								maxAlternatives: 1,
								continuous: false,
								requiresOnDeviceRecognition: false,
							});
						} catch (err) {
							console.error("Failed to auto-start speech recognition", err);
							setIsProcessing(false);
						}
					})();
				}, 300);
			}
		}

		isProcessingTTS.current = false;

		// Process next item if any
		if (ttsQueue.current.length > 0) {
			console.log(
				`TTS queue has ${ttsQueue.current.length} remaining items, processing next...`
			);
			processNextInQueue();
		} else {
			console.log("TTS queue empty");
		}
	}

	function speakText(
		text: string,
		options?: { onDone?: () => void; force?: boolean }
	) {
		console.log(`[TTS] Adding to queue: "${text.substring(0, 50)}..."`);
		// Check if text ends with a question mark
		const endsWithQuestion = text.trim().endsWith("?");

		// Add to queue
		ttsQueue.current.push({
			text,
			shouldActivateMic: endsWithQuestion,
			onDone: options?.onDone,
			force: options?.force,
		});

		console.log(
			`[TTS] Queue length: ${ttsQueue.current.length}, isProcessing: ${isProcessingTTS.current}`
		);
		// Trigger processing
		processNextInQueue();
	}

	// Speech recognition event handlers
	useSpeechRecognitionEvent("start", () => {
		setIsRecording(true);
		playRecordingBeep("start");
	});

	useSpeechRecognitionEvent("end", () => {
		setIsRecording(false);
		setIsProcessing(false); // Ensure processing stops if recognition ends unexpectedly
		playRecordingBeep("stop");

		if (voiceMode.current === "interactive" && lastTranscript.current) {
			setVoiceOverlayText("I'm thinking...");
			handleVoiceInput(lastTranscript.current);
			lastTranscript.current = ""; // Reset
		} else if (voiceMode.current === "standard" && lastTranscript.current) {
			// Submit for standard mode (rear seat)
			handleVoiceInput(lastTranscript.current);
			lastTranscript.current = "";
			setStreamingVoiceText(undefined);
		} else if (voiceMode.current === "interactive") {
			// Closed without input
			closeVoiceOverlay();
		}
	});

	useSpeechRecognitionEvent("result", (event) => {
		const transcript = event.results[0]?.transcript;
		if (transcript) {
			if (voiceMode.current === "interactive") {
				setVoiceOverlayText(transcript);
				lastTranscript.current = transcript;
				// We wait for 'end' event to submit
			} else if (voiceMode.current === "standard") {
				setStreamingVoiceText(transcript);
				lastTranscript.current = transcript;
			} else {
				// Fallback for immediate submit if not streaming (shouldn't happen with interim=true)
				// handleVoiceInput(transcript);
			}
		}
	});

	useSpeechRecognitionEvent("error", (event) => {
		console.error("Speech recognition error:", event.error);
		setIsRecording(false);
		setIsProcessing(false);
	});

	async function startVoiceRecognition() {
		if (isRecording || isProcessing) return;
		voiceMode.current = "standard"; // Default mode

		try {
			const result =
				await ExpoSpeechRecognitionModule.requestPermissionsAsync();
			if (!result.granted) {
				Alert.alert("Permission needed", "Please allow microphone access");
				return;
			}

			// Set audio mode for recording (needed for microphone access)
			await Audio.setAudioModeAsync({
				allowsRecordingIOS: true,
				playsInSilentModeIOS: true,
			});

			setIsProcessing(true);
			ExpoSpeechRecognitionModule.start({
				lang: "en-US",
				interimResults: true,
				maxAlternatives: 1,
				continuous: false,
				requiresOnDeviceRecognition: false,
			});
		} catch (err) {
			console.error("Failed to start speech recognition", err);
			setIsProcessing(false);
		}
	}

	function stopVoiceRecognition() {
		ExpoSpeechRecognitionModule.stop();
		// State updates will be handled by the 'end' event listener
	}

	async function startInteractiveVoice() {
		if (isRecording || isProcessing) return;

		// Setup Overlay
		voiceMode.current = "interactive";
		setVoiceOverlayText("I'm listening...");
		setShowVoiceOverlay(true);
		Animated.timing(voiceOverlayFade, {
			toValue: 1,
			duration: 300,
			useNativeDriver: true,
		}).start();

		// Start Recognition concurrently
		try {
			const result =
				await ExpoSpeechRecognitionModule.requestPermissionsAsync();
			if (!result.granted) {
				Alert.alert("Permission needed", "Please allow microphone access");
				closeVoiceOverlay();
				return;
			}

			await Audio.setAudioModeAsync({
				allowsRecordingIOS: true,
				playsInSilentModeIOS: true,
			});

			// setIsProcessing(true); // 'start' event will handle recording state
			// But checking isProcessing prevents double start?
			// In original code (line 1427) it set setIsProcessing(true).
			setIsProcessing(true);

			ExpoSpeechRecognitionModule.start({
				lang: "en-US",
				interimResults: true, // Need partials for "word by word"
				maxAlternatives: 1,
				continuous: false,
				requiresOnDeviceRecognition: false,
			});
		} catch (err) {
			console.error("Failed to start interactive voice", err);
			closeVoiceOverlay();
		}
	}

	function handleManualCloseVoice() {
		stopVoiceRecognition(); // Stop listening
		closeVoiceOverlay(); // Close UI
		setIsProcessing(false); // Reset generic processing state
	}

	function closeVoiceOverlay() {
		Animated.timing(voiceOverlayFade, {
			toValue: 0,
			duration: 300,
			useNativeDriver: true,
		}).start(() => {
			setShowVoiceOverlay(false);
			setVoiceOverlayText("I'm listening...");
		});
	}

	async function handleVoiceInput(transcript: string) {
		setIsProcessing(true);
		// Add user message optimistically
		setMessages((prev) => [
			...prev,
			{ role: "user" as const, content: transcript, sender: deviceRole },
		]);

		if (!userRegion) {
			setMessages((prev) => [
				...prev,
				{
					role: "assistant",
					content: "I need your location to help you.",
					target: deviceRole,
				},
			]);
			setIsProcessing(false);
			return;
		}

		const response = await askElmoLLM(
			transcript,
			messages, // Pass current messages including the new user message
			{
				latitude: userRegion.latitude,
				longitude: userRegion.longitude,
				humanReadable: undefined,
				destination: destination
					? {
							name: destination.name,
							latitude: destination.latitude,
							longitude: destination.longitude,
					  }
					: undefined,
			},
			deviceRole
		);

		await processLLMResponse(response, deviceRole);
		setIsProcessing(false);
	}

	async function processLLMResponse(
		response: any,
		targetRole: string = "car1-main"
	) {
		let autoStartFromPhrase = false;
		let shouldStartLocal = shouldAutoStart;

		// 1. Show Reply FIRST (Immediate Feedback)
		if (response.reply) {
			setMessages((prev) => [
				...prev,
				{
					role: "assistant",
					content: response.reply,
					target: targetRole,
				},
			]);

			if (voiceMode.current === "interactive") {
				setVoiceOverlayText(response.reply);
				setTimeout(() => {
					closeVoiceOverlay();
				}, 5000);
			}

			if (targetRole === deviceRole || targetRole === "all") {
				speakText(response.reply, {
					onDone:
						voiceMode.current === "interactive" ? closeVoiceOverlay : undefined,
					force: deviceRole === "car1-rear",
				});
			}

			if (response.reply.toLowerCase().includes("driving you there")) {
				autoStartFromPhrase = true;
				shouldStartLocal = true;
			}
		}

		// 2. Handle Navigation/Search Intent
		const nav = response.navigation;
		let targetLat: number | undefined;
		let targetLng: number | undefined;
		let targetName = nav?.destinationName;
		let routeFound = false;

		if (nav?.searchQuery && userRegion) {
			const places = await searchPlaces(
				nav.searchQuery,
				userRegion.latitude,
				userRegion.longitude
			);
			if (places.length > 0) {
				// If main driver, we pick the best match to auto-start later
				if (deviceRole !== "car1-rear") {
					const best = places[0];
					targetLat = best.latitude;
					targetLng = best.longitude;
					targetName = best.name;
					setShouldAutoStart(true);
					shouldStartLocal = true;
				} else {
					// REAR SEAT: Append a NEW message with the places
					speakText("Here's what I've found.", { force: true });
					setMessages((prev) => [
						...prev,
						{
							role: "assistant",
							content: "Here's what I've found.",
							places: places.slice(0, 5),
							target: targetRole,
						},
					]);
				}
			}
		}

		// Prepare Navigation Logic if needed (already handled search above)
		if (nav) {
			if (nav.cancel) {
				cancelNavigation();
				return;
			}

			// If it was a search for REAR seat, we are DONE here (places shown in chat)
			if (nav.searchQuery && deviceRole === "car1-rear") {
				setIsProcessing(false);
				setShouldAutoStart(false);
				shouldStartLocal = false;
				return;
			}

			// Proceed with other nav types (Explicit Coords, Geocoding) if no search target yet
			if (!targetLat && !targetLng) {
				if (nav.coordinates) {
					targetLat = nav.coordinates.latitude;
					targetLng = nav.coordinates.longitude;
					targetName = nav.destinationName || "Destination";
				} else if (nav.destinationName && !nav.searchQuery) {
					// Only geocode if NOT a search query (search query already handled above)
					const geocoded = await Location.geocodeAsync(nav.destinationName);
					if (geocoded.length > 0) {
						targetLat = geocoded[0].latitude;
						targetLng = geocoded[0].longitude;
						targetName = nav.destinationName;
					}
				}
			}
			// 3. Calculate Route if we have a target

			// 3. Calculate Route if we have a target
			if (targetLat && targetLng) {
				// REAR SEAT: If we have a destination but not a route yet, show it as a Place Marker
				if (deviceRole === "car1-rear" && !nav.startNavigation && userRegion) {
					const dist = getDistance(userRegion, {
						latitude: targetLat,
						longitude: targetLng,
					});
					const placeResult: PlaceResult = {
						id: `nav-result-${Date.now()}`,
						name: targetName || "Destination",
						latitude: targetLat,
						longitude: targetLng,
						distance: Math.round(dist),
						image: generatePlaceImage(
							targetName || "Destination",
							"landmark exterior"
						),
						address: targetName, // Fallback
					};

					setSelectedPlace(placeResult);
					if (mapRef.current) {
						mapRef.current.animateCamera(
							{
								center: {
									latitude: targetLat,
									longitude: targetLng,
								},
								zoom: 16,
								pitch: 45,
							},
							{ duration: 1000 }
						);
					}
					setIsProcessing(false);
					return;
				}

				setDestination({
					latitude: targetLat,
					longitude: targetLng,
					name: targetName || "Destination",
				});

				// Handle Waypoints
				const waypointsForRoute: RouteWaypoint[] = [];
				if (nav.waypoints) {
					for (const wp of nav.waypoints) {
						let wpLat = wp.coordinates?.[0];
						let wpLng = wp.coordinates?.[1];

						if (!wpLat || !wpLng) {
							const geocoded = await Location.geocodeAsync(wp.name);
							if (geocoded.length > 0) {
								wpLat = geocoded[0].latitude;
								wpLng = geocoded[0].longitude;
							}
						}

						if (wpLat && wpLng) {
							waypointsForRoute.push({
								latitude: wpLat,
								longitude: wpLng,
								name: wp.name,
							});
						}
					}
				}
				setRouteWaypoints(waypointsForRoute);

				const route = await getRoute(
					[userRegion!.latitude, userRegion!.longitude],
					[targetLat, targetLng],
					waypointsForRoute.map((wp) => ({
						coordinates: [wp.latitude, wp.longitude],
					})),
					routeOptions
				);

				if (route) {
					setRouteCoords(route.coordinates);
					setRouteInfo(route);
					routeFound = true;

					// ONLY announce distance for search queries ("nearest X"), not explicit destinations
					if (nav.searchQuery && targetName) {
						const distanceInMeters = route.distance;

						// Round meters first to handle edge cases like 996m -> 1000m
						const roundedMeters = Math.round(distanceInMeters / 10) * 10;

						let distanceText;

						if (roundedMeters < 1000) {
							// Show in meters (rounded to nearest 10) for distances less than 1km
							distanceText = `${roundedMeters} meter${
								roundedMeters !== 10 ? "s" : ""
							}`;
						} else {
							// Show in kilometers for 1km and above
							const km = (roundedMeters / 1000).toFixed(1);
							distanceText = `${km} kilometer${km !== "1.0" ? "s" : ""}`;
						}

						const foundMsg = `I've found ${targetName} at ${distanceText}. I'm now driving you there.`;
						setMessages((prev) => [
							...prev,
							{ role: "assistant", content: foundMsg, target: targetRole },
						]);

						// Speak the found message (non-blocking)
						if (targetRole === deviceRole) {
							speakText(foundMsg);
						}
					}
				}
			}

			// 4. Determine State
			if (routeFound) {
				if (
					(shouldStartLocal || nav.startNavigation) &&
					targetRole !== "car1-rear"
				) {
					startNavigation();
					setShouldAutoStart(false); // Reset flag
				} else {
					setNavigationState("idle"); // Changed from "preview" to "idle"
					// Fit map to route
					if (mapRef.current && targetLat && targetLng) {
						mapRef.current.fitToCoordinates(
							[
								{
									latitude: userRegion!.latitude,
									longitude: userRegion!.longitude,
								},
								{ latitude: targetLat, longitude: targetLng },
							],
							{
								edgePadding: { top: 150, right: 50, bottom: 150, left: 50 },
								animated: true,
							}
						);
					}
				}
			} else if (nav.startNavigation) {
				// User confirmed a previous route or just said "start"
				if (targetRole === "car1-rear") {
					console.warn(
						"Ignored startNavigation command from rear seat (blocked by policy)"
					);
				} else {
					startNavigation();
				}
			}
		}
	}

	// We need to handle both empty args (from input field submit) and string args (from suggestion clicks)
	// TextInput.onSubmitEditing passes an event, while our suggestion click passes a string.
	async function handleTextSubmit(arg?: any) {
		let textToUse = inputText;

		if (typeof arg === "string") {
			console.log("[App] handleTextSubmit called with string arg:", arg);
			textToUse = arg;
		} else if (arg && arg.nativeEvent && arg.nativeEvent.text) {
			// Handle native event from TextInput
			console.log(
				"[App] handleTextSubmit called with event:",
				arg.nativeEvent.text
			);
			textToUse = arg.nativeEvent.text;
		} else {
			console.log(
				"[App] handleTextSubmit called with no/unknown arg, using state:",
				inputText
			);
		}

		if (!textToUse.trim() || !userRegion) {
			console.warn("[App] Submission rejected. Text empty or no region.");
			return;
		}

		const text = textToUse.trim();

		// Only clear the input field if we used the input field's state
		if (textToUse === inputText) {
			setInputText("");
		}

		// Add user message
		const newMsgs = [
			...messages,
			{ role: "user" as const, content: text, sender: deviceRole },
		];
		setMessages(newMsgs);

		const response = await askElmoLLM(text, newMsgs, {
			latitude: userRegion.latitude,
			longitude: userRegion.longitude,
			humanReadable: undefined,
			destination: destination
				? {
						name: destination.name,
						latitude: destination.latitude,
						longitude: destination.longitude,
				  }
				: undefined,
		});

		await processLLMResponse(response, deviceRole);
	}

	// Ref to hold the latest addStopDuringNavigation function to avoid stale closures in listeners
	const addStopRef = useRef(addStopDuringNavigation);
	useEffect(() => {
		addStopRef.current = addStopDuringNavigation;
	});

	// Add a stop during active navigation (for 1st car main and 2nd car main when accepting request)
	async function addStopDuringNavigation(
		stopName: string,
		stopLat: number,
		stopLng: number,
		id?: string
	) {
		// If car1-rear, send request to main instead of adding locally
		// We do this BEFORE checking userRegion/destination because rear might just be a remote control
		if (deviceRole === "car1-rear" && isSyncConnected) {
			console.log(
				`[App] Sending request_add_waypoint: ${stopName} (id: ${id})`
			);
			convoySync.send("request_add_waypoint", {
				name: stopName,
				latitude: stopLat,
				longitude: stopLng,
				id: id,
			});
			// Track local pending request using ID if available, otherwise name
			setMyStopRequests((prev) => [...prev, id || stopName]);
			return;
		}

		if (!userRegion || !destination) return;

		// Add waypoint before  destination
		const newWaypoint = {
			latitude: stopLat,
			longitude: stopLng,
			name: stopName,
			id: id,
		};

		setRouteWaypoints((prev) => [...prev, newWaypoint]);

		// Recalculate route with new waypoint
		const allWaypoints = [...routeWaypoints, newWaypoint];

		const route = await getRoute(
			[userRegion.latitude, userRegion.longitude],
			[destination.latitude, destination.longitude],
			allWaypoints.map((wp) => ({ coordinates: [wp.latitude, wp.longitude] })),
			routeOptions
		);

		if (route) {
			setRouteCoords(route.coordinates);
			setRouteInfo(route);

			// If 1st car main, broadcast the waypoint addition (optional, as route update handles it, but good for explicit events)
			if (deviceRole === "car1-main" && isSyncConnected) {
				convoySync.send("waypoint_added", newWaypoint);
			}

			// Show confirmation message
			setMessages((prev) => [
				...prev,
				{
					role: "assistant",
					content: `Added stop at ${stopName}.`,
				},
			]);
		}
	}

	// Handle stop request acceptance for 2nd car main
	async function handleStopRequestAccept() {
		if (!pendingStopRequest) return;

		await addStopDuringNavigation(
			pendingStopRequest.name,
			pendingStopRequest.latitude,
			pendingStopRequest.longitude,
			pendingStopRequest.id
		);

		setPendingStopRequest(null);
	}

	// Handle stop request decline for 2nd car main
	function handleStopRequestDecline() {
		if (pendingStopRequest && isSyncConnected) {
			convoySync.send("stop_request_declined", {
				name: pendingStopRequest.name,
				id: pendingStopRequest.id,
			});
		}
		setPendingStopRequest(null);
	}

	function handleCancelRequest(place: PlaceResult) {
		const id = place.id || place.name;
		setMyStopRequests((prev) => prev.filter((reqId) => reqId !== id));

		// Notify main driver to remove the request popup
		if (deviceRole === "car1-rear" && isSyncConnected) {
			console.log(
				`[App] Sending stop_request_cancelled: ${place.name} (id: ${id})`
			);
			convoySync.send("stop_request_cancelled", {
				name: place.name,
				latitude: place.latitude,
				longitude: place.longitude,
				id: id,
			});
		}
	}

	// Auto-accept stop request after 8 seconds
	useEffect(() => {
		if (pendingStopRequest) {
			const timer = setTimeout(() => {
				console.log("[App] Auto-accepting stop request");
				speakText(`A stop at ${pendingStopRequest.name} has been added`);
				handleStopRequestAccept();
			}, 8000);
			return () => clearTimeout(timer);
		}
	}, [pendingStopRequest]);

	// Stops Panel Logic
	function toggleStopsPanel() {
		setShowStopsPanel(!showStopsPanel);
		if (!showStopsPanel) {
			// Reset state when opening
			setStopsPanelCategory(null);
			setStopsSearchResults([]);
		}
	}

	async function handleCategorySelect(category: string) {
		setStopsPanelCategory(category);
		setStopsSearchResults([]);
		setIsSearchingStops(true);

		if (userRegion) {
			// Map "tourism" category to "attraction" query for POIs
			const query = category === "tourism" ? "attraction" : category;
			const results = await searchPlaces(
				query,
				userRegion.latitude,
				userRegion.longitude
			);
			setStopsSearchResults(results.slice(0, 10));
		}

		setIsSearchingStops(false);
	}

	// Testing Scenarios Logic
	function startScenario1() {
		setShowSettings(false);
		setActiveScenario(1);
		setScenarioStep("modal");
	}

	function startScenario2() {
		setShowSettings(false);
		setActiveScenario(2);
		setScenarioStep("modal");
	}

	function handleScenarioModalYes() {
		if (activeScenario === 1) {
			// Scenario 1: Set destination to Verbania, Italy
			handleSelectPlace({
				id: "scenario-1",
				name: "Monte Bianco, Italy",
				latitude: 45.83309930547322,
				longitude: 6.865132070097383,
				address: "Monte Bianco, Italy",
			});
			setActiveScenario(null);
		} else if (activeScenario === 2) {
			// Scenario 2: Proceed to question step
			setScenarioStep("question");
		}
	}

	function handleScenarioModalNo() {
		setActiveScenario(null);
	}
	//AAA
	function handleScenario2QuestionAnswer() {
		// Scenario 2: Set destination to Arese, Italy
		handleSelectPlace({
			id: "scenario-2",
			name: "Via Magenta 15, Busto Garolfo, Italy",
			latitude: 45.54489152299397,
			longitude: 8.884414033360157,
			address: "Via Magenta 15, Busto Garolfo, Italy",
		});
		setActiveScenario(null);
	}

	function handleResetToDefault() {
		// Reset Location
		const resetLocation = {
			latitude: 45.5121490834915,
			longitude: 9.110004203867218,
			latitudeDelta: 0.01,
			longitudeDelta: 0.01,
		};
		setUserRegion(resetLocation);
		setUserHeading(0);
		setSpeed(0);

		// Reset Range
		setRemainingRange(478);

		// Broadcast reset to convoy
		if (isSyncConnected) {
			convoySync.send("location", {
				latitude: resetLocation.latitude,
				longitude: resetLocation.longitude,
				heading: 0,
				speed: 0,
			});
			convoySync.send("range", { remainingRange: 478 });
		}

		// Force map to center on reset location
		if (mapRef.current) {
			mapRef.current.setCamera({
				center: {
					latitude: resetLocation.latitude,
					longitude: resetLocation.longitude,
				},
				heading: 0,
				pitch: 0,
				altitude: 2000,
				zoom: 15,
			});
		}

		// Reset messages
		setMessages([
			{
				role: "assistant",
				content: "Hello! I'm Elmo. Where would you like to go?",
				target: "all",
			},
		]);
	}

	async function handleAddStopFromPanel(place: PlaceResult) {
		await addStopDuringNavigation(
			place.name,
			place.latitude,
			place.longitude,
			place.id
		);
	}

	async function handleRemoveStopFromPanel(place: PlaceResult) {
		// Identify by coordinates
		const pointId = `${place.latitude.toFixed(5)},${place.longitude.toFixed(
			5
		)}`;

		const newWaypoints = routeWaypoints.filter((wp) => {
			const wpId = `${wp.latitude.toFixed(5)},${wp.longitude.toFixed(5)}`;
			return wpId !== pointId;
		});

		setRouteWaypoints(newWaypoints);

		// Recalculate route
		if (!userRegion || !destination) return;
		const allWaypoints = newWaypoints;

		const route = await getRoute(
			[userRegion.latitude, userRegion.longitude],
			[destination.latitude, destination.longitude],
			allWaypoints.map((wp) => ({ coordinates: [wp.latitude, wp.longitude] })),
			routeOptions
		);

		if (route) {
			setRouteCoords(route.coordinates);
			setRouteInfo(route);

			// Broadcast change if car1-main
			if (deviceRole === "car1-main" && isSyncConnected) {
				convoySync.send("waypoints", newWaypoints);
			}
		}
	}

	function startNavigation() {
		setNavigationState("active");
		distanceTraveled.current = 0;
		lastPausedLegIndex.current = -1;
		hasTriggeredFakeStopRef.current = false;
		navigationStartTime.current = Date.now();
		if (userRegion && mapRef.current) {
			mapRef.current.animateCamera(
				{
					center: {
						latitude: userRegion.latitude,
						longitude: userRegion.longitude,
					},
					heading: userHeading,
					pitch: 60,
					altitude: 100,
					zoom: 18,
				},
				{ duration: 1000 }
			);
		}
	}

	// Fake Stop Suggestion Timer
	useEffect(() => {
		let timer: ReturnType<typeof setTimeout>;
		if (
			navigationState === "active" &&
			deviceRole === "car1-main" &&
			!hasTriggeredFakeStopRef.current
		) {
			console.log("[App] Starting 80s timer for fake stop suggestion");
			// Mark as triggered immediately to prevent loop if re-render happens
			hasTriggeredFakeStopRef.current = true;

			timer = setTimeout(() => {
				// Only suggest if not already pending and not already added
				// Autogrill Pero Nord
				const fakeStop = {
					id: "autogrill-pero-nord",
					name: "Autogrill Pero Nord",
					latitude: 45.51385067115633,
					longitude: 9.069810203049895,
				};

				// Use refs to check current state without adding dependencies
				const alreadyPending = pendingStopRequestRef.current;
				const alreadyAdded = addedStopsRef.current.includes(fakeStop.id);
				const alreadyRequested = myStopRequestsRef.current.includes(
					fakeStop.id
				);

				if (!alreadyPending && !alreadyAdded && !alreadyRequested) {
					console.log("[App] Triggering fake stop suggestion");
					setPendingStopRequest(fakeStop);
					speakText(
						"The other car is suggesting a stop at Autogrill Pero Nord"
					);
				}
			}, 80000); // 1.3 minutes
		}

		return () => {
			if (timer) clearTimeout(timer);
		};
	}, [navigationState, deviceRole]);

	function cancelNavigation() {
		setDestination(null);
		setRouteCoords([]);
		setRouteWaypoints([]);
		setRouteInfo(null);
		setNavigationState("idle");
		setSpeed(0); // Reset speed to 0
		setIsPausedAtStop(false);
		setShowStopsPanel(false);
		setMessages((prev) => [
			...prev,
			{
				role: "assistant",
				content: "Navigation ended.",
				target: "car1-main",
			},
		]);

		// Zoom out to default view
		if (userRegion) {
			mapRef.current?.animateCamera(
				{
					center: {
						latitude: userRegion.latitude,
						longitude: userRegion.longitude,
					},
					heading: userHeading,
					altitude: Platform.OS === "ios" ? 2000 : undefined,
					zoom: Platform.OS === "android" ? 15 : undefined,
					pitch: 0,
				},
				{ duration: 500 }
			);
		}
	}

	async function handleResumeNavigation() {
		setIsPausedAtStop(false);

		// Remove the reached waypoint (first one)
		const nextWaypoints =
			routeWaypoints.length > 0 ? routeWaypoints.slice(1) : [];
		setRouteWaypoints(nextWaypoints);

		// Recalculate route to destination from current location
		if (userRegion && destination) {
			const start = {
				latitude: userRegion.latitude,
				longitude: userRegion.longitude,
			};
			const route = await getRoute(
				[start.latitude, start.longitude],
				[destination.latitude, destination.longitude],
				nextWaypoints.map((wp) => ({
					coordinates: [wp.latitude, wp.longitude],
				}))
			);
			if (route) {
				setRouteInfo(route);
				setRouteCoords(route.coordinates);
				distanceTraveledOnCurrentRoute.current = 0; // Reset distance for new route
				setNextManeuver(null); // Reset maneuver until next update
				lastPausedLegIndex.current = -1; // Reset pause tracker
			}
		}
		// Broadcast resume
		if (isSyncConnected && deviceRole === "car1-main") {
			convoySync.send("resume_navigation", {});
		}
	}

	const handleSelectPlace = async (place: Place) => {
		// Simple mock implementation: Geocode address and set destination
		if (!userRegion) return;

		// If place has coordinates, use them directly
		if (place.latitude && place.longitude) {
			setDestination({
				latitude: place.latitude,
				longitude: place.longitude,
				name: place.name,
			});

			const route = await getRoute(
				[userRegion.latitude, userRegion.longitude],
				[place.latitude, place.longitude],
				[],
				routeOptions
			);

			if (route) {
				setRouteCoords(route.coordinates);
				setRouteInfo(route);
				setNavigationState("preview");

				// Fit map
				mapRef.current?.fitToCoordinates(
					[
						{ latitude: userRegion.latitude, longitude: userRegion.longitude },
						{ latitude: place.latitude, longitude: place.longitude },
					],
					{
						edgePadding: { top: 150, right: 50, bottom: 150, left: 50 },
						animated: true,
					}
				);
			}
			return;
		}

		// If place has address, use it. Otherwise use name.
		const query = place.address || place.name;
		const geocoded = await Location.geocodeAsync(query);

		if (geocoded.length > 0) {
			const targetLat = geocoded[0].latitude;
			const targetLng = geocoded[0].longitude;

			setDestination({
				latitude: targetLat,
				longitude: targetLng,
				name: place.name,
			});

			const route = await getRoute(
				[userRegion.latitude, userRegion.longitude],
				[targetLat, targetLng],
				[],
				routeOptions
			);

			if (route) {
				setRouteCoords(route.coordinates);
				setRouteInfo(route);
				setNavigationState("preview");

				// Fit map
				mapRef.current?.fitToCoordinates(
					[
						{ latitude: userRegion.latitude, longitude: userRegion.longitude },
						{ latitude: targetLat, longitude: targetLng },
					],
					{
						edgePadding: { top: 150, right: 50, bottom: 150, left: 50 },
						animated: true,
					}
				);
			}
		}
	};

	const handleRearSelectPlace = (place: PlaceResult) => {
		selectedPlaceRef.current = place;
		setSelectedPlace(place);
		if (mapRef.current) {
			mapRef.current.animateToRegion(
				{
					latitude: place.latitude,
					longitude: place.longitude,
					latitudeDelta: 0.01,
					longitudeDelta: 0.01,
				},
				1000
			);
		}
	};

	// Auto-close selected place card after acceptance/rejection (3 seconds)
	useEffect(() => {
		if (selectedPlace) {
			const id = selectedPlace.id || selectedPlace.name;
			if (
				addedStops.includes(id) ||
				declinedStopRequests.includes(selectedPlace.name)
			) {
				const timer = setTimeout(() => {
					selectedPlaceRef.current = null;
					setSelectedPlace(null);
				}, 3000);
				return () => clearTimeout(timer);
			}
		}
	}, [selectedPlace, addedStops, declinedStopRequests]);

	const handleRearAddStop = (place: PlaceResult) => {
		// Use addStopDuringNavigation to correctly trigger sync/request logic based on role
		addStopDuringNavigation(
			place.name,
			place.latitude,
			place.longitude,
			place.id
		);
		// Do not clear selected place immediately for rear seat requests
		if (deviceRole !== "car1-rear") {
			selectedPlaceRef.current = null;
			setSelectedPlace(null);
		}
	};

	return (
		<View style={styles.container}>
			<StatusBar hidden />
			<TopBar
				location={
					userRegion
						? {
								latitude: userRegion.latitude,
								longitude: userRegion.longitude,
						  }
						: undefined
				}
				remainingRange={remainingRange}
				weather={weather}
			/>

			<View style={styles.dashboardContainer}>
				{/* LEFT PANEL: Dashboard Widgets (hidden for car1-rear if we want to replace it entirely, so let's control content inside) */}
				{deviceRole === "car1-rear" ? (
					<View style={styles.leftPanel}>
						<RearLeftPanel
							routeInfo={routeInfo}
							navigationState={navigationState}
							messages={messages.filter(
								(m) =>
									m.target !== "car1-main" &&
									(!m.target || m.target === "car1-rear" || m.role === "user")
							)}
							onSendMessage={handleTextSubmit}
							isRecording={isRecording}
							onToggleMic={startVoiceRecognition}
							distanceTraveled={distanceTraveled.current}
							currentLocation={
								userRegion
									? {
											latitude: userRegion.latitude,
											longitude: userRegion.longitude,
									  }
									: undefined
							}
							onSelectPlace={handleRearSelectPlace}
							onAddStop={handleRearAddStop}
							stopsProgress={
								routeInfo?.distance && routeInfo.legs.length > 1
									? routeInfo.legs.slice(0, -1).map((_, i) => {
											const distToStop = routeInfo.legs
												.slice(0, i + 1)
												.reduce((sum, l) => sum + l.distance, 0);
											return (
												(distanceTraveledOnCurrentRoute.current + distToStop) /
												(distanceTraveledOnCurrentRoute.current +
													routeInfo.distance)
											);
									  })
									: undefined
							}
							streamingText={streamingVoiceText}
						/>
					</View>
				) : (
					<View style={styles.leftPanel}>
						{/* Speedometer - Always Visible */}
						<Speedometer currentSpeed={speed} speedLimit={currentSpeedLimit} />

						{/* Route Preview Mode */}
						{navigationState === "preview" && routeInfo && (
							<>
								<RoutePreview
									waypoints={routeWaypoints}
									destination={destination}
									onAddStop={toggleStopsPanel}
								/>
								<NavigationInfoPanel
									duration={
										nextStopDuration ||
										(routeWaypoints.length > 0 && routeInfo?.legs?.length > 0
											? routeInfo.legs[0].duration
											: routeInfo?.duration || 0)
									}
									distance={
										nextStopDistance ||
										(routeWaypoints.length > 0 && routeInfo?.legs?.length > 0
											? routeInfo.legs[0].distance
											: routeInfo?.distance || 0)
									}
									legs={routeInfo?.legs || []}
									hasWaypoints={routeWaypoints.length > 0}
									onStart={startNavigation}
									onCancel={cancelNavigation}
									navigationState={navigationState}
									isPaused={isPausedAtStop}
									onResume={handleResumeNavigation}
									totalDistance={routeInfo?.distance || 0}
									totalDuration={routeInfo?.duration || 0}
									progress={
										routeInfo?.distance
											? distanceTraveled.current /
											  (distanceTraveled.current + routeInfo.distance)
											: 0
									}
									stopsProgress={
										routeInfo?.distance && routeInfo.legs.length > 1
											? routeInfo.legs.slice(0, -1).map((_, i) => {
													const distToStop = routeInfo.legs
														.slice(0, i + 1)
														.reduce((sum, l) => sum + l.distance, 0);
													return (
														(distanceTraveled.current + distToStop) /
														(distanceTraveled.current + routeInfo.distance)
													);
											  })
											: undefined
									}
								/>
							</>
						)}

						{/* IDLE MODE Panel Content */}
						{navigationState === "idle" && (
							<>
								<PlacesList
									places={FAVORITE_PLACES}
									onSelectPlace={handleSelectPlace}
								/>
							</>
						)}

						{/* ACTIVE MODE Panel Content for non-rear */}
						{navigationState === "active" && (
							<>
								{/* Turn Directions */}
								<View style={{ marginTop: 24, marginBottom: 12 }}>
									<TurnDirections maneuver={nextManeuver} />
								</View>

								{/* Fake Road Visualization */}
								<View
									style={{
										flex: 1,
										maxHeight: 300,
										marginTop: 12,
										marginBottom: 24,
									}}
								>
									<FakeRoad />
								</View>

								{/* Navigation Info Panel with dynamic stats */}
								{(() => {
									if (!routeInfo) return null;

									// Calculate real-time stats
									let remDist = Math.max(
										0,
										routeInfo.distance - distanceTraveledOnCurrentRoute.current
									);
									let remDur =
										(remDist / routeInfo.distance) * routeInfo.duration;

									if (routeInfo.legs.length > 1) {
										let distAccum = 0;
										for (const leg of routeInfo.legs) {
											if (
												distAccum + leg.distance >
												distanceTraveledOnCurrentRoute.current
											) {
												const distInLeg =
													distanceTraveledOnCurrentRoute.current - distAccum;
												const legRemDist = Math.max(
													0,
													leg.distance - distInLeg
												);
												const legRemDur =
													(legRemDist / leg.distance) * leg.duration;
												remDist = legRemDist;
												remDur = legRemDur;
												break;
											}
											distAccum += leg.distance;
										}
									}

									return (
										<View style={{ marginTop: 16 }}>
											<NavigationInfoPanel
												duration={remDur}
												distance={remDist}
												legs={routeInfo.legs}
												hasWaypoints={routeWaypoints.length > 0}
												onStart={startNavigation}
												onCancel={cancelNavigation}
												navigationState="active"
												isPaused={isPausedAtStop}
												onResume={handleResumeNavigation}
												totalDistance={routeInfo.distance}
												totalDuration={routeInfo.duration}
												progress={
													routeInfo.distance
														? Math.min(
																1,
																distanceTraveled.current /
																	(distanceTraveled.current +
																		routeInfo.distance)
														  )
														: 0
												}
												stopsProgress={
													routeInfo?.distance && routeInfo.legs.length > 1
														? routeInfo.legs.slice(0, -1).map((_, i) => {
																const distToStop = routeInfo.legs
																	.slice(0, i + 1)
																	.reduce((sum, l) => sum + l.distance, 0);
																return (
																	(distanceTraveled.current + distToStop) /
																	(distanceTraveled.current +
																		routeInfo.distance)
																);
														  })
														: undefined
												}
											/>
										</View>
									);
								})()}
							</>
						)}
					</View>
				)}

				{/* RIGHT PANEL: Map & Overlays */}
				<View style={styles.rightPanel}>
					<View
						style={[
							styles.mapContainer,
							deviceRole === "car1-rear" && { paddingLeft: 12 },
							deviceRole === "car1-rear" && { paddingLeft: 12 },
						]}
					>
						{/* Stops Panel Toggle Button - Only show when destination is set AND in active mode (in preview it's in the list) OR if panel is open */}
						{((destination &&
							(navigationState === "active" ||
								(navigationState === "preview" &&
									deviceRole === "car1-rear"))) ||
							showStopsPanel) && (
							<TouchableOpacity
								style={[
									styles.stopsPanelButton,
									deviceRole === "car1-rear" && { left: 20 },
								]}
								onPress={toggleStopsPanel}
							>
								<Ionicons
									name="add"
									size={32}
									color="#5EEAD4"
									style={{
										transform: [{ rotate: showStopsPanel ? "45deg" : "0deg" }],
									}}
								/>
							</TouchableOpacity>
						)}
						<MapView
							ref={mapRef}
							style={styles.map}
							provider={PROVIDER_DEFAULT}
							showsUserLocation={!autopilotEnabled && !isPausedAtStop}
							showsMyLocationButton={false}
							showsCompass={false}
							initialRegion={
								userRegion
									? {
											latitude: userRegion.latitude,
											longitude: userRegion.longitude,
											latitudeDelta: 0.01,
											longitudeDelta: 0.01,
									  }
									: undefined
							}
						>
							{/* Autopilot Cursor - Show when enabled OR paused at stop */}
							{(autopilotEnabled || isPausedAtStop) && userRegion && (
								<Marker
									coordinate={{
										latitude: userRegion.latitude,
										longitude: userRegion.longitude,
									}}
									anchor={{ x: 0.5, y: 0.5 }}
									flat
									rotation={userHeading}
								>
									<View style={styles.cursorContainer}>
										<Ionicons
											name="navigate"
											size={28}
											color="#5EEAD4"
											style={{ transform: [{ rotate: `-45deg` }] }}
										/>
									</View>
								</Marker>
							)}
							{destination && (
								<Marker
									coordinate={{
										latitude: destination.latitude,
										longitude: destination.longitude,
									}}
									title={destination.name}
									pinColor="red"
								/>
							)}
							{routeWaypoints.map((wp, index) => (
								<Marker
									key={`${wp.name}-${wp.latitude}-${wp.longitude}`}
									coordinate={{
										latitude: wp.latitude,
										longitude: wp.longitude,
									}}
									title={wp.name}
									pinColor="yellow"
								/>
							))}
							<Polyline
								coordinates={routeCoords}
								strokeWidth={navigationState === "active" ? 14 : 6}
								strokeColor="#14b8a6"
							/>
							{/* Selected Place Marker (Rear Idle) */}
							{selectedPlace && deviceRole === "car1-rear" && (
								<Marker
									coordinate={{
										latitude: selectedPlace.latitude,
										longitude: selectedPlace.longitude,
									}}
									centerOffset={{ x: 0, y: -78 }}
								>
									<View style={{ alignItems: "center" }}>
										<View style={styles.placeCardSmall}>
											<TouchableOpacity
												onPress={() => {
													if (userRegion && mapRef.current) {
														mapRef.current.animateToRegion(userRegion, 500);
													}
													selectedPlaceRef.current = null;
													setSelectedPlace(null);
												}}
												style={{
													position: "absolute",
													top: 8,
													right: 8,
													zIndex: 10,
													backgroundColor: "rgba(0,0,0,0.5)",
													borderRadius: 8,
													padding: 4,
												}}
											>
												<Ionicons name="close" size={20} color="white" />
											</TouchableOpacity>
											{selectedPlace.image && (
												<Image
													source={{ uri: selectedPlace.image }}
													style={styles.placeCardImageSmall}
												/>
											)}
											<View style={styles.placeCardContentSmall}>
												<View style={{ flex: 1 }}>
													<Text
														style={styles.placeCardTitleSmall}
														numberOfLines={1}
													>
														{selectedPlace.name}
													</Text>
													<Text style={styles.placeCardDistanceSmall}>
														{selectedPlace.distance
															? selectedPlace.distance > 1000
																? (selectedPlace.distance / 1000).toFixed(1) +
																  " km"
																: selectedPlace.distance + " m"
															: ""}
													</Text>
												</View>
												{(navigationState === "active" ||
													navigationState === "preview") &&
													routeInfo && (
														<TouchableOpacity
															onPress={() => handleRearAddStop(selectedPlace)}
															disabled={
																myStopRequests.includes(
																	selectedPlace.id || selectedPlace.name
																) ||
																addedStops.includes(
																	selectedPlace.id || selectedPlace.name
																) ||
																declinedStopRequests.includes(
																	selectedPlace.name
																)
															}
															style={{
																backgroundColor: addedStops.includes(
																	selectedPlace.id || selectedPlace.name
																)
																	? "#10B981" // Green for accepted
																	: declinedStopRequests.includes(
																			selectedPlace.name
																	  )
																	? "#EF4444" // Red for rejected
																	: myStopRequests.includes(
																			selectedPlace.id || selectedPlace.name
																	  )
																	? "#374151" // Disabled gray for requested
																	: "#112e33", // Default teal/dark
																paddingHorizontal: 10,
																paddingVertical: 6,
																borderRadius: 8,
																flexDirection: "row",
																alignItems: "center",
																borderWidth: 1,
																borderColor: myStopRequests.includes(
																	selectedPlace.id || selectedPlace.name
																)
																	? "#6B7280"
																	: declinedStopRequests.includes(
																			selectedPlace.name
																	  )
																	? "#4b1212" // Dark Red Border
																	: "#5EEAD4",
																marginTop: 3,
															}}
														>
															<Ionicons
																name={
																	addedStops.includes(
																		selectedPlace.id || selectedPlace.name
																	)
																		? "checkmark-circle"
																		: declinedStopRequests.includes(
																				selectedPlace.name
																		  )
																		? "close-circle"
																		: "add-circle"
																}
																size={16}
																color={
																	myStopRequests.includes(
																		selectedPlace.id || selectedPlace.name
																	)
																		? "#9CA3AF"
																		: declinedStopRequests.includes(
																				selectedPlace.name
																		  )
																		? "#4b1212" // Dark Red Icon
																		: "#5EEAD4"
																}
																style={{ marginRight: 4 }}
															/>
															<Text
																style={{
																	color: myStopRequests.includes(
																		selectedPlace.id || selectedPlace.name
																	)
																		? "#9CA3AF"
																		: declinedStopRequests.includes(
																				selectedPlace.name
																		  )
																		? "#4b1212" // Dark Red Text
																		: "#5EEAD4",
																	fontWeight: "bold",
																	fontSize: 12,
																}}
															>
																{addedStops.includes(
																	selectedPlace.id || selectedPlace.name
																)
																	? "Accepted"
																	: declinedStopRequests.includes(
																			selectedPlace.name
																	  )
																	? "Declined"
																	: myStopRequests.includes(
																			selectedPlace.id || selectedPlace.name
																	  )
																	? "Requested"
																	: deviceRole === "car1-rear"
																	? "Request Stop"
																	: "Add Stop"}
															</Text>
														</TouchableOpacity>
													)}
											</View>
										</View>
										<View style={styles.placeCardArrow} />
									</View>
								</Marker>
							)}
						</MapView>
						{/* Mute Button (Above Settings) - Hidden for Rear Seat */}
						{deviceRole !== "car1-rear" && (
							<TouchableOpacity
								style={[styles.muteButton]}
								onPress={async () => {
									const newMuted = !isMuted;
									setIsMuted(newMuted);
									if (newMuted) {
										await Speech.stop();
										// Also stop any currently playing audio object if we had one (though we moved to Speech mostly)
										if (currentAudioRef.current) {
											await currentAudioRef.current.stopAsync();
										}
									}
								}}
							>
								<Ionicons
									name={isMuted ? "volume-mute-outline" : "volume-high-outline"}
									size={28}
									color="#5EEAD4"
								/>
							</TouchableOpacity>
						)}

						{/* Settings Button (Top Left) */}
						<TouchableOpacity
							style={[styles.settingsButton]}
							onPress={() => setShowSettings(true)}
						>
							<Ionicons name="settings-outline" size={28} color="#5EEAD4" />
						</TouchableOpacity>
					</View>

					{/* Stops Panel - Rendered below the map as a panel */}
					{showStopsPanel && (
						<View
							style={{
								flex: 1,
								backgroundColor: "#01181C",
								paddingRight: 12,
								paddingBottom: 12,
							}}
						>
							<StopsPanel
								onCategorySelect={handleCategorySelect}
								onClose={toggleStopsPanel}
								searchResults={stopsSearchResults}
								onAddStop={handleAddStopFromPanel}
								onRemoveStop={handleRemoveStopFromPanel}
								isLoading={isSearchingStops}
								selectedCategory={stopsPanelCategory}
								deviceRole={deviceRole}
								myStopRequests={myStopRequests}
								declinedStopRequests={declinedStopRequests}
								addedStops={addedStops}
								onCancelRequest={handleCancelRequest}
							/>
						</View>
					)}

					{/* Voice Button - Hide for car1-rear */}
					{deviceRole !== "car1-rear" && (
						<TouchableOpacity
							style={[
								styles.micButton,
								isRecording && styles.micButtonRecording,
								isProcessing && styles.micButtonProcessing,
							]}
							onPress={
								isRecording ? stopVoiceRecognition : startInteractiveVoice
							}
						>
							<Ionicons
								name={
									isRecording
										? "mic"
										: isProcessing
										? "hourglass-outline"
										: "mic-outline"
								}
								size={30}
								color={
									isProcessing ? "#01181C" : isRecording ? "white" : "#5EEAD4"
								}
							/>
						</TouchableOpacity>
					)}

					{/* Voice Actions Button (Dummy) */}
					<TouchableOpacity
						style={[
							styles.voiceActionsButton,
							deviceRole !== "car1-rear" && { top: 80 },
						]}
					>
						<Ionicons name="megaphone-outline" size={28} color="#5EEAD4" />
					</TouchableOpacity>
					{/* Chat Overlay (Top Left - Hidden by default) */}
					{showChat && (
						<View style={styles.chatOverlay}>
							<ScrollView
								style={styles.messagesList}
								showsVerticalScrollIndicator={false}
								contentContainerStyle={{ paddingTop: 20, paddingBottom: 20 }}
							>
								{messages.map((msg, index) => (
									<View
										key={index}
										style={[
											styles.messageBubble,
											msg.role === "user"
												? styles.userBubble
												: styles.assistantBubble,
											index === 0 && { marginTop: 24, marginBottom: 12 },
										]}
									>
										<Text
											style={[
												styles.messageText,
												msg.role === "user"
													? styles.userText
													: styles.assistantText,
											]}
										>
											{msg.content}
										</Text>
									</View>
								))}
							</ScrollView>
							<View style={styles.inputContainer}>
								<TextInput
									style={styles.input}
									value={inputText}
									onChangeText={setInputText}
									placeholder="Type a message..."
									placeholderTextColor="#9ca3af"
									onSubmitEditing={handleTextSubmit}
									returnKeyType="send"
								/>
								<TouchableOpacity
									style={styles.sendButton}
									onPress={handleTextSubmit}
								>
									<Ionicons name="send" size={20} color="white" />
								</TouchableOpacity>
							</View>
						</View>
					)}
					{/* Stop Request Card (Inline) */}
					{pendingStopRequest && (
						<View
							style={[
								styles.stopRequestCard,
								deviceRole === "car1-rear" && { left: 20 },
							]}
						>
							<View style={styles.stopRequestHeader}>
								<Ionicons name="location" size={24} color="#5EEAD4" />
								<Text style={styles.stopRequestTitle}>Stop Requested</Text>
							</View>

							<Text style={styles.stopRequestText}>
								<Text style={{ fontWeight: "bold", color: "white" }}>
									{pendingStopRequest.name}
								</Text>
							</Text>

							<View style={styles.stopRequestButtons}>
								<TouchableOpacity
									style={[styles.stopRequestBtn, styles.stopRequestDecline]}
									onPress={handleStopRequestDecline}
								>
									<Text style={styles.stopRequestDeclineText}>Decline</Text>
								</TouchableOpacity>
								<TouchableOpacity
									style={[styles.stopRequestBtn, styles.stopRequestAccept]}
									onPress={handleStopRequestAccept}
								>
									<Text style={styles.stopRequestAcceptText}>Add Stop</Text>
								</TouchableOpacity>
							</View>
						</View>
					)}
				</View>
			</View>

			{/* Voice Interaction Overlay - Root Level */}
			{showVoiceOverlay && (
				<Animated.View
					style={[styles.voiceOverlay, { opacity: voiceOverlayFade }]}
				>
					<LinearGradient
						colors={["rgba(94, 234, 212, 0.4)", "transparent"]}
						style={styles.voiceGradient}
					/>
					<View style={styles.voiceContent}>
						<Text style={styles.voiceText}>{voiceOverlayText}</Text>
					</View>

					{/* Close Button - Covers Mic Button Position */}
					{deviceRole !== "car1-rear" && (
						<TouchableOpacity
							style={styles.overlayCloseButton} // Adjusted position validation
							onPress={handleManualCloseVoice}
						>
							<Ionicons name="close" size={30} color="white" />
						</TouchableOpacity>
					)}
				</Animated.View>
			)}

			<SettingsModal
				visible={showSettings}
				onClose={() => setShowSettings(false)}
				routeOptions={routeOptions}
				onOptionsChange={setRouteOptions}
				showChat={showChat}
				onToggleChat={setShowChat}
				deviceRole={deviceRole}
				onDeviceRoleChange={setDeviceRole}
				syncServerUrl={syncServerUrl}
				onSyncServerUrlChange={setSyncServerUrl}
				isConnected={isSyncConnected}
				onStartScenario1={startScenario1}
				onStartScenario2={startScenario2}
				onResetToDefault={handleResetToDefault}
			/>

			<ScenarioModal
				visible={activeScenario !== null && scenarioStep === "modal"}
				question={
					activeScenario === 1
						? "Are you ready to start your trip to Monte Bianco?"
						: "Good morning, are you going to work?"
				}
				onYes={handleScenarioModalYes}
				onNo={handleScenarioModalNo}
			/>

			{/* Stop Added Notification */}
			{notificationStop && (
				<StopAddedNotification
					stop={notificationStop.stop}
					distance={notificationStop.distance}
					duration={notificationStop.duration}
					onDismiss={() => setNotificationStop(null)}
					onCancel={() => {
						// Remove the added stop (last one)
						const newWaypoints = [...routeWaypoints];
						// Assuming the notified stop is the LAST one added.
						// Safest to find by coordinates or name to be sure?
						// For now remove last.
						if (newWaypoints.length > 0) {
							newWaypoints.pop();
							setRouteWaypoints(newWaypoints);
							// Sync update
							convoySync.send("waypoints", newWaypoints);
							// Also trigger reroute if needed?
							// getRoute(...) call checks routeWaypoints dependency usually?
							// We need to trigger route update.
							// Existing code likely listens to routeWaypoints change?
							// Let's check.
						}
						setNotificationStop(null);
					}}
				/>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#01181C", // Dark Teal Background
	},
	dashboardContainer: {
		flex: 1,
		flexDirection: "row",
	},
	leftPanel: {
		width: "30%",
		maxWidth: 360,
		paddingTop: 10,
		paddingBottom: 12,
		paddingHorizontal: 18,
		justifyContent: "space-between",
	},
	rightPanel: {
		flex: 1,
		position: "relative",
	},
	mapContainer: {
		flex: 1,
		width: "100%",
		height: "100%",
		padding: 12,
		paddingTop: 8,
		paddingLeft: 0,
		overflow: "hidden",
	},
	map: {
		width: "100%",
		height: "100%",
		borderRadius: 18,
	},
	settingsButton: {
		position: "absolute",
		bottom: 20,
		right: 20,
		width: 56,
		height: 56,
		borderRadius: 12,
		backgroundColor: "#01181C",
		justifyContent: "center",
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.15,
		shadowRadius: 8,
		elevation: 5,
		zIndex: 20,
	},
	// --- Left Panel Styles ---
	header: {
		marginBottom: 20,
	},
	greeting: {
		fontSize: 28,
		fontWeight: "bold",
		color: "white",
	},
	subGreeting: {
		fontSize: 18,
		color: "#9ca3af",
	},
	tabs: {
		flexDirection: "row",
		marginBottom: 16,
		gap: 16,
	},
	tab: {
		paddingBottom: 8,
		borderBottomWidth: 2,
		borderBottomColor: "transparent",
	},
	activeTab: {
		borderBottomColor: "#5EEAD4",
	},
	tabText: {
		fontSize: 16,
		color: "#9ca3af",
		fontWeight: "500",
	},
	activeTabText: {
		color: "#5EEAD4",
	},

	speedContainer: {
		position: "absolute",
		bottom: 20,
		left: 20,
		flexDirection: "row",
		alignItems: "flex-end",
		gap: 12,
		zIndex: 20,
	},
	speedLimitSign: {
		width: 50,
		height: 50,
		borderRadius: 25,
		backgroundColor: "white",
		borderWidth: 4,
		borderColor: "#cc0000",
		justifyContent: "center",
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.25,
		shadowRadius: 3.84,
		elevation: 5,
	},
	speedLimitInner: {
		width: 38,
		height: 38,
		borderRadius: 19,
		justifyContent: "center",
		alignItems: "center",
	},
	speedLimitText: {
		fontSize: 20,
		fontWeight: "bold",
		color: "black",
	},
	currentSpeedBox: {
		backgroundColor: "rgba(0,0,0,0.8)",
		paddingVertical: 4,
		paddingHorizontal: 12,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	speedValue: {
		color: "white",
		fontSize: 28,
		fontWeight: "bold",
	},
	speedUnit: {
		color: "#9ca3af",
		fontSize: 12,
		marginTop: -2,
	},
	muteButton: {
		position: "absolute",
		bottom: 84,
		right: 20,
		width: 56,
		height: 56,
		borderRadius: 12,
		backgroundColor: "#01181C",
		justifyContent: "center",
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.15,
		shadowRadius: 8,
		elevation: 5,
		zIndex: 20,
	},
	stopsPanelButton: {
		position: "absolute",
		bottom: 20,
		left: 8,
		width: 56,
		height: 56,
		borderRadius: 12,
		backgroundColor: "#01181C",
		justifyContent: "center",
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.15,
		shadowRadius: 8,
		elevation: 5,
		zIndex: 20,
	},
	micButton: {
		position: "absolute",
		top: 16,
		right: 20,
		width: 56,
		height: 56,
		borderRadius: 12,
		backgroundColor: "#01181C",
		justifyContent: "center",
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.15,
		shadowRadius: 8,
		elevation: 6,
		zIndex: 50,
	},
	micButtonContainer: {
		zIndex: 50,
	},
	micButtonRecording: {
		backgroundColor: "#ef4444", // Red for recording
	},
	micButtonProcessing: {
		backgroundColor: "#5EEAD4",
	},
	overlayCloseButton: {
		position: "absolute",
		top: 48,
		right: 20,
		width: 56,
		height: 56,
		borderRadius: 12,
		backgroundColor: "#01181C",
		justifyContent: "center",
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.15,
		shadowRadius: 8,
		elevation: 6,
		zIndex: 1001, // Higher than overlay content
	},
	selectedPlaceOverlay: {
		position: "absolute",
		bottom: 120, // Above bottom bar
		left: 20,
		right: 20,
		alignItems: "center",
		zIndex: 100,
	},
	placeCard: {
		backgroundColor: "#01181C",
		borderRadius: 16,
		padding: 0,
		width: 300,
		borderWidth: 1,
		borderColor: "#112e33",
		overflow: "hidden",
		flexDirection: "column",
	},
	placeCardImage: {
		width: "100%",
		height: 150,
	},
	placeCardContent: {
		padding: 16,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	placeCardTitle: {
		fontSize: 16,
		fontWeight: "bold",
		color: "white",
		flex: 1,
	},
	placeCardDistance: {
		fontSize: 12,
		color: "#5EEAD4",
		marginHorizontal: 8,
	},
	placeCardSmall: {
		backgroundColor: "#01181C",
		borderRadius: 12,
		width: 280,
		borderWidth: 1,
		borderColor: "#112e33",
		overflow: "hidden",
		justifyContent: "flex-start",
	},
	placeCardArrow: {
		width: 0,
		height: 0,
		backgroundColor: "transparent",
		borderStyle: "solid",
		borderLeftWidth: 10,
		borderRightWidth: 10,
		borderBottomWidth: 0,
		borderTopWidth: 12,
		borderLeftColor: "transparent",
		borderRightColor: "transparent",
		borderTopColor: "#01181C",
		marginTop: -1, // Slight overlap
	},
	placeCardImageSmall: {
		width: "100%",
		height: 100,
	},
	placeCardContentSmall: {
		padding: 10,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	placeCardTitleSmall: {
		fontSize: 14,
		fontWeight: "bold",
		color: "white",
		flex: 1,
	},
	placeCardDistanceSmall: {
		fontSize: 11,
		color: "#5EEAD4",
		marginLeft: 2,
		flex: 1,
	},
	chatOverlay: {
		position: "absolute",
		top: 16,
		left: "25%",
		width: 350,
		height: 300,
		zIndex: 40,
		elevation: 10,
		backgroundColor: "rgba(1, 24, 28, 0.95)",
		borderRadius: 14,
		borderWidth: 1,
		borderColor: "#5EEAD4",
	},
	scenarioQuestionContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 16,
	},
	scenarioQuestionText: {
		fontSize: 24,
		fontWeight: "600",
		color: "#5EEAD4",
		textAlign: "center",
		marginBottom: 32,
	},
	scenarioButtonRow: {
		flexDirection: "row",
		gap: 24,
	},
	scenarioAnswerButton: {
		paddingVertical: 16,
		paddingHorizontal: 32,
		borderRadius: 12,
		minWidth: 100,
		alignItems: "center",
	},
	scenarioAnswerText: {
		color: "white",
		fontSize: 20,
		fontWeight: "600",
	},
	messagesList: {
		flex: 1,
		marginBottom: 12,
	},
	inputContainer: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#01181C",
		borderRadius: 10,
		paddingHorizontal: 4,
		paddingVertical: 4,
		borderWidth: 1,
		borderColor: "#5EEAD4",
	},
	input: {
		flex: 1,
		paddingHorizontal: 12,
		paddingVertical: 8,
		fontSize: 14,
		color: "#5EEAD4",
	},
	sendButton: {
		width: 32,
		height: 32,
		borderRadius: 24,
		backgroundColor: "#5EEAD4",
		alignItems: "center",
		justifyContent: "center",
	},
	cursorContainer: {
		width: 44,
		height: 44,
		justifyContent: "center",
		alignItems: "center",
		shadowColor: "#000",
		shadowOpacity: 0.5,
		borderRadius: 40,
		backgroundColor: "#042f2e",
		borderWidth: 2,
		borderColor: "#5EEAD4",
		paddingTop: 6,
		shadowRadius: 8,
		elevation: 8,
	},
	messageBubble: {
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 20,
		marginBottom: 12,
		maxWidth: "85%",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 2,
		elevation: 1,
	},
	userBubble: {
		backgroundColor: "#5EEAD4",
		alignSelf: "flex-end",
		borderBottomRightRadius: 2,
	},
	assistantBubble: {
		backgroundColor: "#01181C",
		alignSelf: "flex-start",
		borderTopLeftRadius: 2,
		borderWidth: 1,
		borderColor: "#5EEAD4",
	},
	messageText: {
		fontSize: 14,
		lineHeight: 20,
	},
	userText: {
		color: "#01181C",
	},
	assistantText: {
		color: "#5EEAD4",
	},
	stopRequestCard: {
		position: "absolute",
		bottom: 20,
		left: 8,
		// right: 20, // Removed to prevent full stretching if not needed, relying on maxWidth
		maxWidth: 400,
		backgroundColor: "#01181C",
		borderRadius: 16,
		padding: 16,
		borderWidth: 1,
		borderColor: "#5EEAD4",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.3,
		shadowRadius: 8,
		elevation: 10,
		zIndex: 100,
	},
	stopRequestHeader: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 8,
		gap: 8,
	},
	stopRequestTitle: {
		fontSize: 18,
		fontWeight: "bold",
		color: "white",
	},
	stopRequestText: {
		fontSize: 16,
		color: "#9ca3af",
		marginBottom: 16,
	},
	stopRequestButtons: {
		flexDirection: "row",
		gap: 12,
	},
	stopRequestBtn: {
		flex: 1,
		paddingVertical: 12,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	stopRequestDecline: {
		backgroundColor: "transparent",
		borderWidth: 1,
		borderColor: "#ef4444",
	},
	stopRequestAccept: {
		backgroundColor: "#5EEAD4",
	},
	stopRequestDeclineText: {
		color: "#ef4444",
		fontWeight: "600",
	},
	stopRequestAcceptText: {
		color: "#01181C",
		fontWeight: "bold",
	},
	voiceOverlay: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: "rgba(0,0,0,0.85)",
		zIndex: 1000,
		justifyContent: "center",
		alignItems: "center",
	},
	voiceGradient: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		height: "60%",
	},
	voiceContent: {
		padding: 32,
		alignItems: "center",
	},
	voiceText: {
		color: "white",
		fontSize: 32,
		fontWeight: "bold",
		textAlign: "center",
	},
	voiceActionsButton: {
		position: "absolute",
		top: 16,
		right: 20,
		width: 56,
		height: 56,
		borderRadius: 12,
		backgroundColor: "#01181C",
		justifyContent: "center",
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.15,
		shadowRadius: 8,
		elevation: 6,
		zIndex: 50,
	},
});

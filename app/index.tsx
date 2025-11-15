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
	View
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";

import { StopsPanel } from "@/components/StopsPanel";
import { convoySync } from "@/lib/convoySync";
import { FakeRoad } from "../components/FakeRoad";
import { NavigationInfoPanel } from "../components/NavigationInfoPanel";
import { Place, PlacesList } from "../components/PlacesList";
import { RoutePreview } from "../components/RoutePreview";
import { ScenarioModal } from "../components/ScenarioModal";
import { DeviceRole, RouteOptions, SettingsModal } from "../components/SettingsModal";
import { Speedometer } from "../components/Speedometer";
import { StopRequestModal } from "../components/StopRequestModal";
import { TopBar } from "../components/TopBar";
import { TurnDirections } from "../components/TurnDirections";
import { askElmoLLM, ChatMsg, createGroqTtsAudio } from "../lib/elmoClient";
import { PlaceResult, searchPlaces } from "../lib/places";
import { getRoute } from "../lib/routing";

// --- Types ---
type NavigationState = "idle" | "preview" | "active";

interface RouteWaypoint {
	latitude: number;
	longitude: number;
	name: string;
}

interface RouteInfo {
	duration: number;
	distance: number;
	legs: { duration: number; distance: number }[];
}

// Mock Places
const FAVORITE_PLACES = [
	{ 
		id: "1",
		name: "Home",
		icon: "home" as const,
		address: "Via Luigi Mercantini 1, Milan, Italy"
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
	const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
	const [weather, setWeather] = useState<{ temp: number; code: number } | null>(null);



	const [isRecording, setIsRecording] = useState(false);
	const [messages, setMessages] = useState<ChatMsg[]>([
		{ role: "assistant", content: "Hi! I'm Elmo. Where do you want to go?" }
	]);
	const [inputText, setInputText] = useState("");
	const [isProcessing, setIsProcessing] = useState(false);

	const [navigationState, setNavigationState] =
		useState<NavigationState>("idle");
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
	const [autopilotEnabled, setAutopilotEnabled] = useState(true);
	const [useNativeTTS, setUseNativeTTS] = useState(false);
	const [isMuted, setIsMuted] = useState(false);
	const [currentSpeedLimit, setCurrentSpeedLimit] = useState(50); // Default speed limit
	const [nextStopDistance, setNextStopDistance] = useState<number | null>(null);
	const [nextStopDuration, setNextStopDuration] = useState<number | null>(null);
	const [routeOptions, setRouteOptions] = useState<RouteOptions>({
		avoidTolls: false,
		avoidFerries: false,
		avoidHighways: false,
	});
	const [syncServerUrl, setSyncServerUrl] = useState("172.20.10.6:3001");
	const [deviceRole, setDeviceRole] = useState<DeviceRole>("car1-main");
	
	// Convoy Sync State
	const [isSyncConnected, setIsSyncConnected] = useState(false);
	const [pendingStopRequest, setPendingStopRequest] = useState<{
		name: string;
		latitude: number;
		longitude: number;
	} | null>(null);

	// Stops Panel State
	const [showStopsPanel, setShowStopsPanel] = useState(false);
	const [stopsPanelCategory, setStopsPanelCategory] = useState<string | null>(null);
	const [isPausedAtStop, setIsPausedAtStop] = useState(false);
	const [stopsSearchResults, setStopsSearchResults] = useState<PlaceResult[]>([]);
	const [isSearchingStops, setIsSearchingStops] = useState(false);

	// Testing Scenarios State
	const [activeScenario, setActiveScenario] = useState<null | 1 | 2>(null);
	const [scenarioStep, setScenarioStep] = useState<"modal" | "question">("modal");

	// --- Refs ---
	const mapRef = useRef<MapView>(null);
	const currentAudioRef = useRef<Audio.Sound | null>(null);
	const ttsQueue = useRef<{ text: string; shouldActivateMic: boolean }[]>([]);
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
	const routeInfoRef = useRef<RouteInfo | null>(null);
	const lastPausedLegIndex = useRef(-1); // Track last leg index where we paused to avoid loops

	// --- Effects ---

	// Sync ref
	useEffect(() => {
		autopilotEnabledRef.current = autopilotEnabled;
	}, [autopilotEnabled]);

	// Reset to real location when autopilot is disabled
	useEffect(() => {
		if (prevAutopilotEnabled.current && !autopilotEnabled && !isPausedAtStop) {
			// Autopilot was just turned off, reset to real location
			(async () => {
				try {
					const location = await Location.getCurrentPositionAsync({});
					setUserRegion({
						latitude: location.coords.latitude,
						longitude: location.coords.longitude,
						latitudeDelta: 0.01,
						longitudeDelta: 0.01,
					});
					const realSpeed = location.coords.speed && location.coords.speed > 0 ? location.coords.speed * 3.6 : 0;
					setSpeed(realSpeed);
				} catch (error) {
					console.error('Error resetting to real location:', error);
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
		setNextStopDuration(null);
		setNextStopDistance(null);
		setNextStopDuration(null);
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
		if (autopilotEnabled && !isPausedAtStop && navigationState === "active" && routeCoords.length > 1) {
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
					const currentSpeed = autopilotSpeed.current;
					if (currentSpeed < targetSpeed) {
						// Accelerate (2 m/s^2)
						autopilotSpeed.current = Math.min(targetSpeed, currentSpeed + 2 * dt);
					} else {
						// Decelerate (4 m/s^2)
						autopilotSpeed.current = Math.max(targetSpeed, currentSpeed - 4 * dt);
					}

					// 3. Move
					const distanceToMove = autopilotSpeed.current * dt; // meters
					
					// Update range (convert meters to km)
					setRemainingRange(prev => Math.max(0, prev - (distanceToMove / 1000)));

					// Update total distance traveled (for progress bar)
					distanceTraveled.current += distanceToMove;
					distanceTraveledOnCurrentRoute.current += distanceToMove;
					
					// Get current segment distance
					const pStart = routeCoords[autopilotIndex.current];
					const pEnd = routeCoords[autopilotIndex.current + 1];
					
					if (!pStart || !pEnd) {
						// End of route
						setNavigationState("preview");
						setAutopilotEnabled(false);
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
							setNavigationState("preview");
							setAutopilotEnabled(false);
							return;
						}
					}

					// 4. Calculate new position
					const currentPStart = routeCoords[autopilotIndex.current];
					const currentPEnd = routeCoords[autopilotIndex.current + 1];
					
					const newLat = currentPStart.latitude + (currentPEnd.latitude - currentPStart.latitude) * autopilotProgress.current;
					const newLng = currentPStart.longitude + (currentPEnd.longitude - currentPStart.longitude) * autopilotProgress.current;
					
					if (isNaN(newLat) || isNaN(newLng)) {
						return;
					}

					// 5. Calculate Bearing for Camera
					const bearing = getBearing(
						{ latitude: currentPStart.latitude, longitude: currentPStart.longitude },
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

					// 7. Update Camera with proper centering
					if (mapRef.current) {
						mapRef.current.animateCamera({
							center: { latitude: newLat, longitude: newLng },
							heading: bearing,
							pitch: 60,
							zoom: 18,
							altitude: 100, // Required for iOS
						}, { duration: 100 }); // Smooth update
					}

					// 8. Calculate distance and time to next stop
					// Use routeInfoRef to get legs
					const currentRouteInfo = routeInfoRef.current;
					if (currentRouteInfo && currentRouteInfo.legs.length > 0) {
						// Determine which leg we are on based on distanceTraveledOnCurrentRoute
						let remainingDistInLeg = 0;
						let currentLegIndex = 0;
						let accumulatedDistance = 0;

						for (let i = 0; i < currentRouteInfo.legs.length; i++) {
							const legDist = currentRouteInfo.legs[i].distance;
							if (distanceTraveledOnCurrentRoute.current < accumulatedDistance + legDist) {
								currentLegIndex = i;
								remainingDistInLeg = (accumulatedDistance + legDist) - distanceTraveledOnCurrentRoute.current;
								break;
							}
							accumulatedDistance += legDist;
						}

						// If we exceeded all legs (shouldn't happen if logic is correct), default to 0
						if (remainingDistInLeg < 0) remainingDistInLeg = 0;

						setNextStopDistance(remainingDistInLeg);
						// Estimate time based on current speed or average speed
						// If speed is very low, use a default average (e.g. 50km/h = ~13.8m/s) to avoid huge times
						const estSpeed = Math.max(autopilotSpeed.current, 5); 
						setNextStopDuration(remainingDistInLeg / estSpeed);

						// Check if WE (the car) are close to the stop (waypoint or destination)
						// We can check if remainingDistInLeg is small
						if (remainingDistInLeg < 25) {
							// If it's a waypoint (not the last leg), pause.
							// If it's the last leg, we arrive (handled above by routeCoords check, but good to double check)
							if (currentLegIndex < currentRouteInfo.legs.length - 1) {
								// Only pause if we haven't already paused for this leg
								if (lastPausedLegIndex.current !== currentLegIndex) {
									setIsPausedAtStop(true);
									// Do NOT disable autopilot here, just pause the loop via state
									lastPausedLegIndex.current = currentLegIndex;
								}
							}
						}
					} else if (destination) {
						// Fallback if no legs info (shouldn't happen with OSRM/Mapbox usually)
						// Calculate remaining distance along route from current position
						let remainingDist = 0;
						for (let i = autopilotIndex.current; i < routeCoords.length - 1; i++) {
							const segDist = getDistance(routeCoords[i], routeCoords[i + 1]);
							if (i === autopilotIndex.current) {
								remainingDist += segDist * (1 - autopilotProgress.current);
							} else {
								remainingDist += segDist;
							}
						}
						setNextStopDistance(remainingDist);
						setNextStopDuration(remainingDist / (autopilotSpeed.current || 13.89));
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
	}, [autopilotEnabled, isPausedAtStop, navigationState, routeCoords]);

	// Helper for bearing
	function getBearing(start: any, end: any) {
		const startLat = toRad(start.latitude || start[0]);
		const startLng = toRad(start.longitude || start[1]);
		const endLat = toRad(end.latitude || end[0]);
		const endLng = toRad(end.longitude || end[1]);

		const y = Math.sin(endLng - startLng) * Math.cos(endLat);
		const x = Math.cos(startLat) * Math.sin(endLat) -
				Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLng - startLng);
		const brng = toDeg(Math.atan2(y, x));
		return (brng + 360) % 360;
	}

	function toRad(deg: number) {
		return deg * Math.PI / 180;
	}

	function toDeg(rad: number) {
		return rad * 180 / Math.PI;
	}

	function getDistance(start: { latitude: number; longitude: number }, end: { latitude: number; longitude: number }) {
		const R = 6371e3; // metres
		const φ1 = toRad(start.latitude);
		const φ2 = toRad(end.latitude);
		const Δφ = toRad(end.latitude - start.latitude);
		const Δλ = toRad(end.longitude - start.longitude);

		const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
				Math.cos(φ1) * Math.cos(φ2) *
				Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

		return R * c;
	}

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
			setSpeed(location.coords.speed && location.coords.speed > 0 ? location.coords.speed * 3.6 : 0); // m/s to km/h

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

						const isNavigating = navigationStateRef.current === "active";
						const newLoc = { latitude: data.data.latitude, longitude: data.data.longitude };
						
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
								zoom: isNavigating ? 18 : 17
							});
						} else {
							// Smooth animation for small movements
							mapRef.current?.animateCamera({
								center: newLoc,
								heading: data.data.heading || 0,
								pitch: isNavigating ? 60 : 0,
								altitude: isNavigating ? 100 : 1000,
								zoom: isNavigating ? 18 : 17
							}, { duration: 1000 }); // Smoother animation matching update interval
						}
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
						setRouteWaypoints(data.data);
						break;

					case "route":
						setRouteCoords(data.data.coordinates);
						setRouteInfo({
							duration: data.data.duration,
							distance: data.data.distance,
							legs: data.data.legs,
						});
						
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
								mapRef.current?.animateCamera({
									center: {
										latitude: userRegionRef.current.latitude,
										longitude: userRegionRef.current.longitude,
									},
									heading: userHeading, // Heading might still be stale, but less critical
									pitch: 60,
									altitude: 100,
									zoom: 18,
								}, { duration: 1000 });
							}
							
							// Reset transition flag after animation
							setTimeout(() => {
								isTransitioningRef.current = false;
							}, 1000);
						}

						if (data.data.state === "idle") {
							setRouteCoords([]);
							setRouteInfo(null);
							setDestination(null);
							setRouteWaypoints([]);
							
							// Reset camera to idle view
							if (userRegionRef.current) {
								mapRef.current?.animateCamera({
									center: {
										latitude: userRegionRef.current.latitude,
										longitude: userRegionRef.current.longitude,
									},
									heading: userHeading,
									pitch: 0,
									altitude: 2000,
									zoom: 17,
								}, { duration: 1000 });
							}
						}
						break;

				}
			}

			// Handle stop requests (Main Car Only)
			if (deviceRole === "car1-main" && data.type === "request_add_waypoint") {
				console.log(`[ConvoySync] Received request_add_waypoint: ${data.data.name}`);
				addStopRef.current(data.data.name, data.data.latitude, data.data.longitude);
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
			convoySync.send('range', { remainingRange: currentIntRange });
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
				distance: routeInfo.distance,
				legs: routeInfo.legs,
			});
		}
	}, [routeCoords, routeInfo, deviceRole, isSyncConnected]);

	// 1st Car Main - Broadcast Chat History
	useEffect(() => {
		if (deviceRole !== "car1-main" || !isSyncConnected) return;
		
		convoySync.send('chat_history', { messages });
	}, [messages, deviceRole, isSyncConnected]);

	// Weather Logic (Moved from TopBar)
	const weatherIntervalRef = useRef<number | null>(null);
	const weatherLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);

	// Effect 1: Watch for location and store it once
	useEffect(() => {
		if (userRegion && !weatherLocationRef.current) {
			weatherLocationRef.current = { latitude: userRegion.latitude, longitude: userRegion.longitude };
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
							if (deviceRole === 'car1-main' && isSyncConnected) {
								convoySync.send('weather', newWeather);
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
	}, [deviceRole, isSyncConnected, navigationState, routeInfo, nextStopDistance, nextStopDuration]);

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
	async function playRecordingBeep(type: 'start' | 'stop') {
		try {
			// Haptic feedback
			await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

			// Create a simple beep sound
			const frequency = type === 'start' ? 800 : 600; // Higher pitch for start, lower for stop
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
			
			writeString(0, 'RIFF');
			view.setUint32(4, 36 + numSamples * 2, true);
			writeString(8, 'WAVE');
			writeString(12, 'fmt ');
			view.setUint32(16, 16, true); // fmt chunk size
			view.setUint16(20, 1, true); // PCM format
			view.setUint16(22, 1, true); // mono
			view.setUint32(24, sampleRate, true);
			view.setUint32(28, sampleRate * 2, true); // byte rate
			view.setUint16(32, 2, true); // block align
			view.setUint16(34, 16, true); // bits per sample
			writeString(36, 'data');
			view.setUint32(40, numSamples * 2, true);
			
			// Generate sine wave
			for (let i = 0; i < numSamples; i++) {
				const t = i / sampleRate;
				const envelope = Math.min(1, (numSamples - i) / (sampleRate * 0.02)); // Fade out
				const sample = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.3; // 30% volume
				const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
				view.setInt16(44 + i * 2, intSample, true);
			}
			
			// Write to temp file and play
			const beepPath = `${FileSystem.Paths.cache.uri}beep_${type}_${Date.now()}.wav`;
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
			console.warn('Failed to play recording beep:', err);
		}
	}

	// TTS Playback with Queue
	async function playActualTTS(text: string): Promise<void> {
		console.log('[TTS] Starting playback for:', text.substring(0, 50));
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

				// Generate TTS audio
		console.log('[TTS] Calling Groq API for audio generation...');
		let audioBuffer: ArrayBuffer | undefined;
		let shouldUseNative = useNativeTTS; // Check developer setting
		
		// Skip Groq if native TTS is forced
		if (!shouldUseNative) {
			try {
				audioBuffer = await createGroqTtsAudio(text);
				console.log('[TTS] Audio generated, size:', audioBuffer.byteLength, 'bytes');
			} catch (groqError: any) {
				// Check if it's a rate limit error
				if (groqError?.message?.includes('429') || groqError?.message?.includes('rate_limit')) {
					console.warn('[TTS] Groq rate limit exceeded, falling back to native TTS');
					shouldUseNative = true;
				} else {
					throw groqError; // Re-throw other errors
				}
			}
		} else {
			console.log('[TTS] Native TTS forced by developer setting');
		}

		// If Groq failed with rate limit, use native TTS
		if (shouldUseNative) {
			console.log('[TTS] Using native TTS...');
			await new Promise<void>((resolveNative) => {
				Speech.speak(text, {
					language: 'en-US',
					pitch: 1.0,
					rate: 0.9,
					onDone: () => {
						console.log('[TTS] Native TTS playback complete');
						resolveNative();
					},
					onError: (error) => {
						console.error('[TTS] Native TTS error:', error);
						resolveNative(); // Resolve anyway to continue queue
					}
				});
			});
			console.log('[TTS] Playback complete');
			resolve();
			return;
		}

		// Continue with Groq audio if it was successful
		if (!audioBuffer) {
			throw new Error('Audio buffer is undefined');
		}

				// Write audio buffer to temporary file using modern File API
				const tempFilePath = `${FileSystem.Paths.cache.uri}tts_${Date.now()}.wav`;
				
				// Create a File instance and write the buffer
				const file = new FileSystem.File(tempFilePath);
				await file.create({ overwrite: true });
				
				// Write the ArrayBuffer directly
				const uint8Array = new Uint8Array(audioBuffer);
				await file.write(uint8Array);

				// Load and play
		console.log('[TTS] Loading audio file...');
		
		// Add timeout to prevent hanging
		const loadTimeout = new Promise<never>((_, reject) => {
			setTimeout(() => reject(new Error('Audio load timeout')), 5000);
		});
		
		const { sound } = await Promise.race([
			Audio.Sound.createAsync(
				{ uri: tempFilePath },
				{ shouldPlay: false }
			),
			loadTimeout
		]);
		currentAudioRef.current = sound;
		
		console.log('[TTS] Playing audio...');
		await sound.playAsync();

		// Wait for playback to finish
		await new Promise<void>((resolvePlayback) => {
			sound.setOnPlaybackStatusUpdate(async (status) => {
				if (status.isLoaded && status.didJustFinish) {
					console.log('[TTS] Playback finished, cleaning up...');
					// Remove listener
					sound.setOnPlaybackStatusUpdate(null);
					// Unload sound
					await sound.unloadAsync();
					currentAudioRef.current = null;
					// Delete temp file
					try {
						await file.delete();
					} catch (e) {
						console.warn('[TTS] Failed to delete temp file:', e);
					}
					resolvePlayback();
				}
			});
		});
		console.log('[TTS] Playback complete');
	} catch (error) {
		console.error('[TTS] Error during playback:', error);
		// Resolve even on error to prevent hanging
		resolve();
	}
});
	}

	async function processNextInQueue() {
		console.log(`[TTS] processNextInQueue called. Queue length: ${ttsQueue.current.length}, isProcessing: ${isProcessingTTS.current}`);
		if (isProcessingTTS.current || ttsQueue.current.length === 0) {
			console.log('[TTS] Skipping - already processing or queue empty');
			return;
		}

		isProcessingTTS.current = true;
		const item = ttsQueue.current.shift();

		if (item) {
			if (isMuted) {
				console.log('[TTS] Muted, skipping audio generation');
				isProcessingTTS.current = false;
				if (ttsQueue.current.length > 0) {
					processNextInQueue();
				}
				return;
			}
			await playActualTTS(item.text);
			
			// If this message should activate the mic and we're not already recording
			if (item.shouldActivateMic) {
				console.log('TTS ended with question, will activate mic');
				// Small delay to let the audio finish cleanly
				setTimeout(() => {
					console.log('Activating voice recognition automatically');
					// Need to call this asynchronously
					(async () => {
						try {
							const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
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
			console.log(`TTS queue has ${ttsQueue.current.length} remaining items, processing next...`);
			processNextInQueue();
		} else {
			console.log('TTS queue empty');
		}
	}

	function speakText(text: string) {
		console.log(`[TTS] Adding to queue: "${text.substring(0, 50)}..."`);
		// Check if text ends with a question mark
		const endsWithQuestion = text.trim().endsWith('?');
		
		// Add to queue
		ttsQueue.current.push({ 
			text, 
			shouldActivateMic: endsWithQuestion 
		});
		
		console.log(`[TTS] Queue length: ${ttsQueue.current.length}, isProcessing: ${isProcessingTTS.current}`);
		// Trigger processing
		processNextInQueue();
	}

	// Speech recognition event handlers
	useSpeechRecognitionEvent("start", () => {
		setIsRecording(true);
		playRecordingBeep('start');
	});

	useSpeechRecognitionEvent("end", () => {
		setIsRecording(false);
		setIsProcessing(false); // Ensure processing stops if recognition ends unexpectedly
		playRecordingBeep('stop');
	});

	useSpeechRecognitionEvent("result", (event) => {
		const transcript = event.results[0]?.transcript;
		if (transcript) {
			handleVoiceInput(transcript);
		}
	});

	useSpeechRecognitionEvent("error", (event) => {
		console.error("Speech recognition error:", event.error);
		setIsRecording(false);
		setIsProcessing(false);
	});

	async function startVoiceRecognition() {
		if (isRecording || isProcessing) return;

		try {
			const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
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
				interimResults: false,
				maxAlternatives: 1,
				continuous: false,
				requiresOnDeviceRecognition: false,
			});
		} catch (err) {
			console.error("Failed to start speech recognition", err);
			setIsProcessing(false);
		}
	}

	async function handleVoiceInput(transcript: string) {
		setIsProcessing(true);
		// Add user message optimistically
		setMessages((prev) => [
			...prev,
			{ role: "user" as const, content: transcript },
		]);

		if (!userRegion) {
			setMessages((prev) => [
				...prev,
				{ role: "assistant", content: "I need your location to help you." },
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
				destination: destination ? {
					name: destination.name,
					latitude: destination.latitude,
					longitude: destination.longitude
				} : undefined,
			}
		);

		await processLLMResponse(response);
		setIsProcessing(false);
	}

	async function processLLMResponse(response: any) {
		let autoStartFromPhrase = false;
		let shouldStartLocal = shouldAutoStart;

		// Add assistant message
		if (response.reply) {
			setMessages((prev) => [
				...prev,
				{ role: "assistant", content: response.reply },
			]);

			// Speak the response (non-blocking)
			speakText(response.reply);

			if (response.reply.toLowerCase().includes("driving you there")) {
				autoStartFromPhrase = true;
				shouldStartLocal = true;
			}
		}

		// Handle Navigation Intent
		const nav = response.navigation;
		if (nav) {
			if (nav.cancel) {
				cancelNavigation();
			} else {
				let targetLat: number | undefined;
				let targetLng: number | undefined;
				let targetName = nav.destinationName;
				let routeFound = false;

				// A. Search Query (Category)
				if (nav.searchQuery) {
					// Don't speak immediately, wait for search result
					const places = await searchPlaces(
						nav.searchQuery,
						userRegion!.latitude,
						userRegion!.longitude
					);

					if (places.length > 0) {
						const best = places[0];
						targetLat = best.latitude;
						targetLng = best.longitude;
						targetName = best.name; // Use specific name

						// Auto-start for nearest place search
						setShouldAutoStart(true);
						shouldStartLocal = true;
					} else {
						setMessages((prev) => [
							...prev,
							{
								role: "assistant",
								content: "I couldn't find any places matching that.",
							},
						]);
						return; // Stop if no place found
					}
				}
				// B. Explicit Coordinates (from LLM knowledge)
				else if (nav.coordinates) {
					targetLat = nav.coordinates.latitude;
					targetLng = nav.coordinates.longitude;
					targetName = nav.destinationName || "Destination";
				}
				// C. Geocoding (Name only)
				else if (nav.destinationName) {
					const geocoded = await Location.geocodeAsync(nav.destinationName);
					if (geocoded.length > 0) {
						targetLat = geocoded[0].latitude;
						targetLng = geocoded[0].longitude;
						targetName = nav.destinationName;
					}
				}

				// 3. Calculate Route if we have a target
				if (targetLat && targetLng) {
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
						waypointsForRoute.map(wp => ({ coordinates: [wp.latitude, wp.longitude] })),
						routeOptions
					);

					if (route) {
						setRouteCoords(route.coordinates);
						setRouteInfo({
							duration: route.duration,
							distance: route.distance,
							legs: route.legs,
						});
						routeFound = true;

						// ONLY announce distance for search queries ("nearest X"), not explicit destinations
						if (nav.searchQuery && targetName) {
							const distanceInMeters = route.distance;
							
							// Round meters first to handle edge cases like 996m -> 1000m
							const roundedMeters = Math.round(distanceInMeters / 10) * 10;
							
							let distanceText;
							
							if (roundedMeters < 1000) {
								// Show in meters (rounded to nearest 10) for distances less than 1km
								distanceText = `${roundedMeters} meter${roundedMeters !== 10 ? 's' : ''}`;
							} else {
								// Show in kilometers for 1km and above
								const km = (roundedMeters / 1000).toFixed(1);
								distanceText = `${km} kilometer${km !== '1.0' ? 's' : ''}`;
							}
							
							const foundMsg = `I've found ${targetName} at ${distanceText}. I'm now driving you there.`;
							setMessages((prev) => [
								...prev,
								{ role: "assistant", content: foundMsg },
							]);

							// Speak the found message (non-blocking)
							speakText(foundMsg);
						}
					}
				}

				// 4. Determine State
				if (routeFound) {
					if (shouldStartLocal || nav.startNavigation) {
						startNavigation();
						setShouldAutoStart(false); // Reset flag
					} else {
						setNavigationState("preview");
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
					startNavigation();
				}
			}
		}
	}

	async function handleTextSubmit() {
		if (!inputText.trim() || !userRegion) return;

		const text = inputText.trim();
		setInputText(""); // Clear input

		// Add user message
		const newMsgs = [...messages, { role: "user" as const, content: text }];
		setMessages(newMsgs);

		const response = await askElmoLLM(
			text,
			newMsgs,
			{
				latitude: userRegion.latitude,
				longitude: userRegion.longitude,
				humanReadable: undefined,
				destination: destination ? {
					name: destination.name,
					latitude: destination.latitude,
					longitude: destination.longitude
				} : undefined,
			}
		);

		await processLLMResponse(response);
	}


	// Ref to hold the latest addStopDuringNavigation function to avoid stale closures in listeners
	const addStopRef = useRef(addStopDuringNavigation);
	useEffect(() => {
		addStopRef.current = addStopDuringNavigation;
	});

	// Add a stop during active navigation (for 1st car main and 2nd car main when accepting request)
	async function addStopDuringNavigation(stopName: string, stopLat: number, stopLng: number) {
		// If car1-rear, send request to main instead of adding locally
		// We do this BEFORE checking userRegion/destination because rear might just be a remote control
		if (deviceRole === "car1-rear" && isSyncConnected) {
			console.log(`[App] Sending request_add_waypoint: ${stopName}`);
			convoySync.send("request_add_waypoint", {
				name: stopName,
				latitude: stopLat,
				longitude: stopLng,
			});
			setMessages((prev) => [
				...prev,
				{ role: "assistant", content: `Requesting to add stop at ${stopName}...` },
			]);
			return;
		}

		if (!userRegion || !destination) return;

		// Add waypoint before  destination
		const newWaypoint = {
			latitude: stopLat,
			longitude: stopLng,
			name: stopName,
		};

		setRouteWaypoints((prev) => [...prev, newWaypoint]);

		// Recalculate route with new waypoint
		const allWaypoints = [...routeWaypoints, newWaypoint];
		
		const route = await getRoute(
			[userRegion.latitude, userRegion.longitude],
			[destination.latitude, destination.longitude],
			allWaypoints.map(wp => ({ coordinates: [wp.latitude, wp.longitude] })),
			routeOptions
		);

		if (route) {
			setRouteCoords(route.coordinates);
			setRouteInfo({
				duration: route.duration,
				distance: route.distance,
				legs: route.legs,
			});

			// If 1st car main, broadcast the waypoint addition (optional, as route update handles it, but good for explicit events)
			if (deviceRole === "car1-main" && isSyncConnected) {
				convoySync.send("waypoint_added", newWaypoint);
			}

			// Show confirmation message
			setMessages((prev) => [
				...prev,
				{ role: "assistant", content: `Added stop at ${stopName}. Recalculating route...` },
			]);
		}
	}

	// Handle stop request acceptance for 2nd car main
	async function handleStopRequestAccept() {
		if (!pendingStopRequest) return;

		await addStopDuringNavigation(
			pendingStopRequest.name,
			pendingStopRequest.latitude,
			pendingStopRequest.longitude
		);

		setPendingStopRequest(null);
	}

	// Handle stop request decline for 2nd car main
	function handleStopRequestDecline() {
		setPendingStopRequest(null);
	}

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
			const results = await searchPlaces(query, userRegion.latitude, userRegion.longitude);
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
	}

	async function handleAddStopFromPanel(place: PlaceResult) {
		await addStopDuringNavigation(place.name, place.latitude, place.longitude);
		// Optional: close panel or keep it open? User said "recalculating it with the added stop but without interrupting the navigation".
		// I'll keep it open for now as it might be useful to add multiple stops or just see the result.
		// Actually, usually you want to see the map update. Let's close it to show the route update.
		// User requirement: "when the categories menu/panel opens, the "+" button becomes an "x" (close) button to close the stops panel."
		// It doesn't explicitly say to close on add, but it's better UX to see the route change.
		// However, if they want to add multiple, it's annoying.
		// Let's keep it open but maybe show a toast or just let the route update in the background (visible on the top half).
		// Since the map is 50% height, they can see the route update. I'll keep it open.
	}

	function startNavigation() {
		setNavigationState("active");
		distanceTraveled.current = 0;
		lastPausedLegIndex.current = -1;
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
			{ role: "assistant", content: "Okay, the navigation has been terminated." },
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

	function handleResumeNavigation() {
		setIsPausedAtStop(false);
		// Remove the reached waypoint (first one) if any
		if (routeWaypoints.length > 0) {
			setRouteWaypoints((prev) => prev.slice(1));
		} else if (destination) {
			// If it was the final destination, maybe just clear it? 
			// But usually "resume" implies continuing. 
			// For now, let's assume if we pause at destination, resuming just keeps us there or ends.
			// Let's just re-enable autopilot to finish the route.
		}
		// Broadcast resume
		if (isSyncConnected && deviceRole === "car1-main") {
			convoySync.send("resume_navigation", {});
		}
		setAutopilotEnabled(true);
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
				setRouteInfo({
					duration: route.duration,
					distance: route.distance,
					legs: route.legs,
				});
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
				setRouteInfo({
					duration: route.duration,
					distance: route.distance,
					legs: route.legs,
				});
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
			{/* LEFT PANEL: Dashboard Widgets (hidden for car1-rear) */}
			{deviceRole !== "car1-rear" && (
				<View style={styles.leftPanel}>
					{/* Speedometer - Always Visible */}
					<Speedometer currentSpeed={speed} speedLimit={currentSpeedLimit} />

					{/* Active Navigation Mode */}
					{navigationState === "active" && (
						<>
							<TurnDirections 
								distanceToNextStop={nextStopDistance || 0} 
								steps={(routeInfo?.legs[0] as any)?.steps || []}
							/>
							<FakeRoad />
						</>
					)}

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
								? distanceTraveled.current / (distanceTraveled.current + routeInfo.distance) 
								: 0
						}
						nextStopProgress={
							routeInfo?.distance && routeWaypoints.length > 0 && routeInfo.legs.length > 0
								? (distanceTraveled.current + routeInfo.legs[0].distance) / (distanceTraveled.current + routeInfo.distance)
								: undefined
						}
					/>
						</>
					)}

					{/* Idle Mode (No Destination) */}
					{navigationState === "idle" && (
						<>
							{/* Scenario 2 Question */}
							{activeScenario === 2 && scenarioStep === "question" ? (
								<View style={styles.scenarioQuestionContainer}>
									<Text style={styles.scenarioQuestionText}>
										Since it's later than usual, do you want me to show you the fastest way?
									</Text>
									<View style={styles.scenarioButtonRow}>
										<TouchableOpacity 
											style={[styles.scenarioAnswerButton, { backgroundColor: "#ef4444" }]}
											onPress={handleScenario2QuestionAnswer}
										>
											<Text style={styles.scenarioAnswerText}>No</Text>
										</TouchableOpacity>
										<TouchableOpacity 
											style={[styles.scenarioAnswerButton, { backgroundColor: "#22c55e" }]}
											onPress={handleScenario2QuestionAnswer}
										>
											<Text style={styles.scenarioAnswerText}>Yes</Text>
										</TouchableOpacity>
									</View>
								</View>
							) : (
								<PlacesList 
									places={FAVORITE_PLACES} 
									onSelectPlace={handleSelectPlace} 
								/>
							)}
						</>
					)}

					{/* Navigation Info Panel for Active Mode (if needed separately, but usually integrated) */}
					{/* We might want to show info panel in active mode too, below FakeRoad? */}
					{/* The design says "Left panel will display... Speedometer, Turn Directions, Fake Road". */}
					{/* But we also need to show ETA/Time/Distance. */}
					{/* Let's add NavigationInfoPanel in active mode as well, maybe at the bottom or top? */}
					{/* The user didn't explicitly say where InfoPanel goes in Active mode, but it's essential. */}
					{/* I'll add it below FakeRoad for now. */}
					{navigationState === "active" && routeInfo && (
						<View style={{ marginTop: 16 }}>
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
								legs={routeInfo.legs}
								hasWaypoints={routeWaypoints.length > 0}
								onStart={startNavigation}
								onCancel={cancelNavigation}
								navigationState={navigationState}
								isPaused={isPausedAtStop}
								onResume={handleResumeNavigation}
								totalDistance={routeInfo.distance}
								totalDuration={routeInfo.duration}
								progress={
									routeInfo.distance 
										? Math.min(1, distanceTraveled.current / routeInfo.distance)
										: 0
								}
								nextStopProgress={
									routeInfo.distance && routeWaypoints.length > 0 && routeInfo.legs.length > 0
										? routeInfo.legs[0].distance / routeInfo.distance
										: undefined
								}
							/>
						</View>
					)}
				</View>
			)}

				{/* RIGHT PANEL: Map & Overlays */}
				<View style={styles.rightPanel}>
					<View style={[
					styles.mapContainer,
					deviceRole === "car1-rear" && { paddingLeft: 12 },
					deviceRole === "car1-rear" && { paddingLeft: 12 },
				]}> 
					{/* Stops Panel Toggle Button - Only show when destination is set AND in active mode (in preview it's in the list) OR if panel is open */}
					{((destination && navigationState === "active") || showStopsPanel) && (
						<TouchableOpacity
							style={[styles.stopsPanelButton, deviceRole === "car1-rear" && { left: 20 }]}
							onPress={toggleStopsPanel}
						>
							<Ionicons
								name="add"
								size={32}
								color="#5EEAD4"
								style={{ transform: [{ rotate: showStopsPanel ? "45deg" : "0deg" }] }}
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
										<Ionicons name="navigate" size={28} color="#5EEAD4" style={{ transform: [{ rotate: `-45deg` }] }} />
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
									key={index}
									coordinate={{
										latitude: wp.latitude,
										longitude: wp.longitude,
									}}
									title={wp.name}
									pinColor="yellow"
								/>
							))}
							{routeCoords.length > 0 && (
							<Polyline
								coordinates={routeCoords}
								strokeWidth={navigationState === "active" ? 14 : 6}
								strokeColor="#14b8a6"
							/>
						)}
						</MapView>
						{/* Mute Button (Above Settings) */}
						<TouchableOpacity
							style={[
								styles.muteButton,
							]}
							onPress={() => setIsMuted(!isMuted)}
						>
							<Ionicons 
								name={isMuted ? "volume-mute-outline" : "volume-high-outline"} 
								size={28} 
								color="#5EEAD4" 
							/>
						</TouchableOpacity>

						{/* Settings Button (Top Left) */}
						<TouchableOpacity
							style={[
								styles.settingsButton,
							]}
							onPress={() => setShowSettings(true)}
						>
							<Ionicons name="settings-outline" size={28} color="#5EEAD4" />
						</TouchableOpacity>
					</View>



					{/* Stops Panel - Rendered below the map as a panel */}
					{showStopsPanel && (
						<View style={{ flex: 1, backgroundColor: "#01181C", paddingRight: 12, paddingBottom: 12 }}>
							<StopsPanel
								onCategorySelect={handleCategorySelect}
								onClose={toggleStopsPanel}
								searchResults={stopsSearchResults}
								onAddStop={handleAddStopFromPanel}
								isLoading={isSearchingStops}
								selectedCategory={stopsPanelCategory}
								deviceRole={deviceRole}
							/>
						</View>
					)}


				
					{/* Microphone Button (Top Right) */}
					<TouchableOpacity
						style={[
							styles.micButton,
							isProcessing && styles.micButtonProcessing,
						]}
						onPress={startVoiceRecognition}
						disabled={isProcessing || isRecording}
					>
						<Ionicons
							name={isRecording ? "mic" : "mic-outline"}
							size={28}
							color={isRecording || isProcessing ? "#01181C" : "#5EEAD4"}
						/>
					</TouchableOpacity>

					{/* Chat Overlay (Top Left - Hidden by default) */}
					{showChat && (
						<View style={styles.chatOverlay}>
							<ScrollView style={styles.messagesList} showsVerticalScrollIndicator={false}>
								{messages.map((msg, index) => (
									<View
										key={index}
										style={[
											styles.messageBubble,
											msg.role === "user"
												? styles.userBubble
												: styles.assistantBubble,
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
				</View>
			</View>

			<SettingsModal
				visible={showSettings}
				onClose={() => setShowSettings(false)}
				routeOptions={routeOptions}
				onOptionsChange={setRouteOptions}
				showChat={showChat}
				onToggleChat={setShowChat}
				autopilotEnabled={autopilotEnabled}
				onToggleAutopilot={setAutopilotEnabled}
				useNativeTTS={useNativeTTS}
				onToggleNativeTTS={setUseNativeTTS}
				syncServerUrl={syncServerUrl}
				onSyncServerUrlChange={setSyncServerUrl}
				deviceRole={deviceRole}
						onDeviceRoleChange={setDeviceRole}
						onStartScenario1={startScenario1}
						onStartScenario2={startScenario2}
						onResetToDefault={handleResetToDefault}
						isConnected={isSyncConnected}
					/>

			{/* Stop Request Modal for 2nd car main */}
			{pendingStopRequest && (
				<StopRequestModal
					visible={true}
					stopName={pendingStopRequest.name}
					onAccept={handleStopRequestAccept}
					onDecline={handleStopRequestDecline}
				/>
			)}
			{/* Scenario Modal */}
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
	micButtonProcessing: {
		backgroundColor: "#5EEAD4",
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
		marginBottom: 8,
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
});



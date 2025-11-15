import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type NavigationInfoPanelProps = {
	duration: number; // seconds
	distance: number; // meters
	legs: { duration: number; distance: number }[];
	hasWaypoints: boolean;
	onStart?: () => void;
	onCancel: () => void;
	navigationState: "preview" | "active";
	isPaused?: boolean;
	onResume?: () => void;
	totalDistance: number; // Total remaining trip distance
	totalDuration: number; // Total remaining trip duration
	progress?: number; // 0-1, overall trip progress
	nextStopProgress?: number; // 0-1, position of next stop on timeline
};

export function NavigationInfoPanel({
	duration,
	distance,
	legs,
	hasWaypoints,
	onStart,
	onCancel,
	navigationState,
	isPaused,
	onResume,
	totalDistance,
	totalDuration,
	progress = 0,
	nextStopProgress,
}: NavigationInfoPanelProps) {
	// Throttled values that only update once per minute
	const [throttledDuration, setThrottledDuration] = useState(duration);
	const [throttledEta, setThrottledEta] = useState("");
	const lastUpdateRef = useRef<number>(Date.now());
	const lastDurationRef = useRef<number>(duration);
	const lastLegsLengthRef = useRef<number>(legs.length);

	// Throttled distance that updates at 50m intervals
	const [throttledDistance, setThrottledDistance] = useState(
		Math.floor(distance / 50) * 50
	);

	// Detect route changes (significant change in duration/distance means new route)
	useEffect(() => {
		const durationChange = Math.abs(duration - lastDurationRef.current);
		// Update if duration changes significantly OR if number of legs changes (stop added/removed)
		const isNewRoute = durationChange > 300 || legs.length !== (lastDurationRef.current ? 0 : legs.length); // Hacky check, better to track lastLegsLength
		
		// Actually, let's just track lastLegsLength
		// But we can just assume if duration changes > 60s it's worth updating?
		// Or just always update if legs.length changes.
		
		// Let's use a more robust check:
		// If duration changes by > 1 minute OR legs length changes, reset.
		if (durationChange > 60 || (legs && legs.length !== (lastLegsLengthRef.current || 0))) {
			// Reset all throttled values immediately for new route
			setThrottledDuration(duration);
			setThrottledDistance(Math.floor(distance / 50) * 50);
			
			const currentTime = new Date();
			const arrivalTime = new Date(currentTime.getTime() + duration * 1000);
			const eta = `${arrivalTime.getHours().toString().padStart(2, "0")}:${arrivalTime
				.getMinutes()
				.toString()
				.padStart(2, "0")}`;
			setThrottledEta(eta);
			
			lastUpdateRef.current = Date.now();
			lastDurationRef.current = duration;
			lastLegsLengthRef.current = legs.length;
		}
	}, [duration, distance, legs]);

	// Update distance only when it crosses a 50m boundary
	useEffect(() => {
		const roundedDistance = Math.floor(distance / 50) * 50;
		if (roundedDistance !== throttledDistance) {
			setThrottledDistance(roundedDistance);
		}
	}, [distance, throttledDistance]);

	// Update throttled values only once per minute
	useEffect(() => {
		const now = Date.now();
		const timeSinceLastUpdate = now - lastUpdateRef.current;
		
		// Update immediately on first render or after 60 seconds
		if (timeSinceLastUpdate >= 60000 || throttledEta === "") {
			setThrottledDuration(duration);
			
			// Calculate ETA
			const currentTime = new Date();
			const arrivalTime = new Date(currentTime.getTime() + duration * 1000);
			const eta = `${arrivalTime.getHours().toString().padStart(2, "0")}:${arrivalTime
				.getMinutes()
				.toString()
				.padStart(2, "0")}`;
			setThrottledEta(eta);
			
			lastUpdateRef.current = now;
		}
	}, [duration]);

	// Format Distance
	const formatDistance = (meters: number) => {
		if (meters >= 1000) {
			return `${(meters / 1000).toFixed(1)} km`;
		}
		return `${Math.round(meters)} m`;
	};

	// Logic for multi-stop
	// If waypoints exist, legs[0] is distance/duration to next stop.
	const nextStopDistance =
		hasWaypoints && legs.length > 0 ? legs[0].distance : distance;
	const nextStopDuration =
		hasWaypoints && legs.length > 0 ? legs[0].duration : duration;

	// Format Duration Helper
	const formatDuration = (seconds: number) => {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		return h > 0 ? `${h} hr ${m} min` : `${m} min`;
	};

	// Main duration to display (for "Time" field) - use throttled value
	const mainDurationText = formatDuration(throttledDuration);

	// Total duration for multi-stop trips
	const totalDurationText = formatDuration(totalDuration);

	// Progress is now passed as prop


	return (
		<View style={styles.container}>
			<View style={styles.row}>
				<View style={styles.infoBlock}>
					<Text style={styles.label}>ETA</Text>
					<Text style={styles.value}>{throttledEta}</Text>
				</View>
				<View style={styles.infoBlock}>
					<Text style={styles.label}>Time</Text>
					<Text style={[styles.value, { color: "#5EEAD4" }]}>
						{mainDurationText}
					</Text>
				</View>
				<View style={styles.infoBlock}>
					<Text style={styles.label}>
						{hasWaypoints ? "Next Stop" : "Distance"}
					</Text>
					<Text style={styles.value}>{formatDistance(throttledDistance)}</Text>
				</View>
			</View>

			{/* Timeline */}
			<View style={styles.timelineContainer}>
				<View style={styles.timelineBackground}>
					<View style={[styles.timelineFill, { width: `${progress * 100}%` }]} />
				</View>
				{/* Next Stop Icon on Timeline */}
				{hasWaypoints && nextStopProgress !== undefined && (
					<View 
						style={[
							styles.timelineStopIcon, 
							{ left: `${nextStopProgress * 100}%` }
						]} 
					/>
				)}
			</View>

			{hasWaypoints && (
				<View style={styles.totalRow}>
					<Text style={styles.totalText}>
						Total: {formatDistance(totalDistance)} • {totalDurationText}
					</Text>
				</View>
			)}

			<View style={styles.buttonRow}>
				{navigationState === "preview" && onStart && (
					<TouchableOpacity
						style={[styles.button, styles.startButton]}
						onPress={onStart}
					>
						<Text style={styles.buttonText}>Start</Text>
					</TouchableOpacity>
				)}
				
				{isPaused && onResume && (
					<TouchableOpacity
						style={[styles.button, styles.resumeButton]}
						onPress={onResume}
					>
						<Text style={styles.buttonText}>Resume</Text>
					</TouchableOpacity>
				)}

				<TouchableOpacity
					style={[styles.button, styles.cancelButton]}
					onPress={onCancel}
				>
					<Text style={[styles.buttonText, { color: "#ef4444" }]}>End</Text>
				</TouchableOpacity>				
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		backgroundColor: "#01181C",
		borderRadius: 18,
		padding: 16,
		paddingBottom: 24,
	},
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 16,
	},
	infoBlock: {
		alignItems: "center",
	},
	label: {
		fontSize: 12,
		color: "#9ca3af",
		marginBottom: 4,
		fontWeight: "600",
	},
	value: {
		fontSize: 20,
		fontWeight: "bold",
		color: "white",
	},
	timelineContainer: {
		height: 4,
		width: "100%",
		marginVertical: 12,
	},
	timelineBackground: {
		height: 4,
		backgroundColor: "#1f2937",
		borderRadius: 2,
		overflow: "hidden",
	},
	timelineFill: {
		height: "100%",
		backgroundColor: "#5EEAD4",
	},
	timelineStopIcon: {
		position: "absolute",
		top: -4, // Center vertically relative to bar (height 4) -> top -4 makes it 12px? No.
		// Bar height is 4. We want icon to be centered.
		// Let's make icon 12x12.
		// Top should be (4 - 12) / 2 = -4.
		width: 12,
		height: 12,
		borderRadius: 6,
		backgroundColor: "#01181C",
		borderWidth: 2,
		borderColor: "#5EEAD4",
		marginLeft: -6, // Center horizontally
	},
	totalRow: {
		marginTop: 8,
		paddingTop: 12,
		borderTopWidth: 1,
		borderTopColor: "#1f2937",
		alignItems: "center",
	},
	totalText: {
		fontSize: 14,
		color: "#9ca3af",
		fontWeight: "500",
	},
	buttonRow: {
		flexDirection: "row",
		marginTop: 8,
		gap: 12,
	},
	button: {
		paddingVertical: 14,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	cancelButton: {
		flex: 1,
		backgroundColor: "transparent",
		borderWidth: 1,
		borderColor: "#ef4444",
	},
	startButton: {
		flex: 3,
		backgroundColor: "#5EEAD4",
	},
	resumeButton: {
		flex: 3,
		backgroundColor: "#5EEAD4",
	},
	buttonText: {
		color: "#01181C",
		fontSize: 16,
		fontWeight: "bold",
	},
});

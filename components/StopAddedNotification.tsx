import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PlaceResult } from "../lib/places";

interface StopAddedNotificationProps {
	stop: PlaceResult;
	onCancel: () => void;
	onDismiss: () => void;
	distance: number; // meters from current location
	duration: number; // seconds
}

export function StopAddedNotification({
	stop,
	onCancel,
	onDismiss,
	distance,
	duration,
}: StopAddedNotificationProps) {
	// Auto-dismiss after 8 seconds
	useEffect(() => {
		const timer = setTimeout(() => {
			onDismiss();
		}, 8000);
		return () => clearTimeout(timer);
	}, [onDismiss]);

	// Format distance
	const formatDistance = (meters: number) => {
		if (meters >= 1000) {
			return `${(meters / 1000).toFixed(1)} km`;
		}
		return `${Math.round(meters)} m`;
	};

	// Format duration
	const formatDuration = (seconds: number) => {
		const mins = Math.round(seconds / 60);
		if (mins >= 60) {
			const hrs = Math.floor(mins / 60);
			const remMins = mins % 60;
			return `${hrs} hr ${remMins} min`;
		}
		return `${mins} min`;
	};

	// Calculate ETA
	const getETA = (seconds: number) => {
		const now = new Date();
		const arrival = new Date(now.getTime() + seconds * 1000);
		return arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	};

	// Get icon based on name/category guess (simplified logic reflecting StopsPanel)
	const getIcon = (name: string) => {
		const n = name.toLowerCase();
		if (n.includes("restaurant") || n.includes("food")) return "restaurant";
		if (n.includes("cafe") || n.includes("coffee")) return "cafe";
		if (n.includes("market") || n.includes("shop")) return "cart";
		if (n.includes("charging") || n.includes("station")) return "flash";
		if (n.includes("hotel") || n.includes("museum")) return "map";
		return "location";
	};

	return (
		<View style={styles.container}>
			<View style={styles.content}>
				{/* Icon */}
				<View style={styles.iconContainer}>
					<Ionicons name={getIcon(stop.name) as any} size={28} color="#01181C" />
				</View>

				{/* Info */}
				<View style={styles.infoContainer}>
					<Text style={styles.title} numberOfLines={1}>Stop Added</Text>
					<Text style={styles.name} numberOfLines={1}>{stop.name}</Text>
					<View style={styles.statsRow}>
						<Text style={styles.stat}>{formatDistance(distance)}</Text>
						<Text style={styles.dot}>•</Text>
						<Text style={styles.stat}>{formatDuration(duration)}</Text>
						<Text style={styles.dot}>•</Text>
						<Text style={styles.stat}>ETA {getETA(duration)}</Text>
					</View>
				</View>

				{/* Cancel Button */}
				<TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
					<Ionicons name="close-circle" size={24} color="#ef4444" />
					<Text style={styles.cancelText}>Cancel</Text>
				</TouchableOpacity>
			</View>
			
			{/* Pointer to simulate expansion from bottom left (approximate position of + button) */}
			<View style={styles.pointer} />
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		position: "absolute",
		bottom: 20,
		left: 8, // Aligned with the create button
		// It creates a panel that looks like it expanded from the button
		backgroundColor: "#002228",
		borderRadius: 16,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.3,
		shadowRadius: 8,
		elevation: 10,
		zIndex: 100,
		minWidth: 320,
		maxWidth: "45%", // "not larger than half the mapview" (assuming map is full screen roughly)
		borderWidth: 1,
		borderColor: "#5EEAD4",
	},
	content: {
		flexDirection: "row",
		alignItems: "center",
		padding: 12,
		gap: 12,
	},
	iconContainer: {
		width: 48,
		height: 48,
		borderRadius: 24,
		backgroundColor: "#5EEAD4",
		justifyContent: "center",
		alignItems: "center",
	},
	infoContainer: {
		flex: 1,
		justifyContent: "center",
	},
	title: {
		fontSize: 12,
		color: "#5EEAD4",
		fontWeight: "600",
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	name: {
		fontSize: 16,
		fontWeight: "bold",
		color: "white",
		marginVertical: 2,
	},
	statsRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	stat: {
		fontSize: 13,
		color: "#9ca3af",
	},
	dot: {
		fontSize: 13,
		color: "#5EEAD4",
		marginHorizontal: 6,
	},
	cancelButton: {
		alignItems: "center",
		justifyContent: "center",
		paddingLeft: 8,
		borderLeftWidth: 1,
		borderLeftColor: "rgba(94, 234, 212, 0.2)",
		gap: 2,
	},
	cancelText: {
		fontSize: 11,
		color: "#ef4444",
		fontWeight: "500",
	},
	pointer: {
		// Optional: a small visual anchor if needed, but the positioned rectangle usually works well enough
		// as an "expansion". 
	}
});

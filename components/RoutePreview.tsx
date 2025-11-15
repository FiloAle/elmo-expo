import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface RoutePreviewProps {
	waypoints: { name: string; latitude: number; longitude: number }[];
	destination: { name: string; latitude: number; longitude: number } | null;
	onAddStop: () => void;
}

export function RoutePreview({ waypoints, destination, onAddStop }: RoutePreviewProps) {
	return (
		<View style={styles.container}>
			<Text style={styles.title}>Route Preview</Text>
			
			<ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
				{/* Start */}
				<View style={styles.stopItem}>
					<View style={styles.timelineContainer}>
						<View style={styles.dot} />
						<View style={styles.line} />
					</View>
					<Text style={styles.stopName}>Your Location</Text>
				</View>

				{/* Waypoints */}
				{waypoints.map((wp, index) => (
					<View key={index} style={styles.stopItem}>
						<View style={styles.timelineContainer}>
							<View style={styles.dot} />
							<View style={styles.line} />
						</View>
						<Text style={styles.stopName}>{wp.name}</Text>
					</View>
				))}

				{/* Destination */}
				{destination && (
					<View style={styles.stopItem}>
						<View style={styles.timelineContainer}>
							<Ionicons name="location" size={20} color="#5EEAD4" />
						</View>
						<Text style={[styles.stopName, styles.destinationText]}>{destination.name}</Text>
					</View>
				)}

				{/* Add Stop Button */}
				<TouchableOpacity style={styles.addStopButton} onPress={onAddStop}>
					<Ionicons name="add-circle" size={24} color="#5EEAD4" />
					<Text style={styles.addStopText}>Add Stop</Text>
				</TouchableOpacity>
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#01181C",
		borderRadius: 16,
		padding: 16,
		// Border removed
	},
	title: {
		fontSize: 18,
		fontWeight: "bold",
		color: "white",
		marginBottom: 16,
	},
	list: {
		flex: 1,
	},
	stopItem: {
		flexDirection: "row",
		alignItems: "flex-start",
		marginBottom: 4,
		minHeight: 40,
	},
	timelineContainer: {
		width: 24,
		alignItems: "center",
		marginRight: 12,
	},
	dot: {
		width: 12,
		height: 12,
		borderRadius: 6,
		backgroundColor: "#5EEAD4",
		marginBottom: 4,
	},
	line: {
		width: 2,
		flex: 1,
		backgroundColor: "rgba(94, 234, 212, 0.3)",
		minHeight: 24,
	},
	stopName: {
		flex: 1,
		fontSize: 16,
		color: "white",
		paddingTop: -2,
	},
	destinationText: {
		fontWeight: "bold",
		color: "#5EEAD4",
	},
	addStopButton: {
		flexDirection: "row",
		alignItems: "center",
		marginTop: 12,
		paddingVertical: 8,
		gap: 8,
	},
	addStopText: {
		color: "#5EEAD4",
		fontSize: 16,
		fontWeight: "600",
	},
});

import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface SpeedometerProps {
	currentSpeed: number; // in km/h
	speedLimit?: number; // in km/h
}

export function Speedometer({ currentSpeed, speedLimit }: SpeedometerProps) {
	// Determine color based on speed limit
	const isSpeeding = speedLimit && currentSpeed > speedLimit;
	const speedColor = isSpeeding ? "#ef4444" : "#5EEAD4";

	return (
		<View style={styles.container}>
			{/* Gauge Container */}
			<View style={styles.gaugeContainer}>
				{/* Gauge Background (Dark Top Half Circle) */}
				<View style={styles.gaugeBackground} />

				{/* Speed Value */}
				<View style={styles.speedTextContainer}>
					<Text style={[styles.speedValue, { color: speedColor }]}>
						{Math.round(currentSpeed)}
					</Text>
					<Text style={styles.speedUnit}>km/h</Text>
				</View>
			</View>

			{/* Speed Limit (Right Side) */}
			{speedLimit !== undefined && (
				<View style={styles.limitContainer}>
					<View style={styles.limitCircle}>
						<Text style={styles.limitValue}>{speedLimit}</Text>
					</View>
				</View>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 12,
		position: "relative",
	},
	gaugeContainer: {
		width: 260,
		height: 160, // Half circle
		alignItems: "center",
		justifyContent: "flex-end", // Align to bottom
		position: "relative",
		overflow: "hidden",
	},
	gaugeBackground: {
		position: "absolute",
		top: 32,
		left: 20,
		width: 220,
		height: 220,
		borderRadius: 300,
		backgroundColor: "transparent",
		borderWidth: 5,
		borderColor: "#ffffff22",
	},
	speedTextContainer: {
		alignItems: "center",
		justifyContent: "center",
		zIndex: 10,
		marginBottom: 10, // Push up from bottom
	},
	speedValue: {
		fontSize: 56,
		fontWeight: "800",
		lineHeight: 60,
	},
	speedUnit: {
		fontSize: 16,
		color: "#5EEAD4",
		fontWeight: "600",
		marginTop: -4,
	},
	limitContainer: {
		position: "absolute",
		right: 0,
		top: 0,
	},
	limitCircle: {
		width: 56,
		height: 56,
		borderRadius: 32,
		borderWidth: 4,
		borderColor: "#ef4444",
		backgroundColor: "white",
		alignItems: "center",
		justifyContent: "center",
	},
	limitValue: {
		fontSize: 18,
		fontWeight: "bold",
		color: "black",
	}
});

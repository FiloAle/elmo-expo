import { Maneuver } from "@/lib/navigation";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface TurnDirectionsProps {
	maneuver: Maneuver | null;
}

export function TurnDirections({ maneuver }: TurnDirectionsProps) {
	if (!maneuver) {
		return null;
	}

	const getInstruction = () => {
		const { type, distance } = maneuver;
		let icon = "navigate";
		let text = "";

		let distText = "";
		if (distance > 1000) {
			distText = (distance / 1000).toFixed(1) + " km";
		} else if (distance >= 100) {
			// Update every 50m
			distText = Math.round(distance / 50) * 50 + " m";
		} else {
			// Update every 20m
			// Ensure we don't show "0 m" prematurely if they aren't "arrived" yet?
			// But for "turn now" logic we use < 20 check anyway.
			distText = Math.round(distance / 20) * 20 + " m";
		}

		// Normalize type/modifier for better matching
		const effectiveType =
			type === "turn" && maneuver.modifier ? `turn_${maneuver.modifier}` : type;

		switch (effectiveType) {
			case "turn_right":
			case "right":
				icon = "arrow-forward";
				text = `Turn right \nin ${distText}`;
				break;
			case "turn_left":
			case "left":
				icon = "arrow-back";
				text = `Turn left \nin ${distText}`;
				break;
			case "slight_right":
				icon = "arrow-forward-circle-outline";
				text = `Bear right \nin ${distText}`;
				break;
			case "slight_left":
				icon = "arrow-back-circle-outline";
				text = `Bear left \nin ${distText}`;
				break;
			case "u_turn":
			case "uturn":
				icon = "refresh";
				text = `Make a U-turn \nin ${distText}`;
				break;
			case "sharp_right":
				icon = "arrow-forward";
				text = `Sharp right \nin ${distText}`;
				break;
			case "sharp_left":
				icon = "arrow-back";
				text = `Sharp left \nin ${distText}`;
				break;
			case "arrive":
				icon = "location";
				if (distance < 50) {
					text = "Arrived at \nwaypoint";
				} else {
					text = `Arriving \nin ${distText}`;
				}
				break;
			case "roundabout":
			case "rotary":
				icon = "refresh";
				if (maneuver.exit) {
					text = `Take exit ${maneuver.exit} \nin ${distText}`;
				} else {
					text = `Enter roundabout \nin ${distText}`;
				}
				break;
			default:
				if (maneuver.modifier) {
					if (maneuver.modifier.includes("right")) {
						icon = "arrow-forward";
						text = `Turn right \nin ${distText}`;
					} else if (maneuver.modifier.includes("left")) {
						icon = "arrow-back";
						text = `Turn left \nin ${distText}`;
					} else {
						icon = "navigate";
						text = `Follow route \nin ${distText}`;
					}
				} else {
					icon = "navigate";
					text = `Follow route \nin ${distText}`;
				}
		}

		if (distance < 20 && type !== "arrive") {
			text = text.replace(`\nin ${distText}`, "\nnow");
		}

		return { icon, text };
	};

	const instruction = getInstruction();

	return (
		<View style={styles.container}>
			<Ionicons name={instruction.icon as any} size={48} color="#5EEAD4" />
			<Text style={styles.text}>{instruction.text}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#01181C",
		padding: 16,
		borderRadius: 16,
		// Border removed
		marginBottom: 12,
		gap: 16,
	},
	text: {
		flex: 1,
		color: "white",
		fontSize: 20,
		fontWeight: "600",
	},
});

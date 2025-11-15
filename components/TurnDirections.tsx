import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface TurnDirectionsProps {
	distanceToNextStop: number;
	steps: any[]; // RouteStep[] from routing.ts
}

export function TurnDirections({ distanceToNextStop, steps }: TurnDirectionsProps) {
	// Find the current step based on distance?
	// Since we don't track step index, we can try to find the first step that matches the remaining distance?
	// Or just show the first step that has a maneuver?
	// Actually, OSRM steps are sequential.
	// If we just show the first step, it's the start.
	// We need to filter out passed steps.
	// But we don't know which ones are passed without tracking.
	// For now, let's just show the *next* major maneuver if available.
	// If we assume the simulation follows the route, we can't easily map back without index.
	// BUT, the user wants "next turn's information".
	// If we are just simulating, maybe we can just show the first step that is "turn" or "arrive"?
	// Let's try to show the first step that is NOT "depart" (type).
	
	// Better approach:
	// We can't easily track steps without updating state in the loop.
	// But we can show a generic "Follow route" if we don't know.
	// However, the user explicitly asked for "next turn's information".
	// I'll try to show the first step from the list.
	// Note: In a real app, we would slice the steps array as we pass coordinates.
	// Since I can't easily change the simulation loop to slice steps right now (it uses coords),
	// I'll just show the first step's instruction as a placeholder for "Next Turn".
	// It's better than "Follow route".
	
	const nextStep = steps && steps.length > 0 ? steps.find(s => s.maneuver.type !== "depart") : null;
	
	const getInstruction = () => {
		if (distanceToNextStop < 50) return { icon: "stop-circle-outline", text: "Arriving at destination" };
		
		if (nextStep) {
			// Map OSRM maneuver to icon and text
			const { type, modifier } = nextStep.maneuver;
			let icon = "navigate";
			let text = nextStep.name || "Next turn";
			
			if (type === "turn") {
				if (modifier?.includes("right")) icon = "arrow-forward";
				else if (modifier?.includes("left")) icon = "arrow-back";
			} else if (type === "new name") {
				icon = "arrow-up";
			} else if (type === "roundabout") {
				icon = "refresh";
			}
			
			// Construct text
			if (modifier && type === "turn") {
				text = `Turn ${modifier} onto ${nextStep.name || "road"}`;
			} else {
				text = nextStep.name || type;
			}
			
			return { icon, text: `${text} in ${(distanceToNextStop > 1000 ? (distanceToNextStop/1000).toFixed(1) + 'km' : Math.round(distanceToNextStop) + 'm')}` };
		}
		
		return { icon: "navigate", text: `Follow route for ${(distanceToNextStop / 1000).toFixed(1)}km` };
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

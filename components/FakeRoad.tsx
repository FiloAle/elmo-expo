import React from "react";
import { Image, StyleSheet, View } from "react-native";

export function FakeRoad() {
	return (
		<View style={styles.container}>
			{/* Road Surface */}
			<View style={styles.road}>
				{/* Left Border */}
				<View style={styles.borderLeft} />

				{/* Right Border */}
				<View style={styles.borderRight} />
			</View>

			
			{/* Car Render */}
			<Image 
				source={require("../assets/images/car.png")} 
				style={styles.car}
				resizeMode="contain"
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		height: 120,
		width: "100%",
		backgroundColor: "transparent",
		overflow: "hidden",
		justifyContent: "flex-end",
		alignItems: "center",
	},
	road: {
		width: "60%",
		height: "150%",
		position: "relative",
		overflow: "hidden",
		transform: [{ perspective: 100 }, { rotateX: "45deg" }],
		marginBottom: -20, // Pull it down a bit
	},
	borderLeft: {
		position: "absolute",
		left: 10,
		top: 0,
		bottom: 0,
		width: 4,
		backgroundColor: "white",
	},
	borderRight: {
		position: "absolute",
		right: 10,
		top: 0,
		bottom: 0,
		width: 4,
		backgroundColor: "white",
	},
	centerLineContainer: {
		position: "absolute",
		left: "50%",
		top: 0,
		bottom: 0,
		width: 4,
		marginLeft: -2,
		justifyContent: "space-between",
		paddingVertical: 10,
	},
	car: {
		position: "absolute",
		bottom: -8,
		width: 200,
		height: 120,
		zIndex: 60,
	},
});

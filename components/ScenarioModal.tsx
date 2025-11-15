import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface ScenarioModalProps {
	visible: boolean;
	question: string;
	onYes: () => void;
	onNo: () => void;
}

export function ScenarioModal({
	visible,
	question,
	onYes,
	onNo,
}: ScenarioModalProps) {
	return (
		<Modal
			visible={visible}
			transparent={false}
			animationType="fade"
			statusBarTranslucent
			supportedOrientations={['landscape']}
		>
			<View style={styles.container}>
				<Text style={styles.questionText}>{question}</Text>
				<View style={styles.buttonContainer}>
					<TouchableOpacity style={styles.button} onPress={onNo}>
						<Text style={styles.buttonText}>No</Text>
					</TouchableOpacity>
					<TouchableOpacity style={[styles.button, styles.yesButton]} onPress={onYes}>
						<Text style={[styles.buttonText, styles.yesButtonText]}>Yes</Text>
					</TouchableOpacity>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#01181C",
		justifyContent: "center",
		alignItems: "center",
		padding: 40,
	},
	questionText: {
		color: "#5EEAD4",
		fontSize: 32,
		fontWeight: "bold",
		textAlign: "center",
		marginBottom: 60,
	},
	buttonContainer: {
		flexDirection: "row",
		gap: 40,
	},
	button: {
		paddingVertical: 16,
		paddingHorizontal: 40,
		borderRadius: 12,
		backgroundColor: "transparent",
		borderWidth: 2,
		borderColor: "#5EEAD4",
		minWidth: 140,
		alignItems: "center",
	},
	yesButton: {
		backgroundColor: "#5EEAD4",
	},
	buttonText: {
		color: "#5EEAD4",
		fontSize: 24,
		fontWeight: "600",
	},
	yesButtonText: {
		color: "#01181C",
	},
});

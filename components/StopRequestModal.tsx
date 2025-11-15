import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

interface StopRequestModalProps {
	visible: boolean;
	stopName: string;
	onAccept: () => void;
	onDecline: () => void;
}

export function StopRequestModal({
	visible,
	stopName,
	onAccept,
	onDecline,
}: StopRequestModalProps) {
	return (
		<Modal
			animationType="fade"
			transparent={true}
			visible={visible}
			onRequestClose={onDecline}
			supportedOrientations={['landscape']}
		>
			<View style={styles.centeredView}>
				<View style={styles.modalView}>
					<View style={styles.iconContainer}>
						<Ionicons name="location" size={48} color="#5EEAD4" />
					</View>

					<Text style={styles.title}>New Stop Added</Text>
					<Text style={styles.message}>
						The first car has added a stop at{" "}
						<Text style={styles.stopName}>{stopName}</Text>.{"\n"}
						Would you like to stop there too?
					</Text>

					<View style={styles.buttonRow}>
						<TouchableOpacity
							style={[styles.button, styles.declineButton]}
							onPress={onDecline}
						>
							<Text style={styles.declineButtonText}>Decline</Text>
						</TouchableOpacity>

						<TouchableOpacity
							style={[styles.button, styles.acceptButton]}
							onPress={onAccept}
						>
							<Ionicons name="checkmark" size={20} color="#01181C" />
							<Text style={styles.acceptButtonText}>Add Stop</Text>
						</TouchableOpacity>
					</View>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	centeredView: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(0,0,0,0.5)",
	},
	modalView: {
		width: "40%",
		maxWidth: 500,
		backgroundColor: "#01181C",
		borderRadius: 16,
		padding: 32,
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.3,
		shadowRadius: 8,
		elevation: 8,
		borderWidth: 1,
		borderColor: "#5EEAD4",
	},
	iconContainer: {
		width: 80,
		height: 80,
		borderRadius: 40,
		backgroundColor: "rgba(94, 234, 212, 0.1)",
		justifyContent: "center",
		alignItems: "center",
		marginBottom: 20,
	},
	title: {
		fontSize: 24,
		fontWeight: "bold",
		color: "white",
		marginBottom: 12,
	},
	message: {
		fontSize: 16,
		color: "#9ca3af",
		textAlign: "center",
		lineHeight: 24,
		marginBottom: 28,
	},
	stopName: {
		fontWeight: "600",
		color: "#5EEAD4",
	},
	buttonRow: {
		flexDirection: "row",
		gap: 12,
		width: "100%",
	},
	button: {
		flex: 1,
		paddingVertical: 14,
		borderRadius: 10,
		flexDirection: "row",
		justifyContent: "center",
		alignItems: "center",
		gap: 8,
	},
	declineButton: {
		backgroundColor: "transparent",
		borderWidth: 1,
		borderColor: "#5EEAD4",
	},
	declineButtonText: {
		fontSize: 16,
		fontWeight: "600",
		color: "#5EEAD4",
	},
	acceptButton: {
		backgroundColor: "#5EEAD4",
	},
	acceptButtonText: {
		fontSize: 16,
		fontWeight: "600",
		color: "#01181C",
	},
});

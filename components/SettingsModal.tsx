import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
	Modal,
	ScrollView,
	StyleSheet,
	Switch,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";

export interface RouteOptions {
	avoidTolls: boolean;
	avoidFerries: boolean;
	avoidHighways: boolean;
}

export type DeviceRole = 'car1-main' | 'car1-rear' | 'car2-main' | 'car2-rear';

interface SettingsModalProps {
	visible: boolean;
	onClose: () => void;
	routeOptions: RouteOptions;
	onOptionsChange: (options: RouteOptions) => void;
	showChat: boolean;
	onToggleChat: (show: boolean) => void;
	autopilotEnabled: boolean;
	onToggleAutopilot: (enabled: boolean) => void;
	useNativeTTS: boolean;
	onToggleNativeTTS: (enabled: boolean) => void;
	syncServerUrl: string;
	onSyncServerUrlChange: (url: string) => void;
	deviceRole: DeviceRole;
	onDeviceRoleChange: (role: DeviceRole) => void;
	onStartScenario1: () => void;
	onStartScenario2: () => void;
	onResetToDefault: () => void;
	isConnected?: boolean;
}

export function SettingsModal({
	visible,
	onClose,
	routeOptions,
	onOptionsChange,
	showChat,
	onToggleChat,
	autopilotEnabled,
	onToggleAutopilot,
	useNativeTTS,
	onToggleNativeTTS,
	syncServerUrl,
	onSyncServerUrlChange,
	deviceRole,
	onDeviceRoleChange,
	onStartScenario1,
	onStartScenario2,
	onResetToDefault,
	isConnected = false,
}: SettingsModalProps) {
	const [showDevOptions, setShowDevOptions] = useState(false);
	const [localSyncUrl, setLocalSyncUrl] = useState(syncServerUrl);

	// Update local state when prop changes (e.g. if set from outside)
	React.useEffect(() => {
		setLocalSyncUrl(syncServerUrl);
	}, [syncServerUrl]);

	const handleConnect = () => {
		onSyncServerUrlChange(localSyncUrl);
	};

	const toggleOption = (key: keyof RouteOptions) => {
		onOptionsChange({
			...routeOptions,
			[key]: !routeOptions[key],
		});
	};

	return (
		<Modal
			animationType="fade"
			transparent={true}
			visible={visible}
			onRequestClose={onClose}
			supportedOrientations={['landscape']}
		>
			<View style={styles.centeredView}>
				<View style={styles.modalContent}>
					<View style={styles.modalHeader}>
						<Text style={styles.modalTitle}>Settings</Text>
						<TouchableOpacity onPress={onClose} style={styles.closeButton}>
							<Ionicons name="close" size={24} color="white" />
						</TouchableOpacity>
					</View>

					<ScrollView showsVerticalScrollIndicator={false}>
						{/* Route Options */}
						<View style={styles.routeSection}>
							<Text style={styles.sectionTitle}>Route Options</Text>
							<View style={styles.toggleRow}>
								<Text style={styles.toggleLabel}>Avoid Tolls</Text>
								<Switch
									value={routeOptions.avoidTolls}
									onValueChange={(val) =>
										onOptionsChange({ ...routeOptions, avoidTolls: val })
									}
									trackColor={{ false: "#374151", true: "#5EEAD4" }}
									thumbColor={routeOptions.avoidTolls ? "#01181C" : "#f4f3f4"}
								/>
							</View>
							<View style={styles.toggleRow}>
								<Text style={styles.toggleLabel}>Avoid Highways</Text>
								<Switch
									value={routeOptions.avoidHighways}
									onValueChange={(val) =>
										onOptionsChange({ ...routeOptions, avoidHighways: val })
									}
									trackColor={{ false: "#374151", true: "#5EEAD4" }}
									thumbColor={routeOptions.avoidHighways ? "#01181C" : "#f4f3f4"}
								/>
							</View>
							<View style={styles.toggleRow}>
								<Text style={styles.toggleLabel}>Avoid Ferries</Text>
								<Switch
									value={routeOptions.avoidFerries}
									onValueChange={(val) =>
										onOptionsChange({ ...routeOptions, avoidFerries: val })
									}
									trackColor={{ false: "#374151", true: "#5EEAD4" }}
									thumbColor={routeOptions.avoidFerries ? "#01181C" : "#f4f3f4"}
								/>
							</View>
						</View>

						{/* Developer Options Toggle */}
						<TouchableOpacity
							style={styles.devOptionsButton}
							onPress={() => setShowDevOptions(!showDevOptions)}
						>
							<Text style={styles.devOptionsButtonText}>
								{showDevOptions ? "Hide Developer Options" : "Show Developer Options"}
							</Text>
						</TouchableOpacity>

						{/* Developer Options Content */}
						{showDevOptions && (
							<>
								{/* Device Role */}
								<View style={styles.section}>
									<Text style={styles.sectionTitle}>Device Role</Text>
									<View style={styles.roleContainer}>
										<TouchableOpacity
											style={[
												styles.roleButton,
												deviceRole === "car1-main" && styles.roleButtonActive,
											]}
											onPress={() => onDeviceRoleChange("car1-main")}
										>
											<Ionicons
												name="car-sport"
												size={24}
												color={deviceRole === "car1-main" ? "#01181C" : "#5EEAD4"}
											/>
											<Text
												style={[
													styles.roleButtonText,
													deviceRole === "car1-main" && styles.roleButtonTextActive,
												]}
											>
												1st main
											</Text>
										</TouchableOpacity>
										<TouchableOpacity
											style={[
												styles.roleButton,
												deviceRole === "car1-rear" && styles.roleButtonActive,
											]}
											onPress={() => onDeviceRoleChange("car1-rear")}
										>
											<Ionicons
												name="phone-portrait-outline"
												size={24}
												color={deviceRole === "car1-rear" ? "#01181C" : "#5EEAD4"}
											/>
											<Text
												style={[
													styles.roleButtonText,
													deviceRole === "car1-rear" && styles.roleButtonTextActive,
												]}
											>
												1st rear
											</Text>
										</TouchableOpacity>
										<TouchableOpacity
											style={[
												styles.roleButton,
												deviceRole === "car2-main" && styles.roleButtonActive,
											]}
											onPress={() => onDeviceRoleChange("car2-main")}
										>
											<Ionicons
												name="car-sport"
												size={24}
												color={deviceRole === "car2-main" ? "#01181C" : "#5EEAD4"}
											/>
											<Text
												style={[
													styles.roleButtonText,
													deviceRole === "car2-main" && styles.roleButtonTextActive,
												]}
											>
												2nd main
											</Text>
										</TouchableOpacity>
									</View>
								</View>

								{/* Sync Server URL */}
								<View style={styles.section}>
									<Text style={styles.sectionTitle}>Sync Server URL</Text>
									<View style={styles.inputRow}>
										<TextInput
											style={styles.input}
											value={localSyncUrl}
											onChangeText={setLocalSyncUrl}
											placeholder="192.168.1.1:3001"
											placeholderTextColor="#6b7280"
											autoCapitalize="none"
											autoCorrect={false}
										/>
										<TouchableOpacity 
											style={styles.connectButton}
											onPress={handleConnect}
										>
											<Text style={styles.connectButtonText}>Connect</Text>
										</TouchableOpacity>
										<View style={[styles.connectionIndicator, { backgroundColor: isConnected ? "#22c55e" : "#ef4444" }]} />
									</View>
								</View>

								{/* Toggles */}
								<View style={styles.section}>
									<Text style={styles.sectionTitle}>Preferences</Text>
									
									<View style={styles.toggleRow}>
										<Text style={styles.toggleLabel}>Show Chat Overlay</Text>
										<Switch
											value={showChat}
											onValueChange={onToggleChat}
											trackColor={{ false: "#374151", true: "#5EEAD4" }}
											thumbColor={showChat ? "#01181C" : "#f4f3f4"}
										/>
									</View>

									<View style={styles.toggleRow}>
										<Text style={styles.toggleLabel}>Autopilot Simulation</Text>
										<Switch
											value={autopilotEnabled}
											onValueChange={onToggleAutopilot}
											trackColor={{ false: "#374151", true: "#5EEAD4" }}
											thumbColor={autopilotEnabled ? "#01181C" : "#f4f3f4"}
										/>
									</View>

									<View style={styles.toggleRow}>
										<Text style={styles.toggleLabel}>Use Native TTS (Offline)</Text>
										<Switch
											value={useNativeTTS}
											onValueChange={onToggleNativeTTS}
											trackColor={{ false: "#374151", true: "#5EEAD4" }}
											thumbColor={useNativeTTS ? "#01181C" : "#f4f3f4"}
										/>
									</View>
								</View>

								{/* Scenarios - Only for Car 1 Main */}
								{deviceRole === "car1-main" && (
									<View style={styles.section}>
										<Text style={styles.sectionTitle}>Debug Scenarios</Text>
										<View style={styles.buttonGrid}>
											<TouchableOpacity
												style={styles.scenarioButton}
												onPress={onStartScenario1}
											>
												<Text style={styles.scenarioButtonText}>Monte Bianco</Text>
											</TouchableOpacity>
											<TouchableOpacity
												style={styles.scenarioButton}
												onPress={onStartScenario2}
											>
												<Text style={styles.scenarioButtonText}>Busto Garolfo</Text>
											</TouchableOpacity>
										</View>

										{deviceRole === "car1-main" && (
											<TouchableOpacity
												style={styles.resetButton}
												onPress={onResetToDefault}
											>
												<Ionicons name="refresh" size={20} color="#01181C" />
												<Text style={styles.resetButtonText}>Reset to Default</Text>
											</TouchableOpacity>
										)}
									</View>
								)}
							</>
						)}
					</ScrollView>
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
	modalContent: {
		backgroundColor: "#01181C",
		borderRadius: 20,
		width: "90%",
		maxWidth: 400,
		maxHeight: "80%",
		padding: 20,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 8,
		elevation: 5,
	},
	modalHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 20,
		paddingBottom: 12,
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: "bold",
		color: "white",
	},
	closeButton: {
		padding: 4,
	},
	routeSection: {
		marginBottom: 8,
	},
	section: {
		marginBottom: 32,
	},
	sectionTitle: {
		fontSize: 16,
		fontWeight: "600",
		color: "#5EEAD4",
		marginBottom: 12,
	},
	toggleRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 12,
	},
	toggleLabel: {
		fontSize: 16,
		color: "white",
	},
	buttonGrid: {
		flexDirection: 'row',
		gap: 8,
		alignItems: 'center',
	},
	scenarioButton: {
		flex: 1,
		backgroundColor: "transparent",
		padding: 12,
		borderRadius: 8,
		alignItems: "center",
		borderWidth: 1,
		borderColor: "#5EEAD4",
	},
	scenarioButtonText: {
		color: "#5EEAD4",
		fontWeight: "500",
	},
	resetButton: {
		flexDirection: "row",
		backgroundColor: "#5EEAD4",
		padding: 12,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		marginTop: 8,
	},
	resetButtonText: {
		color: "#01181C",
		fontWeight: "600",
		fontSize: 16,
	},
	roleContainer: {
		flexDirection: "row",
		gap: 12,
	},
	roleButton: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		padding: 12,
		borderRadius: 8,
		backgroundColor: "transparent",
		borderWidth: 1,
		borderColor: "#5EEAD4",
	},
	roleButtonActive: {
		backgroundColor: "#5EEAD4",
	},
	roleButtonText: {
		color: "#5EEAD4",
		fontWeight: "500",
	},
	roleButtonTextActive: {
		color: "#01181C",
		fontWeight: "600",
	},
	inputRow: {
		flexDirection: 'row',
		gap: 8,
		alignItems: 'center',
	},
	input: {
		flex: 1,
		backgroundColor: "#01181C",
		borderWidth: 1,
		borderColor: "#5EEAD4",
		borderRadius: 8,
		padding: 10,
		fontSize: 16,
		color: "white",
	},
	connectButton: {
		backgroundColor: "#5EEAD4",
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderRadius: 8,
		justifyContent: 'center',
	},
	connectButtonText: {
		color: "#01181C",
		fontWeight: "600",
		fontSize: 14,
	},
	devOptionsButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 12,
	},
	devOptionsButtonText: {
		color: "#5EEAD4",
		fontSize: 12,
		fontWeight: "400",
	},
	connectionIndicator: {
		width: 12,
		height: 12,
		borderRadius: 6,
		marginLeft: 4,
	},
});

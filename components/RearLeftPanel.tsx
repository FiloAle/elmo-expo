import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState, useRef } from "react";
import { ChatMsg } from "@/lib/elmoClient";
import {
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
	ScrollView,
	TextInput,
	Image,
	Platform,
} from "react-native";
import { searchPlaces, PlaceResult } from "@/lib/places"; // Import searchPlaces

interface RearLeftPanelProps {
	routeInfo: any;
	navigationState: "idle" | "active" | "preview";
	messages: ChatMsg[];
	onSendMessage: (text: string) => void;
	isRecording: boolean;
	onToggleMic: () => void;
	distanceTraveled: number;
	currentLocation?: { latitude: number; longitude: number };
	onSelectPlace?: (place: PlaceResult) => void;
	onAddStop?: (place: PlaceResult) => void;
	stopsProgress?: number[];
	streamingText?: string;
}

const IDLE_SUGGESTIONS = [
	"What's interesting around here?",
	"Find a good restaurant nearby",
	"Tell me a fun fact about this place",
];

const TRIP_SUGGESTIONS = [
	"What could we see along the way?",
	"What could we do tonight at our destination?",
	"Any interesting facts about this area?",
];

export function RearLeftPanel({
	routeInfo,
	navigationState,
	messages,
	onSendMessage,
	isRecording,
	onToggleMic,
	distanceTraveled,
	currentLocation,
	onSelectPlace,
	onAddStop,
	stopsProgress,
	streamingText,
}: RearLeftPanelProps) {
	const [inputText, setInputText] = useState("");
	const scrollViewRef = useRef<ScrollView>(null);
	const streamingScrollRef = useRef<ScrollView>(null);
	const [pois, setPois] = useState<PlaceResult[]>([]);
	const lastFetchTime = useRef<number>(0);

	// Fetch Interesting Places
	useEffect(() => {
		if (currentLocation) {
			const now = Date.now();
			// Update only if 2 minutes have passed since last fetch
			if (now - lastFetchTime.current < 120000) {
				return;
			}

			console.log(
				"[RearLeftPanel] Fetching POIs for location:",
				currentLocation
			);
			lastFetchTime.current = now;

			(async () => {
				try {
					// Search for interesting places within ~50km
					// Using "attraction" which maps to "[tourism=attraction]"
					const results = await searchPlaces(
						"attraction",
						currentLocation.latitude,
						currentLocation.longitude
					);
					console.log("[RearLeftPanel] POI results:", results?.length);
					if (results && results.length > 0) {
						setPois(results.slice(0, 5));
					}
				} catch (e) {
					console.error("[RearLeftPanel] POI fetch error:", e);
					// Reset fetch time on error so we can try again sooner if needed,
					// or keep it to avoid spamming the erroring API?
					// Let's keep the throttle to be safe.
				}
			})();
		}
	}, [currentLocation]);

	const handleSend = () => {
		if (inputText.trim()) {
			onSendMessage(inputText);
			setInputText("");
		}
	};

	// Calculate progress & dynamic stats
	const totalDistance = routeInfo?.distance || 1;
	const progress = Math.min(Math.max(distanceTraveled / totalDistance, 0), 1);

	// Calculate remaining values
	let remainingDist = Math.max(
		0,
		(routeInfo?.distance || 0) - distanceTraveled
	);
	let remainingDur =
		(remainingDist / (routeInfo?.distance || 1)) * (routeInfo?.duration || 0);

	// Handle multi-leg (Next Stop logic) to match Main Car
	if (routeInfo?.legs && routeInfo.legs.length > 1) {
		let distAccum = 0;
		for (const leg of routeInfo.legs) {
			if (distAccum + leg.distance > distanceTraveled) {
				const distInLeg = distanceTraveled - distAccum;
				const legRemDist = Math.max(0, leg.distance - distInLeg);
				const legRemDur = (legRemDist / leg.distance) * leg.duration;
				remainingDist = legRemDist;
				remainingDur = legRemDur;
				break;
			}
			distAccum += leg.distance;
		}
	}

	const eta = new Date(Date.now() + remainingDur * 1000);

	return (
		<View style={styles.container}>
			{/* Top Section: Trip Info - Only show if routeInfo exists */}
			{routeInfo && (
				<View style={styles.tripInfoCard}>
					<View style={styles.tripHeader}>
						<View>
							<Text style={styles.etaText}>
								{eta.toLocaleTimeString([], {
									hour: "2-digit",
									minute: "2-digit",
								})}
							</Text>
							<Text style={styles.arrivalLabel}>Arrival</Text>
						</View>
						<View style={styles.tripStats}>
							<View style={styles.statItem}>
								<Ionicons name="time-outline" size={16} color="#9ca3af" />
								<Text style={styles.statText}>
									{Math.round(remainingDur / 60)} min
								</Text>
							</View>
							<View style={styles.statItem}>
								<Ionicons name="location-outline" size={16} color="#9ca3af" />
								<Text style={styles.statText}>
									{(remainingDist / 1000).toFixed(1)} km
								</Text>
							</View>
						</View>
					</View>

					{/* Progress Bar */}
					<View style={styles.progressContainer}>
						<View style={styles.progressTrack}>
							<View
								style={[styles.progressBar, { width: `${progress * 100}%` }]}
							/>
							{/* Intermediate Stop Icons on Track */}
						</View>
						{/* Intermediate Stop Icons on Track (Outside overflow:hidden track) */}
						{stopsProgress &&
							stopsProgress.map((stopProg, idx) => (
								<View
									key={idx}
									style={[
										styles.timelineStopIcon,
										{ left: `${stopProg * 100}%` },
									]}
								/>
							))}
						{/* Navigation Arrow */}
						<View style={[styles.navArrow, { left: `${progress * 100}%` }]}>
							{/* Background Fill Icon - Absolute centered */}
							<Ionicons
								name="navigate"
								size={24}
								color="#01181C"
								style={{
									position: "absolute",
									top: 0,
									left: 0,
									transform: [{ rotate: "45deg" }],
								}}
							/>
							{/* Outline Icon - Overlay */}
							<Ionicons
								name="navigate-outline"
								size={24}
								color="#5EEAD4"
								style={{ transform: [{ rotate: "45deg" }] }}
							/>
						</View>
					</View>
				</View>
			)}

			{/* Bottom Section: Elmo Assistant */}
			<View style={styles.assistantContainer}>
				{/* Chat Area */}
				<ScrollView
					ref={scrollViewRef}
					style={styles.chatArea}
					contentContainerStyle={styles.chatContent}
					showsVerticalScrollIndicator={true}
					onContentSizeChange={() =>
						scrollViewRef.current?.scrollToEnd({ animated: true })
					}
				>
					{/* Welcome Message */}
					<View style={[styles.messageBubbleLeft, { marginBottom: 12 }]}>
						<Text style={styles.messageTextLeft}>
							Hi, I'm Elmo. What can I help you with?
						</Text>
					</View>

					{/* Chat History */}
					{messages.map((msg, idx) => (
						<View
							key={idx}
							style={{
								width: "100%",
								alignItems: msg.role === "user" ? "flex-end" : "flex-start",
								marginBottom: 12,
							}}
						>
							<View
								style={
									msg.role === "user"
										? styles.messageBubbleRight
										: styles.messageBubbleLeft
								}
							>
								<Text
									style={
										msg.role === "user"
											? styles.messageTextRight
											: styles.messageTextLeft
									}
								>
									{msg.content}
								</Text>
							</View>
							{msg.places && msg.places.length > 0 && (
								<ScrollView
									horizontal
									showsHorizontalScrollIndicator={false}
									style={{ marginTop: 8 }}
									contentContainerStyle={{ paddingRight: 40 }}
								>
									{msg.places.map((place, pIdx) => (
										<PlaceBubbleItem
											key={pIdx}
											place={place}
											navigationState={navigationState}
											onSelect={onSelectPlace}
											onAdd={onAddStop}
										/>
									))}
								</ScrollView>
							)}
						</View>
					))}
				</ScrollView>

				{/* Quick Suggestions - Persistent Horizontal Scroll */}
				<View style={styles.suggestionsContainer}>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={styles.suggestionsContent}
					>
						{(routeInfo ? TRIP_SUGGESTIONS : IDLE_SUGGESTIONS).map(
							(sug, idx) => (
								<TouchableOpacity
									key={idx}
									style={styles.suggestionChip}
									onPress={() => {
										console.log("[RearLeftPanel] Suggestion clicked:", sug);
										onSendMessage(sug);
									}}
								>
									<Text style={styles.suggestionText}>{sug}</Text>
								</TouchableOpacity>
							)
						)}
					</ScrollView>
				</View>

				{/* Input Area */}
				<View style={styles.inputContainer}>
					{streamingText === undefined ? (
						<TextInput
							style={styles.input}
							placeholder="Ask Elmo..."
							placeholderTextColor="#6b7280"
							value={inputText}
							onChangeText={setInputText}
							onSubmitEditing={handleSend}
						/>
					) : (
						<ScrollView
							horizontal
							showsHorizontalScrollIndicator={false}
							style={styles.input}
							contentContainerStyle={{
								alignItems: "center",
								flexGrow: 1,
								paddingRight: 20,
							}}
							onContentSizeChange={(w, h) => {
								streamingScrollRef.current?.scrollToEnd({ animated: true });
							}}
							ref={streamingScrollRef}
						>
							<Text style={{ color: "white", fontSize: 16 }}>
								{streamingText}
							</Text>
						</ScrollView>
					)}
					<TouchableOpacity
						style={[
							styles.actionButton,
							(inputText.length > 0 || isRecording) &&
								styles.actionButtonActive,
						]}
						onPress={inputText.length > 0 ? handleSend : onToggleMic}
					>
						<Ionicons
							name={
								inputText.length > 0 ? "arrow-up" : isRecording ? "stop" : "mic"
							}
							size={24}
							color="#01181C"
						/>
					</TouchableOpacity>
				</View>
			</View>

			{/* POIs - Persistent Panel Below Chat */}
			{pois.length > 0 && (
				<View style={styles.poiContainer}>
					<Text style={styles.sectionTitle}>Interesting Nearby</Text>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						style={styles.poiScroll}
					>
						{pois.map((poi, idx) => (
							<TouchableOpacity
								key={idx}
								style={styles.poiCard}
								onPress={() => onSelectPlace?.(poi)}
							>
								{poi.image && (
									<Image source={{ uri: poi.image }} style={styles.poiImage} />
								)}
								<View style={styles.poiOverlay}>
									<Text style={styles.poiName} numberOfLines={1}>
										{poi.name}
									</Text>
									<Text style={styles.poiDistance}>
										{(poi.distance || 0) < 1000
											? `${poi.distance}m`
											: `${((poi.distance || 0) / 1000).toFixed(1)}km`}
									</Text>
								</View>
							</TouchableOpacity>
						))}
					</ScrollView>
				</View>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		gap: 12,
	},
	tripInfoCard: {
		backgroundColor: "#01181C",
		borderRadius: 16,
		padding: 16,
		borderWidth: 1,
		borderColor: "#112e33",
	},
	tripHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
		marginBottom: 16,
	},
	etaText: {
		fontSize: 32,
		fontWeight: "bold",
		color: "white",
		lineHeight: 38,
	},
	arrivalLabel: {
		fontSize: 14,
		color: "#9ca3af",
		fontWeight: "500",
	},
	tripStats: {
		alignItems: "flex-end",
		gap: 4,
	},
	statItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	statText: {
		color: "#9ca3af",
		fontSize: 14,
		fontWeight: "500",
	},
	progressContainer: {
		height: 6,
		// Container acts as wrapper now
		justifyContent: "center", // Align items vertically if needed
	},
	progressTrack: {
		height: 6,
		backgroundColor: "#112e33",
		borderRadius: 3,
		overflow: "hidden",
	},
	progressBar: {
		height: "100%",
		backgroundColor: "#5EEAD4",
		borderRadius: 3,
	},
	timelineStopIcon: {
		position: "absolute",
		top: -3, // Center relative to height 6 -> (6-12)/2 = -3
		width: 12,
		height: 12,
		borderRadius: 6,
		backgroundColor: "#01181C",
		borderWidth: 2,
		borderColor: "#5EEAD4",
		marginLeft: -6,
	},
	navArrow: {
		position: "absolute",
		top: -9.5, // Moved up another 0.25px from -9.25
		marginLeft: -12, // -24/2
		width: 24,
		height: 24,
		justifyContent: "center",
		alignItems: "center",
		zIndex: 20,
		elevation: 10,
	},
	assistantContainer: {
		flex: 1,
		backgroundColor: "#01181C",
		borderRadius: 16,
		borderWidth: 1,
		borderColor: "#112e33",
		overflow: "hidden",
		display: "flex",
		flexDirection: "column",
	},
	chatArea: {
		flex: 1,
	},
	chatContent: {
		padding: 16,
		paddingBottom: 20,
	},
	messageBubbleLeft: {
		backgroundColor: "#112e33",
		padding: 12,
		borderRadius: 12,
		borderTopLeftRadius: 2,
		maxWidth: "85%",
	},
	messageBubbleRight: {
		backgroundColor: "#5EEAD4",
		padding: 12,
		borderRadius: 12,
		borderTopRightRadius: 2,
		maxWidth: "85%",
	},
	messageTextLeft: {
		color: "#e5e7eb",
		fontSize: 15,
		lineHeight: 22,
	},
	messageTextRight: {
		color: "#01181C",
		fontSize: 15,
		fontWeight: "500",
		lineHeight: 22,
	},
	suggestionsContainer: {
		maxHeight: 50,
		marginBottom: 8,
	},
	suggestionsContent: {
		paddingHorizontal: 12,
		gap: 8,
		alignItems: "center",
	},
	suggestionChip: {
		backgroundColor: "#112e33",
		paddingVertical: 8,
		paddingHorizontal: 14,
		borderRadius: 20,
		borderWidth: 1,
		borderColor: "#5EEAD4",
	},
	suggestionText: {
		color: "#5EEAD4",
		fontSize: 13,
		fontWeight: "500",
	},
	poiContainer: {
		paddingVertical: 12,
		backgroundColor: "#01181C",
		borderRadius: 16,
		borderWidth: 1,
		borderColor: "#112e33",
		// No top border logic needed, it's a separate card now
	},
	sectionTitle: {
		color: "#9ca3af",
		fontSize: 14,
		fontWeight: "600",
		marginLeft: 16,
		marginBottom: 8,
	},
	poiScroll: {
		paddingHorizontal: 16,
	},
	poiCard: {
		width: 140,
		height: 100,
		borderRadius: 12,
		marginRight: 12,
		overflow: "hidden",
		backgroundColor: "#112e33",
	},
	poiImage: {
		width: "100%",
		height: "100%",
	},
	poiOverlay: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		padding: 8,
		backgroundColor: "rgba(0,0,0,0.6)",
	},
	poiName: {
		color: "white",
		fontSize: 12,
		fontWeight: "bold",
	},
	poiDistance: {
		color: "#5EEAD4",
		fontSize: 10,
	},
	inputContainer: {
		flexDirection: "row",
		alignItems: "center",
		padding: 12,
		borderTopWidth: 1,
		borderTopColor: "#112e33",
		gap: 12,
		backgroundColor: "#01181C",
	},
	input: {
		flex: 1,
		height: 44,
		backgroundColor: "#112e33",
		borderRadius: 22,
		paddingHorizontal: 20,
		color: "white",
		fontSize: 16,
	},
	actionButton: {
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: "#5EEAD4",
		justifyContent: "center",
		alignItems: "center",
		opacity: 0.8,
	},
	actionButtonActive: {
		opacity: 1,
		transform: [{ scale: 1.05 }],
	},
});

function PlaceBubbleItem({
	place,
	navigationState,
	onSelect,
	onAdd,
}: {
	place: PlaceResult;
	navigationState: string;
	onSelect?: (p: PlaceResult) => void;
	onAdd?: (p: PlaceResult) => void;
}) {
	const [viewState, setViewState] = useState<"normal" | "add_prompt" | "added">(
		"normal"
	);

	const handlePress = () => {
		if (navigationState === "active") {
			if (viewState === "normal") setViewState("add_prompt");
		} else {
			onSelect?.(place);
		}
	};

	const handleAdd = () => {
		onAdd?.(place);
		setViewState("added");
		setTimeout(() => setViewState("normal"), 3000);
	};

	return (
		<TouchableOpacity
			style={[styles.poiCard, { width: 160, height: 120 }]}
			onPress={handlePress}
			activeOpacity={0.9}
		>
			{place.image && (
				<Image source={{ uri: place.image }} style={styles.poiImage} />
			)}

			<View style={styles.poiOverlay}>
				<Text style={styles.poiName} numberOfLines={1}>
					{place.name}
				</Text>
				<Text style={styles.poiDistance}>
					{(place.distance || 0) < 1000
						? `${place.distance}m`
						: `${((place.distance || 0) / 1000).toFixed(1)}km`}
				</Text>
			</View>

			{viewState === "add_prompt" && (
				<View
					style={[
						StyleSheet.absoluteFill,
						{
							backgroundColor: "rgba(0,0,0,0.8)",
							justifyContent: "center",
							alignItems: "center",
						},
					]}
				>
					<TouchableOpacity
						onPress={handleAdd}
						style={{ alignItems: "center", gap: 4 }}
					>
						<View
							style={{
								width: 40,
								height: 40,
								borderRadius: 20,
								backgroundColor: "#5EEAD4",
								justifyContent: "center",
								alignItems: "center",
							}}
						>
							<Ionicons name="add" size={28} color="#01181C" />
						</View>
						<Text
							style={{ color: "#5EEAD4", fontSize: 12, fontWeight: "bold" }}
						>
							Add Stop
						</Text>
					</TouchableOpacity>
					<TouchableOpacity
						style={{ position: "absolute", top: 4, right: 4 }}
						onPress={() => setViewState("normal")}
					>
						<Ionicons name="close" size={20} color="white" />
					</TouchableOpacity>
				</View>
			)}

			{viewState === "added" && (
				<View
					style={[
						StyleSheet.absoluteFill,
						{
							backgroundColor: "rgba(0,0,0,0.8)",
							justifyContent: "center",
							alignItems: "center",
						},
					]}
				>
					<View
						style={{
							width: 40,
							height: 40,
							borderRadius: 20,
							backgroundColor: "#5EEAD4",
							justifyContent: "center",
							alignItems: "center",
						}}
					>
						<Ionicons name="checkmark" size={28} color="#01181C" />
					</View>
					<Text
						style={{
							color: "#5EEAD4",
							fontSize: 12,
							fontWeight: "bold",
							marginTop: 4,
						}}
					>
						Added
					</Text>
				</View>
			)}
		</TouchableOpacity>
	);
}

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
	FlatList,
	Image,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { PlaceResult } from "../lib/places";

interface StopsPanelProps {
	onCategorySelect: (category: string) => void;
	onClose: () => void;
	searchResults: PlaceResult[];
	onAddStop: (place: PlaceResult) => void;
	onRemoveStop?: (place: PlaceResult) => void;
	isLoading: boolean;
	selectedCategory: string | null;
	deviceRole?: string;
	myStopRequests?: string[]; // IDs of places requested by me
	declinedStopRequests?: string[]; // IDs of places declined by main
	addedStops?: string[]; // IDs of places successfully added
	onCancelRequest?: (place: PlaceResult) => void;
}

const CATEGORIES = [
	{ id: "restaurant", icon: "restaurant" },
	{ id: "cafe", icon: "cafe" },
	{ id: "supermarket", icon: "cart" },
	{ id: "charging_station", icon: "flash" },
	{ id: "tourism", icon: "map" },
];

export function StopsPanel({
	onCategorySelect,
	searchResults,
	onAddStop,
	onRemoveStop,
	isLoading,
	selectedCategory,
	deviceRole,
	myStopRequests = [],
	declinedStopRequests = [],
	addedStops = [],
	onCancelRequest,
}: StopsPanelProps) {
	return (
		<View
			style={[styles.wrapper, deviceRole === "car1-rear" && { marginLeft: 12 }]}
		>
			<View style={styles.container}>
				{/* Left Column: Categories */}
				<View style={styles.categoriesColumn}>
					{CATEGORIES.map((cat) => (
						<TouchableOpacity
							key={cat.id}
							style={[styles.categoryItem]}
							onPress={() => onCategorySelect(cat.id)}
						>
							<View
								style={[
									styles.iconContainer,
									selectedCategory === cat.id && styles.iconContainerActive,
								]}
							>
								<Ionicons
									name={cat.icon as any}
									size={24}
									color={selectedCategory === cat.id ? "#01181C" : "#5EEAD4"}
								/>
							</View>
						</TouchableOpacity>
					))}
				</View>

				{/* Right Area: Results */}
				<View style={styles.resultsArea}>
					{isLoading ? (
						<View style={styles.centerContent}>
							<Text style={styles.loadingText}>Searching...</Text>
						</View>
					) : searchResults.length > 0 ? (
						<FlatList
							data={searchResults}
							horizontal
							showsHorizontalScrollIndicator={false}
							contentContainerStyle={styles.resultsList}
							keyExtractor={(item, index) =>
								`${item.latitude}-${item.longitude}-${index}`
							}
							renderItem={({ item }) => (
								<PlaceCard
									place={item}
									onAdd={() => onAddStop(item)}
									onRemove={onRemoveStop ? () => onRemoveStop(item) : undefined}
									deviceRole={deviceRole}
									requestStatus={
										deviceRole === "car1-rear"
											? addedStops.includes(item.id || item.name)
												? "added"
												: declinedStopRequests.includes(item.name)
												? "declined"
												: myStopRequests.includes(item.id || item.name)
												? "pending"
												: "idle"
											: undefined
									}
									onCancelRequest={
										onCancelRequest ? () => onCancelRequest(item) : undefined
									}
								/>
							)}
						/>
					) : selectedCategory ? (
						<View style={styles.centerContent}>
							<Text style={styles.emptyText}>No results found</Text>
						</View>
					) : (
						<View style={styles.centerContent}>
							<Text style={styles.placeholderText}>
								Select a category to find stops
							</Text>
						</View>
					)}
				</View>
			</View>
			{/* Triangle Pointer */}
			<View style={styles.triangle} />
		</View>
	);
}

function PlaceCard({
	place,
	onAdd,
	onRemove,
	deviceRole,
	requestStatus, // For rear seat: 'idle' | 'pending' | 'added' | 'declined'
	onCancelRequest,
}: {
	place: PlaceResult;
	onAdd: () => void;
	onRemove?: () => void;
	deviceRole?: string;
	requestStatus?: "idle" | "pending" | "added" | "declined";
	onCancelRequest?: (place?: PlaceResult) => void;
}) {
	const [showAdd, setShowAdd] = React.useState(false);
	// Local status for main driver feedback simulation
	const [status, setStatus] = React.useState<"idle" | "adding" | "added">(
		"idle"
	);

	// Determine effective status based on role
	const isRear = deviceRole === "car1-rear";

	// If Rear, use prop-based status. If Main, use local simulation (existing logic)
	const effectiveStatus = isRear ? requestStatus || "idle" : status;

	const handleAddPress = () => {
		if (isRear) {
			onAdd(); // Request stop
			setShowAdd(false); // Close overlay? Or keep open to show "Requested"?
			// Actually keep it open or rely on parent rerender
		} else {
			setStatus("adding");
			onAdd();
			setTimeout(() => {
				setStatus("added");
			}, 1000);
		}
	};

	const handleCancelPress = () => {
		if (onCancelRequest) onCancelRequest(place);
	};

	const handleRemovePress = () => {
		if (onRemove) onRemove();
		setStatus("idle");
	};

	const isAdded = effectiveStatus === "added";
	const isAdding = status === "adding"; // Only for main local simulation
	const isPending = effectiveStatus === "pending";
	const isDeclined = effectiveStatus === "declined";

	return (
		<TouchableOpacity
			style={[
				styles.card,
				(showAdd || isAdded || isPending) && styles.cardActive,
				isDeclined && styles.cardDeclined,
			]}
			onPress={() =>
				!isAdded && !isPending && !isDeclined && setShowAdd(!showAdd)
			}
			activeOpacity={0.9}
		>
			<View style={styles.cardContent}>
				{place.image && (
					<Image source={{ uri: place.image }} style={styles.cardImage} />
				)}
				<View style={styles.cardInfo}>
					<Text style={styles.placeName} numberOfLines={1}>
						{place.name}
					</Text>
					<Text style={styles.placeDistance}>
						{(place.distance || 0) < 1000
							? `${place.distance} m`
							: `${((place.distance || 0) / 1000).toFixed(1)} km`}
					</Text>
				</View>
			</View>

			{/* Added Overlay */}
			{isAdded && (
				<View style={styles.addedOverlay}>
					<Ionicons name="checkmark-circle" size={48} color="#5EEAD4" />
					<Text style={styles.overlayText}>
						{isRear ? "Accepted" : "Added"}
					</Text>
				</View>
			)}

			{/* Declined Overlay (Rear) */}
			{isDeclined && (
				<View style={styles.declinedOverlay}>
					<Ionicons name="close-circle" size={48} color="#ff4d4d" />
					<Text style={styles.overlayText}>Declined</Text>
				</View>
			)}

			{(showAdd || isAdding || isPending) && !isDeclined && !isAdded && (
				<View style={styles.buttonContainer}>
					{!isPending && !isAdding && (
						<TouchableOpacity style={styles.addButton} onPress={handleAddPress}>
							<Ionicons
								name={isRear ? "add" : "add"}
								size={24}
								color="#01181C"
							/>
							<Text style={styles.addButtonText}>
								{isRear ? "Request Stop" : "Add Stop"}
							</Text>
						</TouchableOpacity>
					)}

					{effectiveStatus === "pending" && (
						<TouchableOpacity
							style={[styles.addButton, styles.pendingButton]}
							onPress={handleCancelPress}
						>
							<Text style={styles.addButtonText}>Stop Requested</Text>
							<View style={styles.cancelBadge}>
								<Text style={styles.cancelText}>Cancel</Text>
							</View>
						</TouchableOpacity>
					)}

					{isAdding && (
						<TouchableOpacity
							style={[styles.addButton, styles.addingButton]}
							activeOpacity={1}
						>
							<Ionicons name="checkmark" size={24} color="#01181C" />
							<Text style={styles.addButtonText}>Added</Text>
						</TouchableOpacity>
					)}

					{isAdded && (
						<TouchableOpacity
							style={[
								styles.addButton,
								isRear ? styles.addingButton : styles.removeButton,
							]}
							onPress={!isRear ? handleRemovePress : undefined}
							activeOpacity={isRear ? 1 : 0.7}
						>
							<Ionicons
								name={isRear ? "checkmark" : "trash"}
								size={20}
								color={isRear ? "#01181C" : "#ff4d4d"}
							/>
							<Text
								style={[
									styles.addButtonText,
									!isRear && styles.removeButtonText,
								]}
							>
								{isRear ? "Added" : "Remove Stop"}
							</Text>
						</TouchableOpacity>
					)}
				</View>
			)}
		</TouchableOpacity>
	);
}

const styles = StyleSheet.create({
	wrapper: {
		// Removed absolute positioning to allow panel layout
		width: "100%",
		flex: 1, // Fill parent
		alignItems: "center",
		marginTop: 12,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.3,
		shadowRadius: 8,
		elevation: 10,
	},
	container: {
		flexDirection: "row",
		backgroundColor: "#002228", // Updated background
		borderRadius: 16,
		// Border removed
		flex: 1, // Fill container
		overflow: "hidden",
	},
	triangle: {
		position: "absolute",
		top: -10,
		left: 31, // Adjusted for center alignment or specific button position
		width: 0,
		height: 0,
		backgroundColor: "transparent",
		borderStyle: "solid",
		borderLeftWidth: 10,
		borderRightWidth: 10,
		borderBottomWidth: 0,
		borderTopWidth: 10,
		borderLeftColor: "transparent",
		borderRightColor: "transparent",
		borderBottomColor: "transparent",
		borderTopColor: "#002228", // Border color
		transform: [{ rotate: "180deg" }],
	},
	categoriesColumn: {
		width: 84,
		backgroundColor: "#002228",
		paddingVertical: 16,
		paddingHorizontal: 12,
		gap: 4,
	},
	categoryItem: {
		flexDirection: "row",
		alignItems: "center",
		padding: 8,
		borderRadius: 12,
		gap: 12,
	},
	iconContainer: {
		width: 42,
		height: 42,
		borderRadius: 24,
		backgroundColor: "#01181C",
		justifyContent: "center",
		alignItems: "center",
	},
	iconContainerActive: {
		backgroundColor: "#5EEAD4",
	},
	resultsArea: {
		flex: 1,
		padding: 16,
	},
	centerContent: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	loadingText: {
		color: "#5EEAD4",
		fontSize: 16,
	},
	emptyText: {
		color: "#5EEAD4",
		fontSize: 16,
	},
	placeholderText: {
		color: "#9ca3af",
		fontSize: 16,
	},
	resultsList: {
		gap: 16,
		paddingRight: 16,
		alignItems: "center",
	},
	card: {
		width: 220,
		height: 200,
		backgroundColor: "#002228",
		borderRadius: 16,
		padding: 0,
		borderWidth: 1,
		borderColor: "#01181C",
		justifyContent: "space-between",
		overflow: "hidden",
	},
	cardActive: {
		borderColor: "#5EEAD4",
	},
	cardDeclined: {
		borderColor: "#ff4d4d",
	},
	cardContent: {
		flex: 1,
	},
	cardImage: {
		width: "100%",
		height: 120,
		backgroundColor: "#1f2937",
	},
	cardInfo: {
		padding: 12,
		gap: 4,
	},
	placeName: {
		fontSize: 16,
		fontWeight: "600",
		color: "white",
	},
	placeDistance: {
		fontSize: 14,
		color: "#5EEAD4",
	},
	buttonContainer: {
		position: "absolute",
		bottom: 12,
		left: 12,
		right: 12,
		zIndex: 20,
	},
	addButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#5EEAD4",
		paddingVertical: 8,
		borderRadius: 8,
		gap: 6,
	},
	addingButton: {
		opacity: 0.8,
	},
	removeButton: {
		backgroundColor: "rgba(20, 0, 0, 0.8)",
		borderWidth: 1,
		borderColor: "#ff4d4d",
	},
	addButtonText: {
		color: "#01181C",
		fontWeight: "600",
		fontSize: 14,
	},
	removeButtonText: {
		color: "#ff4d4d",
	},
	addedOverlay: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(0, 0, 0, 0.7)",
		justifyContent: "center",
		alignItems: "center",
		zIndex: 10,
		gap: 8,
		paddingBottom: 64, // Same position as declined
	},
	declinedOverlay: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(0, 0, 0, 0.8)",
		justifyContent: "center",
		alignItems: "center",
		zIndex: 10,
		gap: 8,
		paddingBottom: 64, // Matched with addedOverlay
	},
	overlayText: {
		color: "white",
		fontWeight: "bold",
		fontSize: 16,
	},
	pendingButton: {
		backgroundColor: "#fbbf24", // Amber/Yellow
		justifyContent: "space-between",
		paddingHorizontal: 12,
	},
	cancelBadge: {
		backgroundColor: "rgba(0,0,0,0.2)",
		paddingHorizontal: 8,
		paddingVertical: 2,
		borderRadius: 4,
	},
	cancelText: {
		fontSize: 12,
		fontWeight: "600",
		color: "#451a03",
	},
});

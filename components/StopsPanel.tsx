import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
	FlatList,
	Image,
	StyleSheet,
	Text,
	TouchableOpacity,
	View
} from "react-native";
import { PlaceResult } from "../lib/places";

interface StopsPanelProps {
	onCategorySelect: (category: string) => void;
	onClose: () => void;
	searchResults: PlaceResult[];
	onAddStop: (place: PlaceResult) => void;
	isLoading: boolean;
	selectedCategory: string | null;
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
	isLoading,
	selectedCategory,
	deviceRole,
}: StopsPanelProps & { deviceRole?: string }) {
	return (
		<View style={[styles.wrapper, deviceRole === "car1-rear" && { marginLeft: 12 }]}>
			<View style={styles.container}>
				{/* Left Column: Categories */}
				<View style={styles.categoriesColumn}>
					{CATEGORIES.map((cat) => (
						<TouchableOpacity
							key={cat.id}
							style={[
								styles.categoryItem,
							]}
							onPress={() => onCategorySelect(cat.id)}
						>
							<View style={[
								styles.iconContainer,
								selectedCategory === cat.id && styles.iconContainerActive
							]}>
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
							keyExtractor={(item, index) => `${item.latitude}-${item.longitude}-${index}`}
							renderItem={({ item }) => (
								<PlaceCard place={item} onAdd={() => onAddStop(item)} />
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
}: {
	place: PlaceResult;
	onAdd: () => void;
}) {
    const [showAdd, setShowAdd] = React.useState(false);

	return (
		<TouchableOpacity 
            style={[styles.card, showAdd && styles.cardActive]} 
            onPress={() => setShowAdd(!showAdd)}
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
            
            {showAdd && (
                <TouchableOpacity style={styles.addButton} onPress={onAdd}>
                    <Ionicons name="add" size={24} color="#01181C" />
                    <Text style={styles.addButtonText}>Add Stop</Text>
                </TouchableOpacity>
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
        alignItems: 'center',
	},
	card: {
		width: 220,
		height: 200,
		backgroundColor: "#002228",
		borderRadius: 16,
		padding: 0,
        borderWidth: 1,
        borderColor: "#01181C",
        justifyContent: 'space-between',
        overflow: 'hidden',
	},
    cardActive: {
        borderColor: "#5EEAD4",
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
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#5EEAD4',
        paddingVertical: 8,
        borderRadius: 8,
        gap: 6,
        margin: 12,
        marginTop: 0,
    },
    addButtonText: {
        color: '#01181C',
        fontWeight: '600',
        fontSize: 14,
    }
});

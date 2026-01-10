import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export interface Place {
	id: string;
	name: string;
	address?: string;
	icon?: keyof typeof Ionicons.glyphMap;
	latitude?: number;
	longitude?: number;
}

interface PlacesListProps {
	places: Place[];
	onSelectPlace: (place: Place) => void;
}

export function PlacesList({ places, onSelectPlace }: PlacesListProps) {
	return (
		<View style={styles.container}>
			<Text style={styles.header}>Places</Text>
			<View style={styles.list}>
				{places.map((place) => (
					<TouchableOpacity
						key={place.id}
						style={styles.item}
						onPress={() => onSelectPlace(place)}
					>
						<View style={styles.iconContainer}>
							<Ionicons
								name={place.icon || "location"}
								size={28}
								color="#5EEAD4"
							/>
						</View>
						<Text style={styles.name} numberOfLines={1}>
							{place.name}
						</Text>
					</TouchableOpacity>
				))}
				<TouchableOpacity key="add_button" style={styles.item}>
					<View style={styles.addContainer}>
						<Ionicons name={"add-outline"} size={32} color="#ffffff" />
					</View>
					<Text style={styles.name} numberOfLines={1}>
						Add
					</Text>
				</TouchableOpacity>
			</View>
			<TouchableOpacity style={styles.searchBar}>
				<Ionicons name="search" size={20} color="#9ca3af" />
				<Text style={styles.searchText}>Search places</Text>
			</TouchableOpacity>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		paddingVertical: 24,
	},
	header: {
		fontSize: 18,
		fontWeight: "bold",
		color: "#ffffff",
	},
	list: {
		flexDirection: "row",
		justifyContent: "space-between",
	},
	item: {
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 12,
	},
	iconContainer: {
		width: 60,
		height: 60,
		borderRadius: 36,
		backgroundColor: "#5EEAD444",
		alignItems: "center",
		justifyContent: "center",
	},
	addContainer: {
		width: 60,
		height: 60,
		borderRadius: 36,
		backgroundColor: "#ffffff33",
		alignItems: "center",
		justifyContent: "center",
	},
	info: {
		flex: 1,
	},
	name: {
		fontSize: 12,
		fontWeight: "medium",
		color: "#ffffffcc",
		marginTop: 4,
	},
	searchBar: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#01181C",
		borderWidth: 1,
		borderColor: "#112e33",
		borderRadius: 18,
		padding: 12,
		marginTop: 24,
		gap: 12,
	},
	searchText: {
		color: "#9ca3af",
		fontSize: 16,
	},
});

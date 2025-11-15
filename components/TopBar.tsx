
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

type TopBarProps = {
	location?: { latitude: number; longitude: number };
	remainingRange: number;
	weather: { temp: number; code: number } | null;
};

export function TopBar({ location, remainingRange, weather }: TopBarProps) {
	const [time, setTime] = useState<string>("");

	// Clock Logic
	useEffect(() => {
		const updateTime = () => {
			const now = new Date();
			const hours = now.getHours().toString().padStart(2, "0");
			const minutes = now.getMinutes().toString().padStart(2, "0");
			setTime(`${hours}:${minutes}`);
		};

		updateTime();
		const interval = setInterval(updateTime, 1000);
		return () => clearInterval(interval);
	}, []);

	const getWeatherIcon = (code: number) => {
		// OpenWeatherMap condition codes
		// https://openweathermap.org/weather-conditions
		if (code === 800) return "sunny"; // Clear sky
		if (code >= 801 && code <= 802) return "partly-sunny"; // Few/scattered clouds
		if (code >= 803 && code <= 804) return "cloudy"; // Broken/overcast clouds
		if (code >= 701 && code <= 781) return "cloud"; // Atmosphere (fog, mist, etc)
		if (code >= 300 && code <= 531) return "rainy"; // Drizzle and rain
		if (code >= 600 && code <= 622) return "snow"; // Snow
		if (code >= 200 && code <= 232) return "thunderstorm"; // Thunderstorm
		return "cloud"; // Default
	};

	return (
		<View style={styles.container}>
			{/* Left: Battery */}
			<View style={styles.leftContainer}>
				<Ionicons
					name="battery-full-outline"
					size={20}
					color="white"
					style={{ paddingBottom: 1 }}
				/>
				<Text style={styles.text}>{Math.round(remainingRange)}km</Text>
			</View>

			{/* Center: Clock */}
			<View style={styles.centerContainer}>
				<Text style={styles.text}>{time}</Text>
			</View>

			{/* Right: Weather */}
			<View style={styles.rightContainer}>
				{weather ? (
					<>
						<Ionicons
							name={getWeatherIcon(weather.code)}
							size={18}
							color="white"
							style={{ paddingBottom: 2 }}
						/>
						<Text style={styles.text}>{weather.temp}°C</Text>
					</>
				) : (
					<Text style={styles.text}>--°C</Text>
				)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		width: "100%",
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingTop: 10,
		paddingBottom: 0,
		paddingHorizontal: 20,
	},
	leftContainer: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		flex: 1,
		justifyContent: "flex-start",
	},
	centerContainer: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	rightContainer: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		flex: 1,
		justifyContent: "flex-end",
	},
	text: {
		color: "white",
		fontSize: 16,
		fontWeight: "600",
	},
});

import { LatLng } from "react-native-maps";

/**
 * Decodes a Google-encoded polyline string into an array of coordinates.
 * Source: https://github.com/mapbox/polyline/blob/master/src/polyline.js
 */
function decodePolyline(str: string, precision = 5): LatLng[] {
	let index = 0;
	let lat = 0;
	let lng = 0;
	const coordinates: LatLng[] = [];
	const factor = Math.pow(10, precision);

	while (index < str.length) {
		let byte = 0;
		let shift = 0;
		let result = 0;

		do {
			byte = str.charCodeAt(index++) - 63;
			result |= (byte & 0x1f) << shift;
			shift += 5;
		} while (byte >= 0x20);

		const latitudeChange = result & 1 ? ~(result >> 1) : result >> 1;
		lat += latitudeChange;

		shift = 0;
		result = 0;

		do {
			byte = str.charCodeAt(index++) - 63;
			result |= (byte & 0x1f) << shift;
			shift += 5;
		} while (byte >= 0x20);

		const longitudeChange = result & 1 ? ~(result >> 1) : result >> 1;
		lng += longitudeChange;

		coordinates.push({
			latitude: lat / factor,
			longitude: lng / factor,
		});
	}

	return coordinates;
}

export interface RouteStep {
	maneuver: {
		type: string;
		modifier?: string;
		location: [number, number];
	};
	name: string;
	duration: number;
	distance: number;
	geometry: string; // encoded polyline for the step
}

export interface RouteResult {
	coordinates: LatLng[];
	duration: number; // seconds
	distance: number; // meters
	legs: {
		duration: number;
		distance: number;
		steps: RouteStep[];
	}[];
}

export async function getRoute(
	start: [number, number],
	end: [number, number],
	waypoints: { coordinates: [number, number] }[] = [],
	options?: {
		avoidTolls?: boolean;
		avoidFerries?: boolean;
		avoidHighways?: boolean;
	}
): Promise<RouteResult | null> {
	try {
		// Construct coordinates string: start;waypoint1;waypoint2;...;end
		const coordinatesStr = [
			start,
			...waypoints.map((w) => w.coordinates),
			end,
		]
			.map((coord) => `${coord[1]},${coord[0]}`) // OSRM expects lon,lat
			.join(";");

		let url = `https://router.project-osrm.org/route/v1/driving/${coordinatesStr}?overview=full&geometries=polyline&steps=true`;

		// Add exclude params
		const excludes: string[] = [];
		if (options?.avoidTolls) excludes.push("toll");
		if (options?.avoidFerries) excludes.push("ferry");
		if (options?.avoidHighways) excludes.push("motorway");

		if (excludes.length > 0) {
			url += `&exclude=${excludes.join(",")}`;
		}

		const response = await fetch(url);
		const data = await response.json();

		if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
			console.error("OSRM Error:", data);
			return null;
		}

		const route = data.routes[0];
		const encodedPolyline = route.geometry;
		const coordinates = decodePolyline(encodedPolyline);

		return {
			coordinates,
			duration: route.duration,
			distance: route.distance,
			legs: route.legs.map((leg: any) => ({
				duration: leg.duration,
				distance: leg.distance,
				steps: leg.steps,
			})),
		};
	} catch (error) {
		console.error("Error fetching route:", error);
		return null;
	}
}

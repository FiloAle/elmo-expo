import { LatLng } from "react-native-maps";
import { RouteResult } from "./routing";

export interface Maneuver {
	type: string;
	modifier?: string;
	exit?: number;
	distance: number; // meters
	coordinate: LatLng;
	angle?: number; // The angle of the turn (difference in bearing)
}

function toRad(deg: number) {
	return (deg * Math.PI) / 180;
}

function toDeg(rad: number) {
	return (rad * 180) / Math.PI;
}

export function getBearing(start: LatLng, end: LatLng) {
	const startLat = toRad(start.latitude);
	const startLng = toRad(start.longitude);
	const endLat = toRad(end.latitude);
	const endLng = toRad(end.longitude);

	const y = Math.sin(endLng - startLng) * Math.cos(endLat);
	const x =
		Math.cos(startLat) * Math.sin(endLat) -
		Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLng - startLng);
	const brng = toDeg(Math.atan2(y, x));
	return (brng + 360) % 360;
}

export function getDistance(start: LatLng, end: LatLng) {
	const R = 6371e3; // metres
	const φ1 = toRad(start.latitude);
	const φ2 = toRad(end.latitude);
	const Δφ = toRad(end.latitude - start.latitude);
	const Δλ = toRad(end.longitude - start.longitude);

	const a =
		Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
		Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	return R * c;
}

/**
 * Calculates the next significant maneuver based on the route polyline and current index.
 */
export function calculateNextManeuver(
	routeCoords: LatLng[],
	currentIndex: number,
	progress: number = 0 // fractional progress between current and next point
): Maneuver | null {
	if (
		!routeCoords ||
		routeCoords.length < 2 ||
		currentIndex >= routeCoords.length - 1
	) {
		return null;
	}

	// 1. Calculate remaining distance in the current segment
	// (segment from currentIndex to currentIndex + 1)
	const currentStart = routeCoords[currentIndex];
	const currentEnd = routeCoords[currentIndex + 1];
	const segmentDist = getDistance(currentStart, currentEnd);
	let distanceToTurn = segmentDist * (1 - progress);

	// Initial bearing (current direction of travel)
	// We average the bearing of the current segment to smooth out noise?
	// Actually, generic OSRM polylines are usually simplified.
	// Let's take the bearing of the current segment.
	let currentBearing = getBearing(currentStart, currentEnd);

	// Look ahead
	for (let i = currentIndex + 1; i < routeCoords.length - 1; i++) {
		const p1 = routeCoords[i];
		const p2 = routeCoords[i + 1];

		const distance = getDistance(p1, p2);
		const bearing = getBearing(p1, p2);

		// Calculate angle difference (turn angle)
		// bearing change: current -> new
		let diff = bearing - currentBearing;

		// Normalize to -180 to 180
		while (diff > 180) diff -= 360;
		while (diff < -180) diff += 360;

		// Check for significant turn
		// Thresholds:
		// > 100: U-Turn?
		// > 60: Sharp Turn
		// > 30: Turn
		// > 10: Slight Turn (maybe ignore for instructions unless it's a fork?)

		// We accumulate distance until we find a turn > 30 degrees.
		// We accumulate distance until we find a turn > 12 degrees.
		// We accumulate distance until we find a turn > 20 degrees.
		if (Math.abs(diff) > 20) {
			// Found a turn!
			let type: Maneuver["type"] = "continue";
			if (Math.abs(diff) > 135) {
				type = "u_turn";
			} else if (diff > 20) {
				type = "turn_right";
			} else if (diff < -20) {
				type = "turn_left";
			}

			// Report the turn (now including slight ones)
			return {
				type,
				distance: distanceToTurn,
				coordinate: p1,
				angle: diff,
			};
		}

		// If no turn, add distance and update current bearing
		// We update current bearing to track the road's curve.
		// If the road curves slowly, the "diff" relative to the PREVIOUS segment will be small.
		// But we want to detect a turn relative to the "major" direction.
		// Simple approach: Update bearing at each step. This handles curves naturally.
		// A sharp turn is a sudden change between two segments.
		distanceToTurn += distance;
		currentBearing = bearing;
	}

	// specific end case
	// If we reached the end without a turn, it's "Arrive"
	return {
		type: "arrive",
		distance: distanceToTurn,
		coordinate: routeCoords[routeCoords.length - 1],
		angle: 0,
	};
}

/**
 * Uses OSRM route steps to find the next maneuver based on traveled distance.
 * This is much more accurate than geometric analysis, especially for roundabouts.
 */
export function getNextManeuverFromRoute(
	route: RouteResult,
	distanceTraveled: number
): Maneuver | null {
	if (!route || !route.legs) return null;

	let accumulatedDistance = 0;

	// Iterate through legs and steps
	for (const leg of route.legs) {
		for (const step of leg.steps) {
			// accumulatedDistance represents the start of this step
			const stepStartDist = accumulatedDistance;
			const stepEndDist = accumulatedDistance + step.distance;

			// If we are currently ON this step
			// The maneuver for this step is what got us HERE (beginning of step).
			// We want the NEXT maneuver (the one at the END of this step).
			// Actually OSRM steps are: "Drive on X street for Y meters". The maneuver "Turn right" is at the BEGINNING.
			// So if we are on Step N, the NEXT maneuver is the one for Step N+1.

			// So we look for the first step where stepStartDist > distanceTraveled.
			// That step's maneuver is the one we are approaching.

			if (stepStartDist > distanceTraveled) {
				// This is the next maneuver!
				const distanceToManeuver = stepStartDist - distanceTraveled;

				return {
					type: step.maneuver.type,
					modifier: step.maneuver.modifier,
					exit: (step.maneuver as any).exit, // Cast to any because interface might be outdated
					distance: distanceToManeuver,
					coordinate: {
						latitude: step.maneuver.location[1],
						longitude: step.maneuver.location[0],
					},
				};
			}

			accumulatedDistance += step.distance;
		}
	}

	// If no more steps found, we might be Arriving?
	// Check if we are close to the total distance
	// If we are close to the end OR have passed it, return Arrive
	// We use a generous buffer (200m) to ensure we don't return null prematurely
	const distRemaining = route.distance - distanceTraveled;
	if (distRemaining < 200) {
		return {
			type: "arrive",
			distance: Math.max(0, distRemaining),
			coordinate: route.coordinates[route.coordinates.length - 1],
		};
	}

	return null;
}

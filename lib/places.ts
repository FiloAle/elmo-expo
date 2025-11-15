export interface PlaceResult {
	name: string;
	latitude: number;
	longitude: number;
	address?: string;
	distance?: number; // in meters
	image?: string;
}

const QUERY_MAPPING: Record<string, string> = {
	"gas station": "[amenity=fuel]",
	"petrol station": "[amenity=fuel]",
	"ev charging": "charging_station",
	"charging station": "charging_station",
	"ev charging station": "charging_station",
	"electric vehicle charging": "charging_station",
	restaurant: "[amenity=restaurant]",
	pharmacy: "[amenity=pharmacy]",
	hospital: "[amenity=hospital]",
	parking: "[amenity=parking]",
	supermarket: "[shop=supermarket]",
	cafe: "[amenity=cafe]",
	bakery: "[shop=bakery]",
	atm: "[amenity=atm]",
	bank: "[amenity=bank]",
	hotel: "[tourism=hotel]",
	bar: "[amenity=bar]",
	pub: "[amenity=pub]",
	cinema: "[amenity=cinema]",
	gym: "[leisure=fitness_centre]",
	school: "[amenity=school]",
	university: "[amenity=university]",
	library: "[amenity=library]",
	"post office": "[amenity=post_office]",
	police: "[amenity=police]",
};

const AUTOGRILL_PERO_NORD = {
	name: "Autogrill Pero Nord, Italy",
	latitude: 45.51385067115633,
	longitude: 9.069810203049895,
};

export async function searchPlaces(
	query: string,
	userLat: number,
	userLon: number
): Promise<PlaceResult[]> {
	try {
		// Check if we have a mapping for this query
		const mappedQuery = QUERY_MAPPING[query.toLowerCase()] || query;
		const lowerQuery = query.toLowerCase();

		// Inject Autogrill Pero Nord for relevant queries
		let injectedResult: PlaceResult | null = null;
		if (
			lowerQuery.includes("coffee") ||
			lowerQuery.includes("cafe") ||
			lowerQuery.includes("restaurant") ||
			lowerQuery.includes("autogrill") ||
			lowerQuery.includes("break") ||
			lowerQuery.includes("stop")
		) {
			const dist = getDistance(
				userLat,
				userLon,
				AUTOGRILL_PERO_NORD.latitude,
				AUTOGRILL_PERO_NORD.longitude
			);
			injectedResult = {
				...AUTOGRILL_PERO_NORD,
				distance: Math.round(dist),
				image: generatePlaceImage(AUTOGRILL_PERO_NORD.name, "autogrill restaurant"),
			};
		}

		// If the query is a structured tag (e.g., "[amenity=fuel]"), use Overpass API
		if (mappedQuery.startsWith("[")) {
			// Parse key and value from "[key=value]"
			const match = mappedQuery.match(/\[(.*?)=(.*?)\]/);
			if (match) {
				const key = match[1];
				const value = match[2];
				const radius = 5000; // 5km radius

				// Overpass QL query: find nodes, ways, relations with key=value around user
				const overpassQuery = `[out:json];nwr(around:${radius},${userLat},${userLon})["${key}"="${value}"];out center;`;
				const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(
					overpassQuery
				)}`;

				console.log("Overpass API URL:", url);

				const response = await fetch(url);
				if (!response.ok) {
					console.error("Overpass API error:", response.status);
					return [];
				}

				const data = await response.json();
				console.log(
					`Found ${data?.elements?.length || 0} results via Overpass for ${mappedQuery}`
				);

				if (data && data.elements && data.elements.length > 0) {
					const results: PlaceResult[] = data.elements
						.map((element: any) => {
							const lat = element.lat || element.center?.lat;
							const lon = element.lon || element.center?.lon;
							const name =
								element.tags?.name ||
								element.tags?.brand ||
								element.tags?.operator ||
								`${value.replace("_", " ")} (${element.id})`;

							if (!lat || !lon) return null;

							const distance = getDistance(
								userLat,
								userLon,
								lat,
								lon
							);

							return {
								name,
								latitude: parseFloat(lat),
								longitude: parseFloat(lon),
								distance: Math.round(distance), // getDistance returns meters
								image: element.tags?.image || element.tags?.["image:url"] || generatePlaceImage(name, query),
							};
						})
						.filter((item: PlaceResult | null) => item !== null)
						.sort(
							(a: PlaceResult, b: PlaceResult) =>
								(a.distance || 0) - (b.distance || 0)
						);

					if (injectedResult) {
						results.unshift(injectedResult);
					}

					return results as PlaceResult[];
				}
				return [];
			}
		}

		// Fallback to Nominatim for non-structured queries
		// Create a rough bounding box (approx 0.04 degrees ~ 4km)
		const delta = 0.04;
		const viewbox = `${userLon - delta},${userLat + delta},${userLon + delta},${
			userLat - delta
		}`;

		const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
			mappedQuery
		)}&format=json&limit=100&viewbox=${viewbox}&bounded=1&addressdetails=1&dedupe=0`;

		console.log("Nominatim URL:", url);

		// Important: Nominatim requires a User-Agent
		const response = await fetch(url, {
			headers: {
				"User-Agent": "ElmoExpoNavigationApp/1.0",
			},
		});

		if (!response.ok) {
			console.error("Nominatim API error:", response.status);
			return [];
		}

		const data = await response.json();
		console.log(
			`Found ${data?.length || 0} results via Nominatim for: ${mappedQuery}`
		);

		if (data && data.length > 0) {
			// Calculate distance for each result and find the nearest one
			const results = data
				.map((item: any) => {
					const distance = getDistance(
						userLat,
						userLon,
						parseFloat(item.lat),
						parseFloat(item.lon)
					);
					return {
						name: item.name || item.display_name.split(",")[0],
						latitude: parseFloat(item.lat),
						longitude: parseFloat(item.lon),
						address: item.display_name,
						distance: Math.round(distance), // getDistance returns meters
						image: generatePlaceImage(item.name || item.display_name.split(",")[0], query),
					};
				})
				.sort(
					(a: any, b: any) => (a.distance || 0) - (b.distance || 0)
				);

			if (injectedResult) {
				(results as PlaceResult[]).unshift(injectedResult);
			}

			return results as PlaceResult[];
		}

		if (injectedResult) {
			return [injectedResult];
		}

		return [];
	} catch (error) {
		console.error("Error finding place:", error);
		return [];
	}
}

function getDistance(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number
): number {
	const R = 6371e3; // metres
	const φ1 = (lat1 * Math.PI) / 180;
	const φ2 = (lat2 * Math.PI) / 180;
	const Δφ = ((lat2 - lat1) * Math.PI) / 180;
	const Δλ = ((lon2 - lon1) * Math.PI) / 180;

	const a =
		Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
		Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	return R * c;
}

function generatePlaceImage(name: string, query: string): string {
	const cleanName = name.replace(/[^a-zA-Z0-9 ]/g, "");
	const prompt = `${cleanName} ${query} exterior`;
	const encodedPrompt = encodeURIComponent(prompt);
	
	// Use Bing's thumbnail service to get a real web image
	return `https://tse4.mm.bing.net/th?q=${encodedPrompt}&w=400&h=300&c=7&rs=1`;
}

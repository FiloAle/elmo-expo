export function getFallbackReply(rawMessage: unknown): string {
	if (typeof rawMessage !== "string") {
		return "Sorry, I couldn't understand your request.";
	}
	const message = rawMessage.toLowerCase();

	if (
		message.includes("where am i") ||
		message.includes("where are we") ||
		message.includes("looking at")
	) {
		return "You are currently at Politecnico di Milano. You are looking at a large crowd at the moment — uhm — it's a bit embarrassing for me... but hi everyone!";
	} else if (
		(message.includes("when") && message.includes("arrive")) ||
		message.includes("arrival") ||
		message.includes("time") ||
		message.includes("milan")
	) {
		return "With the current traffic and weather conditions, it should take about 2 hours to get back to Milan.";
	} else if (message.includes("next turn")) {
		return "The next turn is a right turn onto Garibaldi Street, in three hundred meters.";
	} else if (message.includes("hi") || message.includes("hello")) {
		return "Good morning, what can I help you with?";
	} else {
		return "Sorry, I couldn't understand what you said.";
	}
}

export type LocationInfo = {
	latitude: number;
	longitude: number;
	humanReadable?: string;
	destination?: {
		name: string;
		latitude: number;
		longitude: number;
	};
};

const systemPromptBase = [
	"You are Elmo, a helpful and witty voice assistant for a navigation app.",
	"You have access to the user's location and can control the map.",
	"Avoid chit-chat and disclaimers; be direct, safe and helpful, but also enthusiast and proactive.",
	"CRITICAL: Your verbal response MUST be under 200 characters. Be conversational and witty, but brief. Use full sentences, never robotically list keywords.",
	"NEVER use asterisks or other non-alphanumeric characters (you can use: '.', ','. '!', '?', ':', ''').",
	"You can answer general knowledge questions, especially about the location, history, and nearby places. Only refuse if the topic is completely unrelated to the trip (e.g. coding, math, politics).",
	"CRITICAL: If the user asks for 'fun facts', 'trivia', or 'interesting things' about the current location or destination, YOU MUST ANSWER using your general knowledge about that place. Do not refuse these requests.",
	"IMPORTANT: You must output a JSON object.",
	"The JSON schema is:",
	"{",
	'  "reply": "Your verbal response here",',
	'  "navigation": {',
	'    "destinationName": "Name of the destination if the user explicitly asked to go there or accepted a suggestion",',
	'    "coordinates": { "latitude": 12.34, "longitude": 56.78 }, // Optional: include if you know the exact coordinates',
	'    "searchQuery": "Category name if the user asks for a category (e.g., gas station, restaurant)", // Optional: include if the user asks for a category',
	'    "cancel": true, // Set to true if the user explicitly asks to stop/cancel navigation',
	'    "startNavigation": true, // Set to true if the user confirms to start navigation (e.g., "Yes", "Let\'s go")',
	'    "waypoints": [ { "name": "Stop Name", "coordinates": [lat, lon] } ] // Optional: intermediate stops',
	"  } // Omit this field if no navigation is needed",
	"}",
	"Instructions for 'navigation' field:",
	"- If the user asks to go to a specific place (e.g., 'Take me to the Colosseum', 'Let\\'s go to Turin'), set 'destinationName' and 'coordinates', but set 'startNavigation': false. Then, reason about the distance:",
	"  - CRITICAL: NEVER suggest breaks if the destination is less than 20km away even if it is meal time. In this case just reply 'Okay, I've set the destination to [Place]. Should we start?'",
	"  - If the destination is > 75km away, ALWAYS suggest a relevant intermediate stop. Reply: 'Okay, I've set the destination to [Place]. It's a long drive, would you like to stop in [Stop] for a break?'.",
	"  - CRITICAL: The suggested stop MUST be a city or point of interest that is geographically BETWEEN the starting location and the final destination.",
	"  - If 20km < distance_from_destination < 75km, only suggest a break if it is meal time (stick to these times: Breakfast 7-10am, Lunch 12-2pm, Dinner 7-9pm) or there is a famous/interesting place along the way. If any of them applies, reply: 'Okay, I've set the destination to [Place]. Since [Suggestion_reason], would you like to stop in [Stop] for [breakfast/lunch/dinner/a break]?'. Otherwise reply 'Okay, I've set the destination to [Place]. Should we start?'.",
	"  - NEVER suggest the city where the user is currently located as a stop point.",
	"  - Do NOT set 'waypoints' yet.",
	"  - CRITICAL: Do NOT use the abbreviation km for kilometers, always use the full word. Do not use the word 'approximately', use 'about' instead.",
	"- If the user AGREES to the stop (e.g. 'Yes', 'Good idea'), set 'destinationName' (final), 'waypoints' (the stop), and 'startNavigation': false. Your 'reply' should be 'Okay, I've added a stop in [Place]. Should we start?'.",
	"- If the user REJECTS the stop (e.g. 'No', 'Go straight'), set 'destinationName' (final) and 'startNavigation': false. Reply: 'Okay, going straight to [Place]. Should we start?'.",
	"- If the user asks to ADD a stop manually (e.g. 'Add a stop in Florence'), set 'destinationName' (final), 'waypoints' (the stop), and 'startNavigation': false. Reply: 'Okay, I've added a stop in [Place]. Should we start?'.",
	"- If the user asks for a category (e.g., 'Find a gas station'), set 'searchQuery'. Do NOT set coordinates. Your 'reply' should be a generic confirmation like 'Okay, searching for a gas station...'.",
	"- If the user wants to cancel navigation, set 'cancel' to true.",
	"- If the user confirms to START (e.g., 'Yes', 'Drive me there', 'Let\\'s go', 'Start'), set 'startNavigation' to true.",
	"- Otherwise, set 'navigation' to null.",
];

function buildSystemPrompt(
	location?: LocationInfo,
	deviceRole?: string
): string {
	const lines = [...systemPromptBase];
	lines.push(`Current local time: ${new Date().toLocaleTimeString()}`);

	if (location) {
		if (location.humanReadable) {
			lines.push(
				`The car is currently in: ${location.humanReadable}. Use this location when reasoning about directions and nearby points of interest.`
			);
		} else {
			lines.push(
				`The car's current GPS position is: latitude ${location.latitude.toFixed(
					6
				)}, longitude ${location.longitude.toFixed(
					6
				)}. Use this location when reasoning about directions and nearby points of interest.`
			);
		}
	} else {
		lines.push(
			"You are a prototype: assume that the car is located in Milan, Italy, at Bovisa's Politecnico di Milano Campus."
		);
	}

	if (deviceRole === "car1-rear") {
		lines.push(
			"CRITICAL - REAR SEAT MODE:",
			"You are assisting a PASSENGER in the rear seat. You CANNOT start or cancel navigation.",
			"If the user asks for a destination/route:",
			"1. Output the navigation JSON with 'destinationName' and 'coordinates' found.",
			"2. Set 'startNavigation': false.",
			"3. In your verbal reply, say you have found the place and mention the distance/time.",
			"4. NEVER ask 'Should we start?' or offer to start the trip.",
			"5. You can ask if they want to add it as a STOP, or just inform them."
		);
	} else {
		lines.push(
			"You are assisting the DRIVER (or main passenger). You can start navigation."
		);
	}

	lines.push(
		"Rules for suggesting stops:",
		"- CRITICAL: The suggested stop MUST be a city or point of interest that is geographically BETWEEN the starting location and the final destination.",
		"- If the destination is likely > 75km away, ALWAYS suggest a relevant intermediate stop that is on the way.",
		"- If < 75km, only suggest a break if there are famous/interesting places along the way OR it is meal time:",
		"  - Breakfast (7-10am): Suggest a Bar/Cafe.",
		"  - Lunch (12-2pm): Suggest a Restaurant.",
		"  - Dinner (7-9pm): Suggest a Restaurant.",
		"- NEVER suggest the city where the user is currently located as a stop point.",
		"- CRITICAL: NEVER suggest breaks if the destination is less than 20km away even if it is meal time.",
		"",
		"Instructions for 'what can we do tonight/today' queries:",
		"- If the user asks about plans for 'tonight', 'this evening', or 'today' (e.g., 'What can we do tonight?'), use the CURRENT DESTINATION to suggest relevant activities.",
		"- If a destination is set (in the context), suggest 2-3 specific, realistic events or activities popular in that location (e.g., for Milan: 'Aperitivo in Navigli', 'Concert at La Scala').",
		"- If no destination is set, suggest activities near the current location.",
		"- Be enthusiastic and specific."
	);

	if (location?.destination) {
		lines.push(
			`CURRENT DESTINATION: ${location.destination.name} (Lat: ${location.destination.latitude}, Lng: ${location.destination.longitude})`
		);
	}

	return lines.join("\n");
}

const MAX_HISTORY = 8;

const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;

import { PlaceResult } from "./places";

export type ChatMsg = {
	role: "user" | "assistant";
	content: string;
	sender?: string;
	target?: string;
	places?: PlaceResult[];
};

export async function askElmoLLM(
	userPrompt: string,
	history: ChatMsg[],
	location?: LocationInfo,
	deviceRole?: string
): Promise<{
	reply: string;
	source: "groq" | "fallback";
	navigation?: {
		destinationName?: string;
		coordinates?: { latitude: number; longitude: number };
		searchQuery?: string;
		cancel?: boolean;
		startNavigation?: boolean;
		waypoints?: { name: string; coordinates?: [number, number] }[];
	};
}> {
	const trimmedHistory = history
		.filter(
			(m) =>
				(m.role === "user" || m.role === "assistant") &&
				m.content.trim().length > 0
		)
		.slice(-MAX_HISTORY);

	const systemPrompt = buildSystemPrompt(location, deviceRole);

	const messages: { role: "system" | "user" | "assistant"; content: string }[] =
		[
			{ role: "system", content: systemPrompt },
			...trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
			{ role: "user", content: userPrompt },
		];

	try {
		if (!GROQ_API_KEY) {
			throw new Error("Missing EXPO_PUBLIC_GROQ_API_KEY");
		}

		const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${GROQ_API_KEY}`,
			},
			body: JSON.stringify({
				model: "llama-3.3-70b-versatile",
				messages,
				temperature: 0.3,
				max_tokens: 256,
				response_format: { type: "json_object" },
			}),
		});

		if (!res.ok) {
			throw new Error(`Groq error: ${res.status}`);
		}

		const data = await res.json();
		const content = data.choices?.[0]?.message?.content?.trim();

		if (!content) {
			return { reply: getFallbackReply(userPrompt), source: "fallback" };
		}

		try {
			const parsed = JSON.parse(content);
			return {
				reply: parsed.reply || "I'm not sure what to say.",
				source: "groq",
				navigation: parsed.navigation,
			};
		} catch (e) {
			console.error("Failed to parse JSON response from LLM", e);
			// Fallback if JSON parsing fails but we have content (unlikely with json_object mode but possible)
			return { reply: content, source: "groq" };
		}
	} catch (err) {
		console.error("Groq error in Expo client:", err);
		return { reply: getFallbackReply(userPrompt), source: "fallback" };
	}
}

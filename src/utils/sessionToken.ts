const SESSION_TOKEN_LENGTH_BYTES = 32;

function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = "";

	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

export function createSessionToken(): string {
	const tokenBytes = crypto.getRandomValues(
		new Uint8Array(SESSION_TOKEN_LENGTH_BYTES)
	);

	return bytesToBase64Url(tokenBytes);
}

export async function hashSessionToken(
	sessionToken: string
): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(sessionToken)
	);

	return bytesToHex(new Uint8Array(digest));
}

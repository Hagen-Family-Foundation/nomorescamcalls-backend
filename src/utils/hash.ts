export async function hashPhoneNumber(phoneNumber: string): Promise<string> {
	const normalized = phoneNumber.trim();

	const encoded = new TextEncoder().encode(normalized);
	const digest = await crypto.subtle.digest("SHA-256", encoded);

	const bytes = Array.from(new Uint8Array(digest));

	return bytes
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

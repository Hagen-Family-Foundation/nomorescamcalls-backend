const PASSWORD_HASH_ALGORITHM = "PBKDF2";
const PASSWORD_HASH_DIGEST = "SHA-256";
const PASSWORD_HASH_ITERATIONS = 210_000;
const PASSWORD_HASH_LENGTH_BITS = 256;
const PASSWORD_SALT_LENGTH_BYTES = 16;

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";

	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary);
}

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(
		new Uint8Array(PASSWORD_SALT_LENGTH_BYTES)
	);

	const passwordKey = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password),
		PASSWORD_HASH_ALGORITHM,
		false,
		["deriveBits"]
	);

	const derivedBits = await crypto.subtle.deriveBits(
		{
			name: PASSWORD_HASH_ALGORITHM,
			hash: PASSWORD_HASH_DIGEST,
			salt,
			iterations: PASSWORD_HASH_ITERATIONS
		},
		passwordKey,
		PASSWORD_HASH_LENGTH_BITS
	);

	const passwordHash = new Uint8Array(derivedBits);

	return [
		"pbkdf2_sha256",
		PASSWORD_HASH_ITERATIONS,
		bytesToBase64(salt),
		bytesToBase64(passwordHash)
	].join("$");
}

const PASSWORD_HASH_ALGORITHM = "PBKDF2";
const PASSWORD_HASH_DIGEST = "SHA-256";
const PASSWORD_HASH_ITERATIONS = 100_000;
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

function base64ToBytes(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);

	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}

	return bytes;
}

function equalBytes(
	left: Uint8Array,
	right: Uint8Array
): boolean {
	if (left.length !== right.length) {
		return false;
	}

	let difference = 0;

	for (let index = 0; index < left.length; index += 1) {
		difference |= left[index] ^ right[index];
	}

	return difference === 0;
}

export async function verifyPassword(
	password: string,
	storedPasswordHash: string
): Promise<boolean> {
	const [
		format,
		iterationsValue,
		saltValue,
		expectedHashValue
	] = storedPasswordHash.split("$");

	if (
		format !== "pbkdf2_sha256"
		|| !iterationsValue
		|| !saltValue
		|| !expectedHashValue
	) {
		return false;
	}

	const iterations = Number(iterationsValue);

	if (!Number.isInteger(iterations) || iterations <= 0) {
		return false;
	}

	try {
		const salt = base64ToBytes(saltValue);
		const expectedHash = base64ToBytes(expectedHashValue);

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
				iterations
			},
			passwordKey,
			expectedHash.byteLength * 8
		);

		return equalBytes(
			new Uint8Array(derivedBits),
			expectedHash
		);
	} catch {
		return false;
	}
}

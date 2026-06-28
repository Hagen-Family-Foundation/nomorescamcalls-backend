import { addSipCredentialToInventory } from "./sipCredentialInventory";
import {
	verifyTelnyxSipUsername,
	normalizeTelnyxSipCredentialPayload
} from "./telnyxSipCredentialsClient";
import { getTelnyxJson, type TelnyxHttpClientConfig } from "./telnyxHttpClient";

export interface TelnyxSipCredentialSyncInput {
	telnyxConfig: TelnyxHttpClientConfig;
	connectionId?: string | null;
}

export interface TelnyxSipCredentialSyncResult {
	mode: "simulated" | "live" | "live_failed";
	source: "telnyx_credential_connections";
	importedCount: number;
	sipUsernames: string[];
	reason: string;
	status?: number;
}

export async function syncTelnyxSipCredentials(
	db: D1Database,
	input: TelnyxSipCredentialSyncInput
): Promise<TelnyxSipCredentialSyncResult> {
	if (!input.telnyxConfig.apiKey) {
		return {
			mode: "simulated",
			source: "telnyx_credential_connections",
			importedCount: 0,
			sipUsernames: [],
			reason: "Telnyx SIP credential sync is simulated until TELNYX_API_KEY is configured."
		};
	}

	const response = await getTelnyxJson(
		input.telnyxConfig,
		"/credential_connections"
	);

	const credentials = normalizeTelnyxSipCredentialPayload(response.body);

	const uniqueCredentials = [];
	const seenSipUsernames = new Set<string>();

	for (const credential of credentials) {
		const sipUsername = credential.sipUsername.trim();

		if (!sipUsername || seenSipUsernames.has(sipUsername)) {
			continue;
		}

		seenSipUsernames.add(sipUsername);
		uniqueCredentials.push({
			...credential,
			sipUsername
		});
	}

	if (!response.ok) {
		return {
			mode: "live_failed",
			source: "telnyx_credential_connections",
			importedCount: 0,
			sipUsernames: [],
			reason: "Telnyx credential connection API returned a non-success status.",
			status: response.status
		};
	}

	for (const credential of uniqueCredentials) {
		await addSipCredentialToInventory(
			db,
			{
				sipUsername: credential.sipUsername,
				provider: "telnyx",
				providerCredentialId: credential.id,
				connectionId: credential.connectionId ?? input.connectionId ?? null
			}
		);
	}

	return {
		mode: "live",
		source: "telnyx_credential_connections",
		importedCount: uniqueCredentials.length,
		sipUsernames: uniqueCredentials.map((credential) => credential.sipUsername),
		reason: "Telnyx SIP credentials were synced successfully.",
		status: response.status
	};
}

export { verifyTelnyxSipUsername };

export interface TelnyxSecurityResult {
	verified: boolean;
	enforced: boolean;
	reason: string;
}

export async function verifyTelnyxWebhook(
	request: Request,
	signingSecret?: string
): Promise<TelnyxSecurityResult> {
	if (!signingSecret) {
		return {
			verified: false,
			enforced: false,
			reason: "Telnyx webhook signature verification is not configured yet."
		};
	}

	const signature = request.headers.get("telnyx-signature-ed25519");
	const timestamp = request.headers.get("telnyx-timestamp");

	if (!signature || !timestamp) {
		return {
			verified: false,
			enforced: true,
			reason: "Missing Telnyx webhook signature headers."
		};
	}

	return {
		verified: false,
		enforced: true,
		reason: "Telnyx webhook signature headers are present, but cryptographic verification is not implemented yet."
	};
}

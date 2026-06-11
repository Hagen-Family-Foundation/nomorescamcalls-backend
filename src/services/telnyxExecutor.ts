import type { SimulatedTelnyxRequest } from "./telnyxRequests";

export interface TelnyxExecutionResult {
	mode: "disabled";
	executed: false;
	reason: string;
	request: SimulatedTelnyxRequest | null;
}

export async function executeTelnyxRequest(
	request: SimulatedTelnyxRequest | null
): Promise<TelnyxExecutionResult> {
	return {
		mode: "disabled",
		executed: false,
		reason: "Telnyx execution is intentionally disabled. No live API request was sent.",
		request
	};
}

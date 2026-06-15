import type { SimulatedTelnyxRequest } from "./telnyxRequests";
import type { TelnyxExecutionPolicy } from "./telnyxExecutionPolicy";

export interface TelnyxExecutionResult {
	mode: "disabled" | "live_not_implemented";
	executed: false;
	reason: string;
	request: SimulatedTelnyxRequest | null;
	policy: TelnyxExecutionPolicy;
}

export async function executeTelnyxRequest(
	request: SimulatedTelnyxRequest | null,
	policy: TelnyxExecutionPolicy
): Promise<TelnyxExecutionResult> {
	if (!policy.liveExecutionAllowed) {
		return {
			mode: "disabled",
			executed: false,
			reason: policy.reason,
			request,
			policy
		};
	}

	return {
		mode: "live_not_implemented",
		executed: false,
		reason: "Live Telnyx execution was requested, but the live API client is not implemented yet.",
		request,
		policy
	};
}

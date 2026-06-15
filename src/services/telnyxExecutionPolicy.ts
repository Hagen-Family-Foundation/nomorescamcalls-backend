export interface TelnyxExecutionPolicy {
	mode: "disabled" | "live";
	liveExecutionAllowed: boolean;
	reason: string;
}

export function getTelnyxExecutionPolicy(
	env: {
		TELNYX_LIVE_EXECUTION?: string;
	}
): TelnyxExecutionPolicy {
	if (env.TELNYX_LIVE_EXECUTION === "true") {
		return {
			mode: "live",
			liveExecutionAllowed: true,
			reason: "Live Telnyx execution was explicitly enabled by environment configuration."
		};
	}

	return {
		mode: "disabled",
		liveExecutionAllowed: false,
		reason: "Live Telnyx execution is disabled unless TELNYX_LIVE_EXECUTION is set to true."
	};
}

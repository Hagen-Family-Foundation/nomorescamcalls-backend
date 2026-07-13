import { describe, expect, it } from "vitest";
import {
	collectStage1Evidence
} from "../src/services/evidenceEngine";

describe("Evidence Engine Stage 1", () => {
	it("collects factual Telnyx call information", () => {
		const result = collectStage1Evidence({
			data: {
				payload: {
					from: "+18167186960",
					to: "+19139562493",
					caller_id_name: "+18167186960",
					direction: "incoming",
					calling_party_type: "pstn",
					from_sip_uri: "+18167186960@208.54.157.146",
					connection_id: "2974360803492235067",
					start_time: "2026-07-13T16:53:10.821478Z",
					custom_headers: [
						{
							name: "P-Early-Media",
							value: "supported"
						},
						{
							name: "P-Visited-Network-ID",
							value: "dnatf402.sip.t-mobile.com"
						}
					]
				}
			}
		});

		expect(result).toEqual({
			from: "+18167186960",
			to: "+19139562493",
			callerIdName: "+18167186960",
			direction: "incoming",
			callingPartyType: "pstn",
			fromSipUri: "+18167186960@208.54.157.146",
			connectionId: "2974360803492235067",
			startTime: "2026-07-13T16:53:10.821478Z",
			customHeaders: [
				{
					name: "P-Early-Media",
					value: "supported"
				},
				{
					name: "P-Visited-Network-ID",
					value: "dnatf402.sip.t-mobile.com"
				}
			]
		});
	});

	it("uses empty values when Telnyx fields are absent", () => {
		const result = collectStage1Evidence({});

		expect(result.from).toBe("");
		expect(result.to).toBe("");
		expect(result.callerIdName).toBeNull();
		expect(result.customHeaders).toEqual([]);
	});
});

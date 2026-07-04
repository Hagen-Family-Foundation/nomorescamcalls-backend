import { describe, expect, it } from "vitest";
import { investigateIdentity } from "../src/services/identityInvestigation";

describe("Identity investigation", () => {
	it("does not investigate identity without a transcript", () => {
		const result = investigateIdentity({
			transcript: null
		});

		expect(result.status).toBe("not_available");
		expect(result.claimedName).toBeNull();
		expect(result.claimedOrganization).toBeNull();
		expect(result.callPurpose).toBeNull();
		expect(result.evidenceFindings).toEqual([]);
		expect(result.remainingUncertainty).toBe(1);
		expect(result.reason).toBe("identity_investigation_requires_transcript");
	});

	it("records that transcript evidence is available", () => {
		const result = investigateIdentity({
			transcript: "My name is John and I am calling about your account."
		});

		expect(result.status).toBe("completed");
		expect(result.evidenceFindings).toEqual([
			{
				type: "identity_transcript_available",
				description:
					"Caller provided spoken material that can be reviewed for identity evidence.",
				direction: "neutral",
				confidence: 1
			}
		]);
		expect(result.remainingUncertainty).toBe(0.8);
		expect(result.reason).toBe("identity_investigation_placeholder_completed");
	});
});

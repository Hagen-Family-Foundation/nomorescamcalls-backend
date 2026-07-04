import { describe, expect, it } from "vitest";
import { investigateOrganization } from "../src/services/organizationInvestigation";

describe("Organization investigation", () => {
	it("does not investigate organization without a transcript", () => {
		const result = investigateOrganization({
			transcript: null
		});

		expect(result.status).toBe("not_available");
		expect(result.claimedOrganization).toBeNull();
		expect(result.organizationVerified).toBe(false);
		expect(result.evidenceFindings).toEqual([]);
		expect(result.remainingUncertainty).toBe(1);
		expect(result.reason).toBe("organization_investigation_requires_transcript");
	});

	it("records that organization transcript evidence is available", () => {
		const result = investigateOrganization({
			transcript: "This is John calling from ABC Services."
		});

		expect(result.status).toBe("completed");
		expect(result.evidenceFindings).toEqual([
			{
				type: "organization_transcript_available",
				description:
					"Caller provided spoken material that can be reviewed for organization evidence.",
				direction: "neutral",
				confidence: 1
			}
		]);
		expect(result.remainingUncertainty).toBe(0.8);
		expect(result.reason).toBe("organization_investigation_placeholder_completed");
	});
});

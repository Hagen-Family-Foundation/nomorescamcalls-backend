import { describe, expect, it } from "vitest";

import { recordEvidence } from "../src/services/evidenceEngine/evidence";
import type { CallEvidence } from "../src/services/evidenceEngine/call";

function call(): CallEvidence {
        return {
                standing: 100,
                deductions: [],
                ipqsRequested: false,
                ipqsCompleted: false,
                released: false,
                observing: false
        };
}

describe("Evidence Engine evidence", () => {
        it("records evidence and keeps a passing call released", () => {
                const result = recordEvidence(call(), {
                        reason: "minor concern",
                        points: 5
                });

                expect(result.call.standing).toBe(95);
                expect(result.call.deductions).toHaveLength(1);
                expect(result.action).toBe("release");
        });

        it("records evidence that requires IPQS", () => {
                const result = recordEvidence(call(), {
                        reason: "borderline evidence",
                        points: 20
                });

                expect(result.call.standing).toBe(80);
                expect(result.action).toBe("ipqs");
        });

        it("records evidence that moves the call into observation", () => {
                const result = recordEvidence(call(), {
                        reason: "high risk evidence",
                        points: 30
                });

                expect(result.call.standing).toBe(70);
                expect(result.action).toBe("observe");
        });
});

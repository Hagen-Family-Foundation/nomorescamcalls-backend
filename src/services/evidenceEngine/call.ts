export interface CallEvidence {
	standing: number;

	deductions: {
		reason: string;
		points: number;
	}[];

	ipqsRequested: boolean;
	ipqsCompleted: boolean;

	released: boolean;
	observing: boolean;
}

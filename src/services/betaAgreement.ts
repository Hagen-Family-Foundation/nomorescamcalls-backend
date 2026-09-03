export interface BetaAgreementSection {
	id: string;
	heading: string;
	body: readonly string[];
}

export interface BetaAgreementRecord {
	version: string;
	title: string;
	effectiveAt: string;
	preamble: readonly string[];
	sections: readonly BetaAgreementSection[];
	acceptanceHeading: string;
	acceptance: readonly string[];
}

export interface BetaAgreementAcceptanceResult {
	agreement: BetaAgreementRecord;
	acceptedAt: string;
}

interface BetaAgreementAcceptanceRow {
	accepted_at: string;
}

/** The sole active beta-agreement authority. */
export const CURRENT_BETA_AGREEMENT = {
	version: "v1",
	title: "NoMoreScamCalls Beta Participation Agreement",
	effectiveAt: "2026-07-19T00:00:00Z",
	preamble: [
		"Welcome to the NoMoreScamCalls Beta Program.",
		"Thank you for volunteering to help us evaluate and improve NoMoreScamCalls before its public release. Your participation helps us identify issues, improve reliability, and build a better service for future customers.",
		"By selecting “I Agree”, you acknowledge that you have read, understood, and agree to the following terms."
	],
	sections: [
		{
			id: "purpose",
			heading: "1. Purpose of the Beta Program",
			body: ["The NoMoreScamCalls Beta Program is intended to evaluate and improve the service under real-world conditions before its public release. The software, systems, and supporting services are actively being developed and refined."]
		},
		{
			id: "beta-service",
			heading: "2. Beta Service",
			body: [
				"You understand and acknowledge that this is a beta service. Because the service is still under development:",
				"• Features may be added, modified, or removed without prior notice.",
				"• Service behavior may change as improvements are introduced.",
				"• Temporary interruptions or unexpected behavior may occur.",
				"• The service may not perform as expected in every situation."
			]
		},
		{
			id: "call-handling",
			heading: "3. Call Handling",
			body: [
				"NoMoreScamCalls is designed to screen incoming telephone calls before they are delivered. During the beta program, you understand and accept that:",
				"• Calls may occasionally be delayed.",
				"• Calls may occasionally be interrupted.",
				"• Calls may occasionally fail to connect.",
				"• Legitimate calls may occasionally be delayed or not delivered.",
				"• Unwanted or scam calls may occasionally reach you.",
				"• Call routing or screening behavior may change as improvements are tested.",
				"Participation in this beta program means you accept these risks as part of testing an unfinished product."
			]
		},
		{
			id: "release-of-responsibility",
			heading: "4. Release of Responsibility",
			body: [
				"To the maximum extent permitted by applicable law, you agree that NoMoreScamCalls, its owners, developers, employees, contractors, and affiliates shall not be liable for losses, inconvenience, missed calls, delayed calls, interrupted calls, altered call handling, temporary service outages, or other issues arising from your voluntary participation in this beta program.",
				"Nothing in this agreement limits any rights that cannot legally be waived under applicable law."
			]
		},
		{
			id: "privacy",
			heading: "5. Privacy",
			body: [
				"Operational information generated through your participation may be collected to improve the service. Examples include:",
				"• Call processing information",
				"• System performance information",
				"• Error reports",
				"• Diagnostic information",
				"• Feedback submitted through the beta portal",
				"Your information will be handled in accordance with the NoMoreScamCalls Privacy Policy."
			]
		},
		{
			id: "responsible-participation",
			heading: "6. Responsible Participation",
			body: [
				"As a beta participant, you agree to:",
				"• Use the service responsibly.",
				"• Provide honest feedback.",
				"• Report problems accurately when possible.",
				"• Avoid attempting to bypass, interfere with, or compromise the security or operation of the service.",
				"• Respect the integrity of the beta program."
			]
		},
		{
			id: "confidential-information",
			heading: "7. Confidential Information",
			body: [
				"You understand that portions of the beta program may not yet be publicly available. You agree not to intentionally disclose non-public information such as:",
				"• Administrative interfaces",
				"• Internal security procedures",
				"• Invitation codes intended for limited distribution",
				"• Unreleased product functionality",
				"• Internal technical documentation",
				"This does not prevent you from honestly discussing your personal experience using the service unless a separate confidentiality agreement specifically states otherwise."
			]
		},
		{
			id: "no-compensation",
			heading: "8. No Compensation",
			body: [
				"Participation in the NoMoreScamCalls Beta Program is entirely voluntary. You understand and agree that:",
				"• You will not receive financial compensation.",
				"• You will not receive prizes or rewards.",
				"• There is no promise of future payment.",
				"• There is no “pot of gold at the end of the rainbow.”",
				"Your participation is appreciated, but it does not create any financial obligation on the part of NoMoreScamCalls."
			]
		},
		{
			id: "no-ownership",
			heading: "9. No Ownership or Investment Rights",
			body: [
				"Participation in the beta program does not grant you:",
				"• Ownership of NoMoreScamCalls",
				"• Equity",
				"• Stock",
				"• Partnership status",
				"• Membership interest",
				"• Revenue sharing",
				"• Investment rights",
				"• Intellectual property rights",
				"• Any ownership percentage in the company or its products",
				"Your participation does not create any ownership or financial interest in the future public service."
			]
		},
		{
			id: "ending-participation",
			heading: "10. Ending Participation",
			body: [
				"You may discontinue your participation in the beta program at any time.",
				"NoMoreScamCalls may suspend or terminate your participation at any time if necessary to protect the beta program, its participants, or the integrity of the service."
			]
		},
		{
			id: "changes",
			heading: "11. Changes to This Agreement",
			body: ["As the beta program evolves, this agreement may be updated. If material changes are made, participants may be asked to review and accept the updated version before continuing to use the beta portal."]
		},
		{
			id: "contact",
			heading: "12. Contact",
			body: ["Questions regarding the beta program may be directed to support@nomorescamcalls.com."]
		}
	],
	acceptanceHeading: "Acceptance",
	acceptance: [
		"By selecting “I Agree”, you acknowledge that:",
		"• You have read and understood this Beta Participation Agreement.",
		"• You voluntarily choose to participate in the NoMoreScamCalls Beta Program.",
		"• You accept the risks associated with using beta software.",
		"• You agree to the terms described above.",
		"Your acceptance, the agreement version, your participant identifier, and the date and time of acceptance will be recorded as part of your beta participation record."
	]
} as const satisfies BetaAgreementRecord;

export function getCurrentBetaAgreement(): BetaAgreementRecord {
	return CURRENT_BETA_AGREEMENT;
}

export async function hasAcceptedCurrentBetaAgreement(
	db: D1Database,
	userId: number
): Promise<boolean> {
	const row = await db
		.prepare(`
			SELECT id
			FROM beta_agreement_acceptances
			WHERE user_id = ?
				AND agreement_version = ?
			LIMIT 1
		`)
		.bind(userId, CURRENT_BETA_AGREEMENT.version)
		.first<{ id: number }>();

	return row !== null;
}

export async function acceptCurrentBetaAgreement(
	db: D1Database,
	userId: number
): Promise<BetaAgreementAcceptanceResult> {
	const acceptedAt = new Date().toISOString();

	await db
		.prepare(`
			INSERT OR IGNORE INTO beta_agreement_acceptances (
				user_id,
				agreement_version,
				accepted_at
			)
			VALUES (?, ?, ?)
		`)
		.bind(userId, CURRENT_BETA_AGREEMENT.version, acceptedAt)
		.run();

	const acceptance = await db
		.prepare(`
			SELECT accepted_at
			FROM beta_agreement_acceptances
			WHERE user_id = ?
				AND agreement_version = ?
			LIMIT 1
		`)
		.bind(userId, CURRENT_BETA_AGREEMENT.version)
		.first<BetaAgreementAcceptanceRow>();

	if (!acceptance) {
		throw new Error("Failed to record beta agreement acceptance");
	}

	return {
		agreement: CURRENT_BETA_AGREEMENT,
		acceptedAt: acceptance.accepted_at
	};
}

import type { UserRecord } from "./users";

export type CustomerCommunicationChannel = "sms" | "email";
export type CustomerCommunicationPurpose =
	| "beta_invitation"
	| "onboarding_credential"
	| "forwarding_instructions";
export type CustomerCommunicationStatus =
	| "provider_unavailable"
	| "pending"
	| "sent"
	| "failed";

export interface CustomerCommunicationMessage {
	channel: CustomerCommunicationChannel;
	destination: string;
	subject: string | null;
	body: string;
}

export interface CustomerCommunicationProvider {
	name: string;
	send(message: CustomerCommunicationMessage): Promise<{
		providerMessageId?: string | null;
	}>;
}

export interface CustomerCommunicationRecord
	extends CustomerCommunicationMessage {
	id: number;
	invitationId: number | null;
	userId: number | null;
	protectedLineId: number | null;
	purpose: CustomerCommunicationPurpose;
	status: CustomerCommunicationStatus;
	provider: string | null;
	providerMessageId: string | null;
	failureReason: string | null;
	attemptedAt: string | null;
	sentAt: string | null;
	createdAt: string;
}

interface CustomerCommunicationRow {
	id: number;
	invitation_id: number | null;
	user_id: number | null;
	protected_line_id: number | null;
	purpose: CustomerCommunicationPurpose;
	channel: CustomerCommunicationChannel;
	destination: string;
	subject: string | null;
	message_body: string;
	status: CustomerCommunicationStatus;
	provider: string | null;
	provider_message_id: string | null;
	failure_reason: string | null;
	attempted_at: string | null;
	sent_at: string | null;
	created_at: string;
}

function mapCommunicationRow(
	row: CustomerCommunicationRow
): CustomerCommunicationRecord {
	return {
		id: row.id,
		invitationId: row.invitation_id,
		userId: row.user_id,
		protectedLineId: row.protected_line_id,
		purpose: row.purpose,
		channel: row.channel,
		destination: row.destination,
		subject: row.subject,
		body: row.message_body,
		status: row.status,
		provider: row.provider,
		providerMessageId: row.provider_message_id,
		failureReason: row.failure_reason,
		attemptedAt: row.attempted_at,
		sentAt: row.sent_at,
		createdAt: row.created_at
	};
}

const COMMUNICATION_COLUMNS = `
	id,
	invitation_id,
	user_id,
	protected_line_id,
	purpose,
	channel,
	destination,
	subject,
	message_body,
	status,
	provider,
	provider_message_id,
	failure_reason,
	attempted_at,
	sent_at,
	created_at
`;

export function selectAccountCommunicationDestination(
	account: UserRecord
): {
	channel: CustomerCommunicationChannel;
	destination: string;
} {
	if (account.smsCapable && account.smsContactNumber?.trim()) {
		return {
			channel: "sms",
			destination: account.smsContactNumber.trim()
		};
	}

	if (account.email?.trim()) {
		return {
			channel: "email",
			destination: account.email.trim().toLowerCase()
		};
	}

	throw new Error("No approved customer communication destination is available");
}

export async function findLatestCustomerCommunication(
	db: D1Database,
	input: {
		invitationId?: number;
		protectedLineId?: number;
		purpose: CustomerCommunicationPurpose;
	}
): Promise<CustomerCommunicationRecord | null> {
	const targetColumn = input.invitationId
		? "invitation_id"
		: "protected_line_id";
	const targetId = input.invitationId ?? input.protectedLineId;

	if (!targetId) {
		return null;
	}

	const row = await db
		.prepare(`
			SELECT ${COMMUNICATION_COLUMNS}
			FROM customer_communication_deliveries
			WHERE ${targetColumn} = ?
				AND purpose = ?
			ORDER BY id DESC
			LIMIT 1
		`)
		.bind(targetId, input.purpose)
		.first<CustomerCommunicationRow>();

	return row ? mapCommunicationRow(row) : null;
}

export async function deliverCustomerCommunication(
	db: D1Database,
	input: {
		invitationId?: number;
		userId?: number;
		protectedLineId?: number;
		purpose: CustomerCommunicationPurpose;
		message: CustomerCommunicationMessage;
	},
	provider?: CustomerCommunicationProvider
): Promise<CustomerCommunicationRecord> {
	const now = new Date().toISOString();
	const status: CustomerCommunicationStatus = provider
		? "pending"
		: "provider_unavailable";
	const failureReason = provider
		? null
		: "No approved outbound SMS/email provider is configured.";
	const inserted = await db
		.prepare(`
			INSERT INTO customer_communication_deliveries (
				invitation_id,
				user_id,
				protected_line_id,
				purpose,
				channel,
				destination,
				subject,
				message_body,
				status,
				provider,
				failure_reason,
				attempted_at,
				created_at,
				updated_at
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`)
		.bind(
			input.invitationId ?? null,
			input.userId ?? null,
			input.protectedLineId ?? null,
			input.purpose,
			input.message.channel,
			input.message.destination,
			input.message.subject,
			input.message.body,
			status,
			provider?.name ?? null,
			failureReason,
			provider ? now : null,
			now,
			now
		)
		.run();
	const deliveryId = Number(inserted.meta.last_row_id);

	if (provider) {
		try {
			const result = await provider.send(input.message);
			await db
				.prepare(`
					UPDATE customer_communication_deliveries
					SET status = 'sent',
						provider_message_id = ?,
						sent_at = ?,
						updated_at = ?
					WHERE id = ?
				`)
				.bind(result.providerMessageId ?? null, now, now, deliveryId)
				.run();
		} catch (error) {
			await db
				.prepare(`
					UPDATE customer_communication_deliveries
					SET status = 'failed',
						failure_reason = ?,
						updated_at = ?
					WHERE id = ?
				`)
				.bind(
					error instanceof Error ? error.message : "Communication delivery failed",
					now,
					deliveryId
				)
				.run();
		}
	}

	const row = await db
		.prepare(`
			SELECT ${COMMUNICATION_COLUMNS}
			FROM customer_communication_deliveries
			WHERE id = ?
		`)
		.bind(deliveryId)
		.first<CustomerCommunicationRow>();

	if (!row) {
		throw new Error("Failed to preserve customer communication delivery state");
	}

	return mapCommunicationRow(row);
}

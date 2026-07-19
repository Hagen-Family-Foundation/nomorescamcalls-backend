import type {
	Block3EvidenceBox
} from "./block3";

export type Block4CallRoutingAction =
	| "connect_subscriber"
	| "observe_unavailable_disconnect";

export interface Block4CallRouter {
	connectSubscriber(
		evidenceBox: Block3EvidenceBox
	): Promise<void>;

	observeUntilUnavailableAndDisconnect(
		evidenceBox: Block3EvidenceBox
	): Promise<void>;

	playSystemErrorAndDisconnect(): Promise<void>;
}

export interface Block4EvidenceLibrary {
	routeEvidenceBox(
		evidenceBox: Block3EvidenceBox
	): Promise<void>;
}

export interface Block4Input {
	block3EvidenceBox: Block3EvidenceBox;
	callRouter: Block4CallRouter;
	evidenceLibrary: Block4EvidenceLibrary;
	now?: () => string;
}

export interface Block4RoutingRecord {
	finalStanding: number;
	callRoutingAction: Block4CallRoutingAction;
	routingTimestamp: string;
	callRoutingCompleted: boolean;
	evidenceBoxRoutingCompleted: boolean;
	systemErrorHandled: boolean;
	callRoutingError: string | null;
	evidenceBoxRoutingError: string | null;
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

function determineCallRoutingAction(
	finalStanding: number
): Block4CallRoutingAction {
	if (finalStanding >= 76) {
		return "connect_subscriber";
	}

	return "observe_unavailable_disconnect";
}

export async function completeBlock4(
	input: Block4Input
): Promise<Block4RoutingRecord> {
	const finalStanding =
		input.block3EvidenceBox.finalStanding;

	const callRoutingAction =
		determineCallRoutingAction(finalStanding);

	let callRoutingCompleted = false;
	let evidenceBoxRoutingCompleted = false;
	let systemErrorHandled = false;
	let callRoutingError: string | null = null;
	let evidenceBoxRoutingError: string | null = null;

	try {
		if (
			callRoutingAction ===
			"connect_subscriber"
		) {
			await input.callRouter.connectSubscriber(
				input.block3EvidenceBox
			);
		} else {
			await input.callRouter
				.observeUntilUnavailableAndDisconnect(
					input.block3EvidenceBox
				);
		}

		callRoutingCompleted = true;
	} catch (error) {
		callRoutingError = errorMessage(error);

		try {
			await input.callRouter
				.playSystemErrorAndDisconnect();

			systemErrorHandled = true;
		} catch {
			systemErrorHandled = false;
		}
	}

	try {
		await input.evidenceLibrary.routeEvidenceBox(
			input.block3EvidenceBox
		);

		evidenceBoxRoutingCompleted = true;
	} catch (error) {
		evidenceBoxRoutingError =
			errorMessage(error);
	}

	return {
		finalStanding,
		callRoutingAction,
		routingTimestamp:
			input.now?.() ??
			new Date().toISOString(),
		callRoutingCompleted,
		evidenceBoxRoutingCompleted,
		systemErrorHandled,
		callRoutingError,
		evidenceBoxRoutingError
	};
}

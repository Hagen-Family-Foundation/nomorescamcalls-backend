import type {
	TelnyxCallEvent
} from "./telnyxEvents";
import type {
	Block2EvidenceBox
} from "./evidenceEngine/block2";
import type {
	EvidenceLibraryCallInformation,
	EvidenceLibrarySubscriber
} from "./evidenceLibrary";
import type {
	ApprovedCallDestination
} from "./routing";

export interface Block3LiveSessionNamespace {
	getByName(name: string): {
		fetch(request: Request): Promise<Response>;
	};
}

export function getBlock3LiveSession(
	namespace: Block3LiveSessionNamespace,
	callSessionId: string
): { fetch(request: Request): Promise<Response> } {
	return namespace.getByName(callSessionId);
}

async function postToSession(
	namespace: Block3LiveSessionNamespace,
	event: TelnyxCallEvent,
	path: string,
	body: Record<string, unknown> = {}
): Promise<unknown> {
	const stub = getBlock3LiveSession(
		namespace,
		event.callSessionId
	);
	const response = await stub.fetch(
		new Request(`https://block3.internal${path}`, {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				callSessionId: event.callSessionId,
				callControlId: event.callControlId,
				...body
			})
		})
	);
	const result = await response.json();

	if (!response.ok) {
		throw new Error(
			`Block 3 live session rejected the event: ${JSON.stringify(result)}`
		);
	}

	return result;
}

export async function initializeBlock3LiveSession(
	namespace: Block3LiveSessionNamespace,
	event: TelnyxCallEvent,
	context: {
		block2EvidenceBox: Block2EvidenceBox;
		callInformation: EvidenceLibraryCallInformation;
		subscriber: EvidenceLibrarySubscriber;
		approvedDestination: ApprovedCallDestination;
	}
): Promise<unknown> {
	return postToSession(
		namespace,
		event,
		"/initialize",
		context
	);
}

export async function openBlock3ResponseWindow(
	namespace: Block3LiveSessionNamespace,
	event: TelnyxCallEvent
): Promise<unknown> {
	return postToSession(
		namespace,
		event,
		"/prompt-started"
	);
}

export async function completeBlock3UnavailablePlayback(
	namespace: Block3LiveSessionNamespace,
	event: TelnyxCallEvent
): Promise<unknown> {
	return postToSession(
		namespace,
		event,
		"/unavailable-speak-ended",
		{
			clientState: event.clientState
		}
	);
}

export async function deliverBlock3Transcription(
	namespace: Block3LiveSessionNamespace,
	event: TelnyxCallEvent
): Promise<unknown> {
	return postToSession(
		namespace,
		event,
		"/transcription",
		{
			transcript:
				event.transcription?.transcript ?? "",
			isFinal:
				event.transcription?.isFinal ?? false
		}
	);
}

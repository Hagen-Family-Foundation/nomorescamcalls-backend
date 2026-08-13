import type {
	Block3CallController
} from "./evidenceEngine/block3";
import type {
	ApprovedCallDestination
} from "./routing";
import type {
	TelnyxPlannedCommand
} from "./telnyxCommands";
import {
	buildTelnyxRequest
} from "./telnyxRequests";
import {
	executeTelnyxRequest
} from "./telnyxExecutor";
import type {
	TelnyxApiConfig,
	TelnyxExecutionResult
} from "./telnyxExecutor";
import type {
	TelnyxExecutionPolicy
} from "./telnyxExecutionPolicy";

const UNAVAILABLE_MESSAGE =
	"We're sorry, but the party you are trying to reach is unavailable at this time. Please try your call again later. Goodbye.";

const TECHNICAL_DIFFICULTIES_MESSAGE =
	"We are sorry, but we are having technical difficulties at this time and cannot complete your call. Please try your call again later. Goodbye.";

export interface TelnyxBlock3CallControllerInput {
	callControlId: string;
	callSessionId: string;
	approvedDestination:
		ApprovedCallDestination;
	executionPolicy:
		TelnyxExecutionPolicy;
	telnyxApiConfig?: TelnyxApiConfig;
	execute?: typeof executeTelnyxRequest;
}

function command(
	input: TelnyxBlock3CallControllerInput,
	type: TelnyxPlannedCommand["command"],
	reason: string
): TelnyxPlannedCommand {
	return {
		mode: "simulated",
		command: type,
		callControlId:
			input.callControlId,
		callSessionId:
			input.callSessionId,
		reason,
		safetyNote:
			"Execution is controlled by the approved Telnyx live-execution policy."
	};
}

function requireSuccessfulExecution(
	result: TelnyxExecutionResult,
	action: string
): void {
	if (
		result.mode !== "live"
		|| result.executed !== true
	) {
		throw new Error(
			`${action} failed: ${result.reason}`
		);
	}
}

export function createTelnyxBlock3CallController(
	input: TelnyxBlock3CallControllerInput
): Block3CallController {
	const execute =
		input.execute ??
		executeTelnyxRequest;

	const run = async (
		plannedCommand:
			TelnyxPlannedCommand,
		speech:
			{
				prompt: string;
				timeoutSeconds: number;
			} | null = null
	): Promise<void> => {
		const request =
			buildTelnyxRequest(
				plannedCommand,
				speech,
				input.approvedDestination
			);

		const result =
			await execute(
				request,
				input.executionPolicy,
				input.telnyxApiConfig ?? {}
			);

		requireSuccessfulExecution(
			result,
			plannedCommand.command
		);
	};

	return {
		async startRecording():
			Promise<void> {
			await run(
				command(
					input,
					"record_start",
					"Block 3 begins recording."
				)
			);
		},

		async connectSubscriber():
			Promise<void> {
			await run(
				command(
					input,
					"transfer",
					"Block 3 connects the qualifying call to the subscriber."
				)
			);
		},

		async playUnavailableAndDisconnect():
			Promise<void> {
			await run(
				command(
					input,
					"speak",
					"Block 3 plays the unavailable message."
				),
				{
					prompt:
						UNAVAILABLE_MESSAGE,
					timeoutSeconds: 10
				}
			);

			await run(
				command(
					input,
					"hangup",
					"Block 3 disconnects the diverted call."
				)
			);
		},

		async playTechnicalDifficultiesAndDisconnect():
			Promise<void> {
			await run(
				command(
					input,
					"speak",
					"Block 3 reports an operational failure."
				),
				{
					prompt:
						TECHNICAL_DIFFICULTIES_MESSAGE,
					timeoutSeconds: 10
				}
			);

			await run(
				command(
					input,
					"hangup",
					"Block 3 disconnects after an operational failure."
				)
			);
		},

		async stopRecording():
			Promise<void> {
			await run(
				command(
					input,
					"record_stop",
					"Block 3 ends recording."
				)
			);
		}
	};
}

import {
	describe,
	expect,
	it,
	vi
} from "vitest";
import {
	createTelnyxBlock3CallController
} from "../src/services/telnyxBlock3CallController";
import type {
	TelnyxExecutionResult
} from "../src/services/telnyxExecutor";

function liveResult(
	request: any,
	policy: any
): TelnyxExecutionResult {
	return {
		mode: "live",
		executed: true,
		reason:
			"Telnyx API request was sent successfully.",
		request,
		policy,
		status: 200,
		responseBody: {}
	};
}

describe(
	"Telnyx Block 3 Call Controller",
	() => {
		it(
			"executes recording, transfer, unavailable-message, hangup, and recording-stop actions",
			async () => {
				const execute =
					vi.fn(
						async (
							request,
							policy
						) =>
							liveResult(
								request,
								policy
							)
					);

				const controller =
					createTelnyxBlock3CallController({
						callControlId:
							"controller-call-control",
						callSessionId:
							"controller-call-session",
						approvedDestination: {
							destination:
								"test_user_controller",
							screeningNumber:
								"+18005550100",
							sipUsername:
								"test_user_controller",
							reason:
								"Test subscriber destination."
						},
						executionPolicy: {
							mode: "live",
							liveExecutionAllowed:
								true,
							reason:
								"Test live execution."
						},
						telnyxApiConfig: {
							apiKey:
								"test-key"
						},
						execute
					});

				await controller
					.startRecording();

				await controller
					.connectSubscriber();

				await controller
					.playUnavailableAndDisconnect();

				await controller
					.stopRecording();

				expect(
					execute
				).toHaveBeenCalledTimes(5);

				const endpoints =
					execute.mock.calls.map(
						(call) =>
							call[0]?.endpoint
					);

				expect(endpoints).toEqual([
					"/calls/controller-call-control/actions/record_start",
					"/calls/controller-call-control/actions/transfer",
					"/calls/controller-call-control/actions/speak",
					"/calls/controller-call-control/actions/hangup",
					"/calls/controller-call-control/actions/record_stop"
				]);

				const unavailableRequest =
					execute.mock.calls[2][0];

				expect(
					unavailableRequest?.body
				).toEqual({
					payload:
						"We're sorry, but the party you are trying to reach is unavailable at this time. Please try your call again later. Goodbye.",
					language: "en-US",
					voice: "female"
				});
			}
		);

		it(
			"fails Block 3 call control when Telnyx execution fails",
			async () => {
				const execute =
					vi.fn(
						async (
							request,
							policy
						): Promise<TelnyxExecutionResult> => ({
							mode:
								"live_failed",
							executed: true,
							reason:
								"Telnyx rejected the request.",
							request,
							policy,
							status: 422
						})
					);

				const controller =
					createTelnyxBlock3CallController({
						callControlId:
							"controller-failure-control",
						callSessionId:
							"controller-failure-session",
						approvedDestination: {
							destination:
								"test_user_failure",
							screeningNumber:
								"+18005550101",
							sipUsername:
								"test_user_failure",
							reason:
								"Test subscriber destination."
						},
						executionPolicy: {
							mode: "live",
							liveExecutionAllowed:
								true,
							reason:
								"Test live execution."
						},
						execute
					});

				await expect(
					controller.startRecording()
				).rejects.toThrow(
					"record_start failed: Telnyx rejected the request."
				);
			}
		);
	}
);

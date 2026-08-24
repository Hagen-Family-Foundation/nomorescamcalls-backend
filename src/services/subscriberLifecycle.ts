import {
	refreshSubscriberOnboardingStatus,
	type SubscriberOnboardingStatus
} from "./subscriberOnboarding";
import {
	provisionSubscriber,
	type ProvisionSubscriberResult
} from "./provisioning";

export interface AdvanceSubscriberLifecycleResult {
	onboarding: SubscriberOnboardingStatus;
	provisioning: ProvisionSubscriberResult | null;
}

export async function advanceSubscriberLifecycle(
	db: D1Database,
	userId: number
): Promise<AdvanceSubscriberLifecycleResult> {
	const onboarding =
		await refreshSubscriberOnboardingStatus(db, userId);

	if (!onboarding.complete) {
		return {
			onboarding,
			provisioning: null
		};
	}

	return {
		onboarding,
		provisioning: await provisionSubscriber(db, userId)
	};
}

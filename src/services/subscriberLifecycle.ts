import {
	refreshSubscriberOnboardingStatus,
	type SubscriberOnboardingStatus
} from "./subscriberOnboarding";

export interface AdvanceSubscriberLifecycleResult {
	onboarding: SubscriberOnboardingStatus;
	provisioning: null;
}

export async function advanceSubscriberLifecycle(
	db: D1Database,
	userId: number
): Promise<AdvanceSubscriberLifecycleResult> {
	const onboarding =
		await refreshSubscriberOnboardingStatus(db, userId);

	return {
		onboarding,
		provisioning: null
	};
}

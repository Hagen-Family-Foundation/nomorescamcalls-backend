# Beta Portal Requirements

## Purpose

The beta portal provides controlled access to the NoMoreScamCalls beta program.

It must allow invited beta participants to create an account, provide required information, accept the beta agreement, complete service setup, and view basic call activity.

It must also provide an administrative dashboard for monitoring every beta account and the overall performance of the service.

---

## Beta Access

Each beta participant must receive a unique beta access code from NoMoreScamCalls.

The portal must:

* Require a valid beta access code before account creation.
* Prevent the same beta access code from being reused.
* Associate the beta access code with the created account.
* Allow the beta participant to create login credentials.
* Allow the beta participant to log in and return to the portal.
* Allow an administrator to activate, suspend, or close the beta account.

---

## Beta Participant Information

The portal must collect:

* First name.
* Last name.
* Email address.
* Telephone number being protected.
* Mobile carrier.
* Preferred contact method.
* Beta access code.
* Date the account was created.
* Account status.

The portal must allow the administrator to review and update this information.

---

## Beta Agreement

The beta participant must accept the beta agreement before the account can be activated.

The portal must record:

* Agreement version.
* Date and time accepted.
* Name of the participant.
* Beta account associated with the acceptance.

The agreement will describe:

* The purpose of the beta program.
* The current nature of the product.
* Basic product-performance expectations.
* Possible interruptions or changes during beta testing.
* Communication expectations.
* Participant conduct.
* Privacy and data handling.
* The participant’s ability to leave the beta.
* NoMoreScamCalls’ ability to end beta participation.

---

## Service Setup

The beta account must support the following setup information:

* Protected telephone number.
* Assigned NoMoreScamCalls screening number.
* Subscriber call-delivery destination.
* Carrier.
* Call-forwarding setup status.
* Test-call status.
* Service activation status.
* Date service was activated.

Setup statuses should include:

* Invitation Sent.
* Account Created.
* Agreement Accepted.
* Setup Incomplete.
* Forwarding Ready.
* Test Call Pending.
* Active.
* Suspended.
* Closed.

---

## Beta Participant Dashboard

The participant dashboard must display:

* Service status.
* Protected telephone number.
* Assigned screening number.
* Total calls handled.
* Successful calls.
* Diverted calls.
* Date and time of the most recent call.
* A way to contact NoMoreScamCalls regarding product behavior or performance.

The beta dashboard does not require finished graphics, videos, savings estimates, blog features, or polished subscriber materials.

---

## Administrator Dashboard

The administrator dashboard must provide a system-wide view of all beta accounts.

It must display:

* Total beta accounts.
* Active accounts.
* Accounts still in setup.
* Suspended accounts.
* Total calls handled.
* Total successful calls.
* Total diverted calls.
* Calls handled today.
* Recent system activity.

For each beta account, it must display:

* Participant name.
* Email address.
* Protected telephone number.
* Assigned screening number.
* Carrier.
* Beta access code.
* Account status.
* Setup status.
* Activation date.
* Last call date and time.
* Total calls.
* Successful calls.
* Diverted calls.

The administrator must be able to open an individual account and review its activity.

---

## Individual Account Activity

Each beta account must provide an activity view containing:

* Call identifier.
* Call date and time.
* Successful or diverted status.
* Final standing.
* Current processing status.
* Operational error status, when applicable.

The administrator dashboard must use system records as the primary source of product-performance information.

Beta participant emails and feedback supplement the system records but do not replace them.

---

## Beta Communication

The portal must provide a clear method for participants to report:

* Calls that should have connected but did not.
* Calls that connected but should not have.
* Setup problems.
* Delivery problems.
* Unexpected product behavior.
* General observations.

Each report should include:

* Participant account.
* Date and time submitted.
* Related call date or call identifier, when known.
* Participant comments.
* Administrative follow-up status.

---

## Backend Readiness

Emergent must structure the portal so that its temporary template data can be replaced with live NoMoreScamCalls backend data.

The portal must be ready to connect to backend functions for:

* Beta code validation.
* Account creation.
* Login and authentication.
* Agreement acceptance.
* Subscriber provisioning.
* Screening-number assignment.
* Account activation.
* Call totals.
* Successful-call totals.
* Diverted-call totals.
* Recent call activity.
* Administrative account management.

The interface must not depend permanently on hard-coded users, sample call records, or demonstration totals.

---

## Beta Scope

The beta portal is intended to provide:

* Controlled beta access.
* Basic subscriber setup.
* Agreement acceptance.
* Basic participant call reporting.
* Administrative account monitoring.
* Ongoing product-performance visibility.

Finished consumer onboarding, Grace’s video, weekly blog delivery, estimated financial-loss avoidance, estimated time savings, and other polished subscriber features are outside the initial beta portal.

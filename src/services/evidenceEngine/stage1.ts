export interface Stage1OperationalData {
	to: string;
	connectionId: string | null;
	startTime: string | null;
}

export interface Stage1Evidence {
	from: string;
	callerIdName: string | null;
	direction: string | null;
	callingPartyType: string | null;
	fromSipUri: string | null;
	customHeaders: {
		name: string;
		value: string;
	}[];
}

export interface Stage1Result {
	operational: Stage1OperationalData;
	evidence: Stage1Evidence;
}

export function collectStage1Evidence(
	payload: unknown
): Stage1Result {
	const event = payload as {
		data?: {
			payload?: {
				from?: string;
				to?: string;
				caller_id_name?: string;
				direction?: string;
				calling_party_type?: string;
				from_sip_uri?: string;
				connection_id?: string;
				start_time?: string;
				custom_headers?: {
					name?: string;
					value?: string;
				}[];
			};
		};
	};

	const source = event.data?.payload;

	return {
		operational: {
			to: source?.to ?? "",
			connectionId: source?.connection_id ?? null,
			startTime: source?.start_time ?? null
		},
		evidence: {
			from: source?.from ?? "",
			callerIdName: source?.caller_id_name ?? null,
			direction: source?.direction ?? null,
			callingPartyType: source?.calling_party_type ?? null,
			fromSipUri: source?.from_sip_uri ?? null,
			customHeaders: (source?.custom_headers ?? []).map((header) => ({
				name: header.name ?? "",
				value: header.value ?? ""
			}))
		}
	};
}

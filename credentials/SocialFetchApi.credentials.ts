import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from "n8n-workflow";

export class SocialFetchApi implements ICredentialType {
	name = "socialFetchApi";

	displayName = "SocialFetch API";

	documentationUrl = "https://www.socialfetch.dev/docs";

	icon = "file:socialfetch.svg" as const;

	properties: INodeProperties[] = [
		{
			displayName: "API Key",
			name: "apiKey",
			type: "string",
			typeOptions: { password: true },
			default: "",
			required: true,
			description:
				"Your SocialFetch API key (starts with sfk_). Create one in the SocialFetch dashboard.",
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: "generic",
		properties: {
			headers: {
				"x-api-key": "={{$credentials.apiKey}}",
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: "https://api.socialfetch.dev",
			url: "/v1/whoami",
		},
	};
}

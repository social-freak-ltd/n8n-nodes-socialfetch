import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from "n8n-workflow";

export class SocialFetchApi implements ICredentialType {
	name = "socialFetchApi";

	displayName = "Social Fetch API";

	documentationUrl =
		"https://www.socialfetch.dev/docs/integrations/n8n#step-2-connect-your-api-key";

	icon = {
		light: "file:socialfetch.svg",
		dark: "file:socialfetch.dark.svg",
	} as const;

	properties: INodeProperties[] = [
		{
			displayName: "API Key",
			name: "apiKey",
			type: "string",
			typeOptions: { password: true },
			default: "",
			required: true,
			placeholder: "sfk_...",
			description:
				'Your Social Fetch API key. It starts with sfk_. Create one at <a href="https://app.socialfetch.dev/api-keys" target="_blank">app.socialfetch.dev/api-keys</a>.',
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

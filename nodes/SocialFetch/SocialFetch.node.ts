import type { INodeType, INodeTypeDescription } from "n8n-workflow";
import { NodeConnectionTypes } from "n8n-workflow";

import {
	allResourceProperties,
	resourceOptions,
} from "./descriptions/index.generated";

export class SocialFetch implements INodeType {
	description: INodeTypeDescription = {
		displayName: "Social Fetch",
		name: "socialFetch",
		icon: "file:socialfetch.svg",
		group: ["input"],
		version: 1,
		subtitle:
			'={{$parameter["operation"].replace(/\\./g, " › ").replace(/^[^›]+ › /, "")}}',
		description: "Fetch social media and web data via the Social Fetch API",
		defaults: { name: "Social Fetch" },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: "socialFetchApi", required: true }],
		requestDefaults: {
			baseURL: "https://api.socialfetch.dev",
			headers: {
				Accept: "application/json",
			},
		},
		properties: [
			{
				displayName: "Resource",
				name: "resource",
				type: "options",
				noDataExpression: true,
				options: resourceOptions,
				default: "tiktok",
			},
			...allResourceProperties,
		],
		usableAsTool: true,
	};
}

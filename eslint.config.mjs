import { config } from "@n8n/node-cli/eslint";

export default [
	...config,
	{
		// Dev-only unit tests never ship as part of a node/credential's runtime
		// behavior (n8n never imports *.test.ts), so the n8n Cloud
		// compatibility restrictions on console/process usage don't apply here.
		files: ["**/*.test.ts"],
		rules: {
			"no-console": "off",
			"@n8n/community-nodes/no-restricted-globals": "off",
		},
	},
];

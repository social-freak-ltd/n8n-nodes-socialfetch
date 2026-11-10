import type { IDataObject } from "n8n-workflow";

import type { SocialFetchOperationSpec } from "./operation-spec";

export const API_BASE_URL = "https://api.socialfetch.dev";

/** True for values the node should not send: empty text, empty lists, unset. */
function isEmpty(value: unknown): boolean {
	if (value === undefined || value === null) return true;
	if (typeof value === "string") return value.trim() === "";
	if (Array.isArray(value)) return value.every(isEmpty);
	return false;
}

/** The field's label as the node shows it: `highlightId` → "Highlight ID". */
export function fieldLabel(name: string): string {
	return name
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.split(" ")
		.map((word) => {
			const lower = word.toLowerCase();
			if (lower === "id" || lower === "url") return lower.toUpperCase();
			return lower.charAt(0).toUpperCase() + lower.slice(1);
		})
		.join(" ");
}

function trimmed(value: unknown): unknown {
	return typeof value === "string" ? value.trim() : value;
}

/**
 * Reads the inputs for one operation. A value can sit on the node itself or
 * under Additional Fields (version 1 keeps most inputs there); the node value
 * wins. Empty values are dropped so an untouched field is never sent.
 */
export function collectInputs(
	spec: SocialFetchOperationSpec,
	readTopLevel: (name: string) => unknown,
	additional: IDataObject,
): { path: string; qs: IDataObject } {
	let path = spec.path;
	for (const name of spec.pathParams) {
		const value = trimmed(readTopLevel(name) ?? additional[name]);
		if (isEmpty(value)) {
			throw new Error(
				`The ${fieldLabel(name)} field is empty. If it uses an expression, check that the previous node has that value.`,
			);
		}
		path = path.replace(`{${name}}`, encodeURIComponent(String(value)));
	}

	const qs: IDataObject = {};
	for (const param of spec.query) {
		const top = readTopLevel(param.name);
		const raw = isEmpty(top) ? additional[param.name] : top;
		if (isEmpty(raw)) continue;
		if (param.format === "csv" && Array.isArray(raw)) {
			qs[param.name] = raw.map(String).join(",");
		} else if (param.format === "repeat") {
			const list = (Array.isArray(raw) ? raw : [raw])
				.map(trimmed)
				.filter((v) => !isEmpty(v));
			qs[param.name] = list as IDataObject[keyof IDataObject];
		} else {
			qs[param.name] = trimmed(raw) as IDataObject[keyof IDataObject];
		}
	}

	return { path, qs };
}

function readPath(source: unknown, dotPath: string): unknown {
	let current = source;
	for (const key of dotPath.split(".")) {
		if (current === null || typeof current !== "object") return undefined;
		current = (current as Record<string, unknown>)[key];
	}
	return current;
}

/**
 * The "Simplify" output: one item per result for lists (for example one item
 * per video), and the `data` object for single lookups. Results that are not
 * objects are wrapped as `{ value }` so every n8n item stays an object.
 */
export function simplifyEnvelopes(
	envelopes: IDataObject[],
	itemsPath: string | undefined,
): IDataObject[] {
	const out: IDataObject[] = [];
	for (const envelope of envelopes) {
		if (itemsPath) {
			const list = readPath(envelope, itemsPath);
			if (Array.isArray(list)) {
				for (const entry of list) {
					out.push(
						entry !== null && typeof entry === "object" && !Array.isArray(entry)
							? (entry as IDataObject)
							: { value: entry as IDataObject[keyof IDataObject] },
					);
				}
				continue;
			}
		}
		const data = envelope.data;
		out.push(
			data !== null && typeof data === "object" && !Array.isArray(data)
				? (data as IDataObject)
				: envelope,
		);
	}
	return out;
}

/**
 * Verifies SocialFetch monitor webhook signatures inside n8n's Node.js
 * runtime. Mirrors the server's HMAC-SHA256 scheme byte-for-byte
 * (`packages/monitors/src/delivery/sign.ts`,
 * docs/internal/monitors-architecture-plan.md §8.2): Stripe's
 * `t=...,v1=...` header format, `v1 = hex(HMAC-SHA256(secret,
 * "{t}.{rawBody}"))`, with a 300s replay-protection window and support for
 * a rotation window carrying two `v1=` entries. Uses `node:crypto` (rather
 * than the Web Crypto API `@socialfetch/sdk`'s runtime-agnostic
 * implementation uses) because n8n trigger nodes always run in Node.js.
 */

import crypto from "node:crypto";

/** Replay-protection window, matching the server default (§8.2). */
export const SOCIALFETCH_SIGNATURE_TOLERANCE_SECONDS = 300;

export type WebhookVerifyFailureReason =
	| "malformed_header"
	| "stale_timestamp"
	| "signature_mismatch";

export type WebhookVerifyResult =
	| { ok: true }
	| { ok: false; reason: WebhookVerifyFailureReason };

interface ParsedSignatureHeader {
	timestampSeconds: number;
	signatures: string[];
}

function parseSignatureHeader(header: string): ParsedSignatureHeader | null {
	let timestampSeconds: number | null = null;
	const signatures: string[] = [];

	for (const rawPart of header.split(",")) {
		const part = rawPart.trim();
		const eq = part.indexOf("=");
		if (eq === -1) continue;
		const key = part.slice(0, eq);
		const value = part.slice(eq + 1);
		if (key === "t") {
			const parsed = Number.parseInt(value, 10);
			if (Number.isNaN(parsed)) return null;
			timestampSeconds = parsed;
		} else if (key === "v1" && value.length > 0) {
			signatures.push(value);
		}
	}

	if (timestampSeconds === null || signatures.length === 0) {
		return null;
	}
	return { timestampSeconds, signatures };
}

function hmacSha256Hex(secret: string, message: string): string {
	return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

function timingSafeEqualHex(a: string, b: string): boolean {
	const bufA = Buffer.from(a, "hex");
	const bufB = Buffer.from(b, "hex");
	if (bufA.length !== bufB.length || bufA.length === 0) {
		return false;
	}
	return crypto.timingSafeEqual(bufA, bufB);
}

export interface VerifySocialFetchSignatureInput {
	/** The exact raw request body bytes, as a string -- never a re-serialized object. */
	rawBody: string;
	/** The `socialfetch-signature` header value. */
	header: string;
	/** The webhook endpoint's signing secret (`sfwh_...`). */
	secret: string;
	toleranceSeconds?: number;
	now?: Date;
}

/** Verifies a webhook's signature. Never throws for a bad signature -- check `.ok`. */
export function verifySocialFetchSignature(
	input: VerifySocialFetchSignatureInput,
): WebhookVerifyResult {
	const parsed = parseSignatureHeader(input.header);
	if (!parsed) {
		return { ok: false, reason: "malformed_header" };
	}

	const tolerance =
		input.toleranceSeconds ?? SOCIALFETCH_SIGNATURE_TOLERANCE_SECONDS;
	const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
	if (Math.abs(nowSeconds - parsed.timestampSeconds) > tolerance) {
		return { ok: false, reason: "stale_timestamp" };
	}

	const signedPayload = `${parsed.timestampSeconds}.${input.rawBody}`;
	const expected = hmacSha256Hex(input.secret, signedPayload);
	const matched = parsed.signatures.some((candidate) => {
		try {
			return timingSafeEqualHex(candidate, expected);
		} catch {
			return false;
		}
	});

	return matched ? { ok: true } : { ok: false, reason: "signature_mismatch" };
}

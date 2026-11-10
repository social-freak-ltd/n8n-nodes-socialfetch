/**
 * Lightweight, dependency-free unit test for `webhook-signature.ts`. Avoids
 * `node:test`/`node:assert` deliberately: n8n Cloud's community-node lint
 * (`@n8n/community-nodes/no-restricted-imports`) rejects any import outside
 * its runtime allowlist, anywhere in this package -- including test files.
 * Run with `pnpm run test` (compiles via `tsc`, then plain `node` executes
 * this file; a non-zero exit code means a failure).
 */
import crypto from "node:crypto";

import {
	SOCIALFETCH_SIGNATURE_TOLERANCE_SECONDS,
	verifySocialFetchSignature,
	type WebhookVerifyResult,
} from "./webhook-signature.js";

const SECRET = "sfwh_test_secret";
const NOW = new Date("2026-07-30T12:00:00Z");

let failureCount = 0;

function check(
	label: string,
	actual: WebhookVerifyResult,
	expected: WebhookVerifyResult,
): void {
	if (JSON.stringify(actual) === JSON.stringify(expected)) {
		console.log(`ok - ${label}`);
		return;
	}
	failureCount += 1;
	console.error(`not ok - ${label}`);
	console.error(`  expected: ${JSON.stringify(expected)}`);
	console.error(`  actual:   ${JSON.stringify(actual)}`);
}

function buildHeader(input: {
	rawBody: string;
	timestampSeconds: number;
	secret: string;
}): string {
	const signedPayload = `${input.timestampSeconds}.${input.rawBody}`;
	const signature = crypto
		.createHmac("sha256", input.secret)
		.update(signedPayload)
		.digest("hex");
	return `t=${input.timestampSeconds},v1=${signature}`;
}

function runTests(): void {
	{
		const rawBody = JSON.stringify({
			id: "evt_1",
			type: "twitter.profile.tweets.new_items",
		});
		const timestampSeconds = Math.floor(NOW.getTime() / 1000);
		const header = buildHeader({ rawBody, timestampSeconds, secret: SECRET });

		check(
			"accepts a validly signed payload",
			verifySocialFetchSignature({ rawBody, header, secret: SECRET, now: NOW }),
			{ ok: true },
		);
	}

	{
		const rawBody = JSON.stringify({ id: "evt_1" });
		const timestampSeconds = Math.floor(NOW.getTime() / 1000);
		const header = buildHeader({
			rawBody,
			timestampSeconds,
			secret: "sfwh_wrong_secret",
		});

		check(
			"rejects a payload signed with the wrong secret",
			verifySocialFetchSignature({ rawBody, header, secret: SECRET, now: NOW }),
			{ ok: false, reason: "signature_mismatch" },
		);
	}

	{
		const rawBody = JSON.stringify({ id: "evt_1" });
		const timestampSeconds = Math.floor(NOW.getTime() / 1000);
		const header = buildHeader({ rawBody, timestampSeconds, secret: SECRET });
		const tamperedBody = JSON.stringify({ id: "evt_1_tampered" });

		check(
			"rejects a payload whose bytes were tampered with after signing",
			verifySocialFetchSignature({
				rawBody: tamperedBody,
				header,
				secret: SECRET,
				now: NOW,
			}),
			{ ok: false, reason: "signature_mismatch" },
		);
	}

	{
		const rawBody = JSON.stringify({ id: "evt_1" });
		const staleTimestampSeconds =
			Math.floor(NOW.getTime() / 1000) -
			SOCIALFETCH_SIGNATURE_TOLERANCE_SECONDS -
			1;
		const header = buildHeader({
			rawBody,
			timestampSeconds: staleTimestampSeconds,
			secret: SECRET,
		});

		check(
			"rejects a timestamp outside the replay-protection window",
			verifySocialFetchSignature({ rawBody, header, secret: SECRET, now: NOW }),
			{ ok: false, reason: "stale_timestamp" },
		);
	}

	{
		const rawBody = JSON.stringify({ id: "evt_1" });
		const timestampSeconds = Math.floor(NOW.getTime() / 1000);
		const signedPayload = `${timestampSeconds}.${rawBody}`;
		const staleSignature = crypto
			.createHmac("sha256", "sfwh_old_secret")
			.update(signedPayload)
			.digest("hex");
		const currentSignature = crypto
			.createHmac("sha256", SECRET)
			.update(signedPayload)
			.digest("hex");
		const header = `t=${timestampSeconds},v1=${staleSignature},v1=${currentSignature}`;

		check(
			"supports a rotation header carrying two v1 signatures",
			verifySocialFetchSignature({ rawBody, header, secret: SECRET, now: NOW }),
			{ ok: true },
		);
	}
	check(
		"rejects a malformed header",
		verifySocialFetchSignature({
			rawBody: "{}",
			header: "not-a-valid-header",
			secret: SECRET,
			now: NOW,
		}),
		{ ok: false, reason: "malformed_header" },
	);

	if (failureCount > 0) {
		console.error(`\n${failureCount} test(s) failed.`);
		process.exit(1);
	}
	console.log("\nAll webhook-signature tests passed.");
}

runTests();

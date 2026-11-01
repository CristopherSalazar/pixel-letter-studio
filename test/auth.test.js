import assert from "node:assert/strict";
import test from "node:test";
import { completeAuth, connect, disconnect, getToken } from "../dist/auth.js";

function browser(t) {
	const values = new Map();
	const previous = {};
	for (const key of ["sessionStorage", "location", "history"])
		previous[key] = Object.getOwnPropertyDescriptor(globalThis, key);
	const location = {
		href: "https://example.test/",
		pathname: "/",
		search: "",
		assign(url) {
			this.authorize = url;
		},
	};
	Object.defineProperty(globalThis, "sessionStorage", {
		configurable: true,
		value: {
			getItem: (key) => values.get(key) ?? null,
			setItem: (key, value) => values.set(key, value),
			removeItem: (key) => values.delete(key),
		},
	});
	Object.defineProperty(globalThis, "location", {
		configurable: true,
		value: location,
	});
	Object.defineProperty(globalThis, "history", {
		configurable: true,
		value: {
			replaceState() {
				location.search = "";
			},
		},
	});
	t.after(() => {
		for (const key of Object.keys(previous)) {
			if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
			else delete globalThis[key];
		}
	});
	return { values, location };
}
test("PKCE wallet flow uses a random state and narrow consent; token is session-only", async (t) => {
	const { values, location } = browser(t);
	await connect();
	const params = new URL(location.authorize).searchParams;
	assert.equal(params.get("scope"), "generate");
	assert.equal(params.get("budget"), "0.05");
	assert.equal(params.get("code_challenge_method"), "S256");
	assert.equal(params.get("code_challenge").length, 43);
	assert.equal(
		params.get("client_id"),
		"https://example.test/oauth-client.json",
	);
	location.search = new URLSearchParams({
		code: "test-code",
		state: params.get("state"),
	}).toString();
	t.mock.method(globalThis, "fetch", async (url, options) => {
		assert.equal(url, "https://enter.pollinations.ai/api/oauth/token");
		assert.equal(options.body.get("code"), "test-code");
		assert.equal(options.body.get("code_verifier").length, 43);
		return Response.json({ access_token: "sk_test_only" });
	});
	assert.equal(await completeAuth(), true);
	assert.equal(getToken(), "sk_test_only");
	assert.equal(location.search, "");
	assert.equal(values.has("pixel-letter-auth"), false);
	disconnect();
	assert.equal(getToken(), null);
});
test("state mismatch and reused callbacks cannot exchange an authorization code", async (t) => {
	const { location } = browser(t);
	await connect();
	let calls = 0;
	t.mock.method(globalThis, "fetch", async () => {
		calls++;
		throw new Error("must not fetch");
	});
	location.search = "?code=test&state=wrong";
	await assert.rejects(completeAuth(), /verification/);
	assert.equal(calls, 0);
	location.search = "?code=test&state=wrong";
	await assert.rejects(completeAuth(), /verification/);
	assert.equal(calls, 0);
});

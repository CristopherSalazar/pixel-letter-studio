import { MODEL } from "./art.js";

const SESSION = "pixel-letter-wallet";
const PENDING = "pixel-letter-auth";
function b64(bytes) {
	return btoa(String.fromCharCode(...bytes))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}
export function getToken() {
	return sessionStorage.getItem(SESSION);
}
export function disconnect() {
	sessionStorage.removeItem(SESSION);
	sessionStorage.removeItem(PENDING);
}

export async function connect() {
	const verifier = b64(crypto.getRandomValues(new Uint8Array(32)));
	const state = b64(crypto.getRandomValues(new Uint8Array(24)));
	const challenge = b64(
		new Uint8Array(
			await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
		),
	);
	const redirect = new URL("./", location.href).href;
	const client = new URL("oauth-client.json", redirect).href;
	sessionStorage.setItem(
		PENDING,
		JSON.stringify({ verifier, state, redirect, client, created: Date.now() }),
	);
	const params = new URLSearchParams({
		response_type: "code",
		client_id: client,
		redirect_uri: redirect,
		scope: "generate",
		models: MODEL,
		budget: "0.05",
		expiry: "1",
		state,
		code_challenge: challenge,
		code_challenge_method: "S256",
	});
	location.assign(`https://enter.pollinations.ai/authorize?${params}`);
}

export async function completeAuth() {
	const params = new URLSearchParams(location.search);
	if (!params.has("code") && !params.has("error")) return false;
	// Remove the short-lived authorization code before any other requests.
	history.replaceState(null, "", location.pathname);
	const saved = sessionStorage.getItem(PENDING);
	sessionStorage.removeItem(PENDING);
	const pending = saved ? JSON.parse(saved) : null;
	if (
		!pending ||
		params.get("state") !== pending.state ||
		Date.now() - pending.created > 600000
	)
		throw new Error("Wallet verification expired or failed. Please reconnect.");
	if (params.has("error"))
		throw new Error(
			"Wallet connection was declined. The free demo still works.",
		);
	const response = await fetch(
		"https://enter.pollinations.ai/api/oauth/token",
		{
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code: params.get("code"),
				client_id: pending.client,
				redirect_uri: pending.redirect,
				code_verifier: pending.verifier,
			}),
		},
	);
	if (!response.ok)
		throw new Error("Could not connect the wallet. Reconnect to try again.");
	const token = await response.json();
	if (
		typeof token.access_token !== "string" ||
		!token.access_token.startsWith("sk_")
	)
		throw new Error("The wallet returned an invalid session.");
	sessionStorage.setItem(SESSION, token.access_token);
	return true;
}

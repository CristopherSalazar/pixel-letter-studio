import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_ART, generateArt, validateArt } from "../dist/art.js";
import { capacity, embed, packMessage, reveal } from "../dist/stego.js";

const pixels = () => new Uint8ClampedArray(160 * 160 * 4).fill(127);

test("Unicode and multiline message round-trip with verified checksum", async () => {
	const message = "Nos vemos en Quito 🌋\n日本語 — <script>text only</script>";
	const result = await reveal(embed(pixels(), await packMessage(message)));
	assert.equal(result.message, message);
	assert.equal(result.encrypted, false);
});
test("embedding changes only RGB low bits and never mutates the cover", async () => {
	const original = pixels();
	const changed = embed(original, await packMessage("hello"));
	for (let i = 0; i < original.length; i++) {
		assert.equal(original[i], 127);
		assert.ok(Math.abs(changed[i] - original[i]) <= 1);
		if (i % 4 === 3) assert.equal(changed[i], original[i]);
	}
});
test("password encryption round-trips, rejects wrong password and requires one", async () => {
	const cover = embed(
		pixels(),
		await packMessage("Secret message", "eight letters"),
	);
	assert.deepEqual(await reveal(cover, "eight letters"), {
		message: "Secret message",
		encrypted: true,
	});
	await assert.rejects(reveal(cover, "wrong password"), /Incorrect password/);
	await assert.rejects(reveal(cover), /encrypted/);
});
test("encryption uses fresh random salt and nonce", async () => {
	assert.notDeepEqual(
		await packMessage("same", "password123"),
		await packMessage("same", "password123"),
	);
});
test("corrupted payloads fail integrity verification", async () => {
	for (const password of ["", "password123"]) {
		const cover = embed(pixels(), await packMessage("message", password));
		// Flip a data bit after the header and salt/nonce/checksum area.
		cover[Math.floor(350 / 3) * 4 + (350 % 3)] ^= 1;
		await assert.rejects(reveal(cover, password), /integrity|damaged/);
	}
});
test("empty, oversized and short-password messages fail before embedding", async () => {
	await assert.rejects(packMessage(""), /between/);
	await assert.rejects(packMessage("😀".repeat(1025)), /4,096/);
	await assert.rejects(packMessage("hello", "short"), /8 characters/);
	const result = await reveal(
		embed(pixels(), await packMessage("é".repeat(2048))),
	);
	assert.equal(result.message, "é".repeat(2048));
});
test("small images, missing signatures and forged lengths fail safely", async () => {
	await assert.rejects(reveal(new Uint8ClampedArray(8)), /No Pixel Letter/);
	await assert.rejects(reveal(pixels()), /No Pixel Letter/);
	assert.throws(
		() => embed(new Uint8ClampedArray(40), new Uint8Array(50)),
		/too small/,
	);
	const packet = await packMessage("hello");
	new DataView(packet.buffer).setUint32(5, 0xffffffff);
	await assert.rejects(reveal(embed(pixels(), packet)), /damaged/);
	assert.equal(capacity(new Uint8ClampedArray(32)), 3);
});
test("geometry validates known shape types, finite ranges and colors", () => {
	assert.equal(validateArt(DEMO_ART).shapes.length, 10);
	for (const change of [
		{ background: "url(https://evil.test)" },
		{ shapes: [] },
		{
			shapes: [
				{ kind: "script", x: 0, y: 0, w: 1, h: 1, color: "#ffffff" },
				...DEMO_ART.shapes,
			],
		},
	])
		assert.throws(
			() => validateArt({ ...DEMO_ART, ...change }),
			/invalid|unsupported/,
		);
	assert.throws(
		() =>
			validateArt({
				...DEMO_ART,
				shapes: DEMO_ART.shapes.map((s) => ({ ...s, x: Infinity })),
			}),
		/unsupported/,
	);
});
test("AI request sends only the theme, uses the scoped user token and reports usage", async (t) => {
	let request;
	t.mock.method(globalThis, "fetch", async (url, options) => {
		request = { url, ...options };
		return Response.json({
			usage: { total_tokens: 123 },
			choices: [{ message: { content: JSON.stringify(DEMO_ART) } }],
		});
	});
	const result = await generateArt("A forest", "sk_test_not_real");
	assert.equal(request.headers.Authorization, "Bearer sk_test_not_real");
	const body = JSON.parse(request.body);
	assert.equal(body.messages[1].content, "Visual theme: A forest");
	assert.equal(body.messages.length, 2);
	assert.equal(result.tokens, 123);
	assert.ok(!("message" in body) && !("password" in body));
});
test("API errors never retry, and missing usage or invalid artwork fail honestly", async (t) => {
	for (const response of [
		new Response("", { status: 402 }),
		Response.json({ choices: [] }),
		Response.json({
			usage: { total_tokens: 1 },
			choices: [{ message: { content: "<script>oops</script>" } }],
		}),
	]) {
		let calls = 0;
		const mock = t.mock.method(globalThis, "fetch", async () => {
			calls++;
			return response;
		});
		await assert.rejects(generateArt("forest", "sk_test_not_real"));
		assert.equal(calls, 1);
		mock.mock.restore();
	}
});

import { DEMO_ART, drawArt, generateArt } from "./art.js";
import { completeAuth, connect, disconnect, getToken } from "./auth.js";
import { embed, packMessage, reveal } from "./stego.js";

const $ = (id) => document.getElementById(id);
const canvas = $("art");
let art = DEMO_ART;
let busy = false;
let uploaded = null;
function status(message, error = false) {
	$("status").textContent = message;
	$("status").dataset.error = String(error);
}
function refreshWallet() {
	const connected = !!getToken();
	$("connect").hidden = connected;
	$("disconnect").hidden = !connected;
	$("connection").textContent = connected
		? "Wallet connected · your Pollen"
		: "Local mode · no Pollen used";
}
function displayArt(value, source) {
	art = value;
	drawArt(canvas, art);
	$("art-title").textContent = art.title;
	$("art-source").textContent = source;
	canvas.setAttribute("aria-label", `Postcard preview: ${art.title}`);
}
function mode(make) {
	$("make-panel").hidden = !make;
	$("reveal-panel").hidden = make;
	$("make-tab").setAttribute("aria-selected", String(make));
	$("reveal-tab").setAttribute("aria-selected", String(!make));
	status("");
}
function setBusy(value) {
	busy = value;
	for (const id of [
		"generate",
		"hide",
		"demo",
		"read",
		"connect",
		"disconnect",
	])
		$(id).disabled = value;
}
async function run(action) {
	if (busy) return;
	setBusy(true);
	try {
		await action();
	} catch (error) {
		status(error.message, true);
	} finally {
		setBusy(false);
	}
}
$("make-tab").onclick = () => mode(true);
$("reveal-tab").onclick = () => mode(false);
$("demo").onclick = () => {
	displayArt(DEMO_ART, "FREE DEMO / LOCAL ART");
	status("Demo postcard loaded. No Pollen used.");
};
$("message").oninput = () => {
	const bytes = new TextEncoder().encode($("message").value).length;
	$("byte-count").textContent = `${bytes.toLocaleString()} / 4,096 bytes`;
};
$("encrypt").onchange = () => {
	$("password-wrap").hidden = !$("encrypt").checked;
	if (!$("encrypt").checked) $("password").value = "";
};
$("connect").onclick = () =>
	run(async () => {
		if ($("message").value || $("password").value) {
			status(
				"Connect before writing your secret: wallet sign-in reloads this page. Download your letter first, or clear the secret fields.",
				true,
			);
			return;
		}
		await connect();
	});
$("disconnect").onclick = () => {
	disconnect();
	refreshWallet();
	status(
		"Disconnected on this device. You can also revoke this app session in your Pollinations key dashboard.",
	);
};
$("generate").onclick = () => {
	if (!getToken()) {
		status(
			"Connect your Pollen wallet first, or use the free demo postcard.",
			true,
		);
		return;
	}
	if (!$("theme").value.trim()) {
		status("Write a visual theme first.", true);
		return;
	}
	$("cost-dialog").showModal();
};
$("cost-dialog").addEventListener("close", () => {
	if ($("cost-dialog").returnValue === "confirm")
		run(async () => {
			status(
				"Painting your postcard with Pollinations… One request, no automatic retries.",
			);
			const result = await generateArt($("theme").value, getToken());
			displayArt(result.art, "AI ART / POLLINATIONS");
			status(
				`Postcard ready. Pollinations reported ${result.tokens.toLocaleString()} total tokens. Your secret was not sent.`,
			);
		});
});
$("hide").onclick = () =>
	run(async () => {
		const password = $("encrypt").checked ? $("password").value : "";
		if ($("encrypt").checked && password.length < 8)
			throw new Error("Enter a password of at least 8 characters.");
		const packet = await packMessage($("message").value, password);
		// Always embed into a fresh cover, not the current preview's previous payload.
		drawArt(canvas, art);
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
		pixels.data.set(embed(pixels.data, packet));
		ctx.putImageData(pixels, 0, 0);
		const blob = await new Promise((resolve) =>
			canvas.toBlob(resolve, "image/png"),
		);
		if (!blob) throw new Error("Your browser could not export the PNG.");
		const link = document.createElement("a");
		const url = URL.createObjectURL(blob);
		link.href = url;
		link.download = "pixel-letter.png";
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 10000);
		status(
			`PNG downloaded with ${password ? "an encrypted" : "an unencrypted"} message. Send it as an original file, without resizing.`,
		);
	});
$("upload").onchange = () => {
	uploaded = null;
	$("revealed").textContent = "Your decoded message will appear here.";
	$("integrity").textContent = "";
	status("");
};
$("read").onclick = () =>
	run(async () => {
		$("revealed").textContent = "Checking the letter…";
		$("integrity").textContent = "";
		const file = $("upload").files[0];
		if (!file) throw new Error("Choose a Pixel Letter PNG first.");
		if (file.size > 10 * 1024 * 1024)
			throw new Error("Choose a PNG under 10 MB.");
		const signature = new Uint8Array(await file.slice(0, 24).arrayBuffer());
		if (
			![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => signature[i] === v) ||
			signature.length < 24
		)
			throw new Error("This is not a valid PNG file.");
		const dimensions = new DataView(signature.buffer);
		const width = dimensions.getUint32(16),
			height = dimensions.getUint32(20);
		if (!width || !height || width > 2048 || height > 2048)
			throw new Error("PNG dimensions must be at most 2048 × 2048.");
		const bitmap = await createImageBitmap(file);
		try {
			if (bitmap.width !== width || bitmap.height !== height)
				throw new Error("Invalid PNG dimensions.");
			const local = document.createElement("canvas");
			local.width = width;
			local.height = height;
			const ctx = local.getContext("2d", { willReadFrequently: true });
			ctx.drawImage(bitmap, 0, 0);
			uploaded = ctx.getImageData(0, 0, width, height).data;
		} finally {
			bitmap.close();
		}
		const result = await reveal(uploaded, $("reveal-password").value);
		$("revealed").textContent = result.message;
		$("integrity").textContent = result.encrypted
			? "✓ AES-GCM authentication verified."
			: "✓ Message checksum verified. This letter is not encrypted.";
		status("Letter revealed locally. No image uploaded and no Pollen used.");
	});
displayArt(DEMO_ART, "FREE DEMO / LOCAL ART");
refreshWallet();
completeAuth()
	.then((connected) => {
		refreshWallet();
		if (connected)
			status(
				"Wallet connected. Only Paint with AI makes a model request, after your confirmation.",
			);
	})
	.catch((error) => status(error.message, true));

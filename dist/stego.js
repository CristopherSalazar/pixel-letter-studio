const encoder = new TextEncoder();
const MAGIC = [80, 88, 76, 49]; // PXL1, version 1
const HEADER = 9;
export const MAX_MESSAGE_BYTES = 4096;

export function capacity(rgba) {
	return Math.floor(((rgba.length / 4) * 3) / 8);
}

async function passwordKey(password, salt) {
	const material = await crypto.subtle.importKey(
		"raw",
		encoder.encode(password),
		"PBKDF2",
		false,
		["deriveKey"],
	);
	return crypto.subtle.deriveKey(
		{ name: "PBKDF2", hash: "SHA-256", salt, iterations: 210000 },
		material,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
}

export async function packMessage(message, password = "") {
	const plain = encoder.encode(message);
	if (!plain.length || plain.length > MAX_MESSAGE_BYTES)
		throw new Error("Write a message between 1 and 4,096 UTF-8 bytes.");
	let body;
	if (password) {
		if (password.length < 8)
			throw new Error("Use a password of at least 8 characters.");
		const salt = crypto.getRandomValues(new Uint8Array(16));
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const key = await passwordKey(password, salt);
		const encrypted = new Uint8Array(
			await crypto.subtle.encrypt(
				{ name: "AES-GCM", iv, additionalData: new Uint8Array(MAGIC) },
				key,
				plain,
			),
		);
		body = new Uint8Array(28 + encrypted.length);
		body.set(salt);
		body.set(iv, 16);
		body.set(encrypted, 28);
	} else {
		const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", plain));
		body = new Uint8Array(32 + plain.length);
		body.set(digest);
		body.set(plain, 32);
	}
	const packet = new Uint8Array(HEADER + body.length);
	packet.set(MAGIC);
	packet[4] = password ? 1 : 0;
	new DataView(packet.buffer).setUint32(5, body.length);
	packet.set(body, HEADER);
	return packet;
}

function readBytes(rgba, count) {
	const bytes = new Uint8Array(count);
	for (let bit = 0; bit < count * 8; bit++) {
		const channel = Math.floor(bit / 3) * 4 + (bit % 3);
		bytes[bit >> 3] |= (rgba[channel] & 1) << (7 - (bit % 8));
	}
	return bytes;
}

export function embed(rgba, packet) {
	if (rgba.length % 4 || capacity(rgba) < packet.length)
		throw new Error("This image is too small for the message.");
	const output = new Uint8ClampedArray(rgba);
	for (let bit = 0; bit < packet.length * 8; bit++) {
		const channel = Math.floor(bit / 3) * 4 + (bit % 3);
		output[channel] =
			(output[channel] & 254) | ((packet[bit >> 3] >> (7 - (bit % 8))) & 1);
	}
	return output;
}

export async function reveal(rgba, password = "") {
	if (capacity(rgba) < HEADER)
		throw new Error("No Pixel Letter message found.");
	const header = readBytes(rgba, HEADER);
	if (!MAGIC.every((value, i) => header[i] === value) || header[4] > 1)
		throw new Error(
			"No Pixel Letter message found. Use an original Pixel Letter PNG.",
		);
	const length = new DataView(header.buffer).getUint32(5);
	const encrypted = header[4] === 1;
	const overhead = encrypted ? 44 : 32;
	if (
		length <= overhead ||
		length > MAX_MESSAGE_BYTES + overhead ||
		length + HEADER > capacity(rgba)
	)
		throw new Error("The message header is damaged or incomplete.");
	const body = readBytes(rgba, HEADER + length).slice(HEADER);
	let plain;
	if (encrypted) {
		if (!password)
			throw new Error("This letter is encrypted. Enter its password.");
		try {
			const key = await passwordKey(password, body.slice(0, 16));
			plain = new Uint8Array(
				await crypto.subtle.decrypt(
					{
						name: "AES-GCM",
						iv: body.slice(16, 28),
						additionalData: new Uint8Array(MAGIC),
					},
					key,
					body.slice(28),
				),
			);
		} catch {
			throw new Error("Incorrect password or damaged image.");
		}
	} else {
		plain = body.slice(32);
		const actual = new Uint8Array(await crypto.subtle.digest("SHA-256", plain));
		if (!actual.every((value, i) => body[i] === value))
			throw new Error(
				"The message failed its integrity check. The image may have been edited.",
			);
	}
	return {
		message: new TextDecoder("utf-8", { fatal: true }).decode(plain),
		encrypted,
	};
}

### App Name
Pixel Letter

### App Description
Pollinations LLM-designed PNG postcards with locally hidden messages, optional AES-GCM encryption and OAuth BYOP. Secrets stay on the device; recipients decode without API calls. Includes a free demo.

### App URL
https://pixel-letter-studio.cris16esl.chatgpt.site/

### GitHub Repository URL
https://github.com/CristopherSalazar/pixel-letter-studio

### Screenshot
![Pixel Letter](https://raw.githubusercontent.com/CristopherSalazar/pixel-letter-studio/main/docs/screenshot.jpg)

### App Category
learn

### Platform
web

### App Language
en

### Discord Username
_No response_

### Quest
#18367

### Verification
12 automated tests pass. Real browser PNG download/upload recovered an encrypted Unicode message. Desktop/mobile checks passed. Real OAuth PKCE connection and one openai/gpt-5.4-nano generation succeeded: "Lighthouse at Low Tide", 743 total tokens, under a user-approved 0.01 Quest Pollen session (Paid Pollen disabled). The downloaded AI-generated PNG recovered PIXEL-LETTER-LIVE-20261101 · La luz nos guía 🌊 with verified AES-GCM authentication.

[Live test details and actual PNG](https://github.com/CristopherSalazar/pixel-letter-studio#browser-verification--1-november-2026). This uses PNG pixel steganography rather than SVG metadata; theme-only model prompts keep the secret local. Only explicit Paint with AI actions consume the user’s Pollen; embedding and revealing are free.


### Pollinations integration — direct source and live proof

- Actual model HTTP request: [dist/art.js, lines 83–107](https://github.com/CristopherSalazar/pixel-letter-studio/blob/a634e7ea9b980f8e3ff8c55892f0fdf4808c7ab4/dist/art.js#L83-L107). It posts to `https://gen.pollinations.ai/v1/chat/completions` with the scoped user's bearer token, `model: "openai/gpt-5.4-nano"`, JSON output and a 2,200 output-token limit.
- The visible **Paint with AI** confirmation invokes that request: [dist/app.js, line 111](https://github.com/CristopherSalazar/pixel-letter-studio/blob/main/dist/app.js#L111).
- PKCE wallet code: [dist/auth.js](https://github.com/CristopherSalazar/pixel-letter-studio/blob/main/dist/auth.js); [public client metadata](https://pixel-letter-studio.cris16esl.chatgpt.site/oauth-client.json).
- [Actual AI-generated PNG](https://raw.githubusercontent.com/CristopherSalazar/pixel-letter-studio/main/docs/live-letter.png) — title **Lighthouse at Low Tide**, 743 total tokens reported by the real API. To verify its hidden payload locally, download it as a file, open Reveal a letter and use the intentionally public test password `public-test-password`. Expected text: `PIXEL-LETTER-LIVE-20261101 · La luz nos guía 🌊`.
- [Live generation screenshot](https://raw.githubusercontent.com/CristopherSalazar/pixel-letter-studio/main/docs/live-generation.jpg) and [successful recovery screenshot](https://raw.githubusercontent.com/CristopherSalazar/pixel-letter-studio/main/docs/live-reveal.jpg).
- The **free demo** is intentionally local and makes no API calls. The AI feature requires the user's wallet and an explicit confirmation. The separate local secret text is never included in the model request.

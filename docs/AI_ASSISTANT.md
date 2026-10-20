# AI assistant ("Hashimi AI Assistant") with Ollama

A floating chat widget on the public website. Its answers are written by an open model running in **Ollama** on a machine you control, using only the website's own public content. Nothing a visitor types and nothing the assistant answers is stored.

```
Website chat widget  →  Express backend (POST /api/v1/chatbot/messages)  →  Ollama (POST /api/chat)  →  backend  →  widget
```

The browser never talks to Ollama. Only the backend does.

## Set it up on Windows (development)

1. **Install Ollama** from <https://ollama.com/download> (or run the downloaded `OllamaSetup.exe`). Check it:

   ```
   ollama --version
   ```

2. **Pick a model for your hardware.** Models are listed at <https://ollama.com/library>. This project is tested with **`qwen2.5:3b`** (1.9 GB) on a laptop with 16 GB RAM and no dedicated GPU (CPU only, about 9 tokens per second). Rough guide: 8 GB RAM → `qwen2.5:1.5b`; 16 GB → `qwen2.5:3b`; 16 GB + a GPU, or 32 GB → `qwen2.5:7b` (better answers). Bigger models are slower on a CPU.

3. **Download the model and confirm it is there:**

   ```
   ollama pull qwen2.5:3b
   ollama list
   ```

4. **Make sure the service is running.** The Windows app starts it automatically; otherwise run `ollama serve` in a terminal. Check it:

   ```
   curl http://127.0.0.1:11434/api/version
   ```

5. **Test a basic answer** (either way works):

   ```
   ollama run qwen2.5:3b "Say hello in one short sentence."
   ```

   ```
   cd backend
   npm run chatbot:check
   ```

   `chatbot:check` verifies, using the settings in `backend/.env`, that Ollama is reachable, the model is installed and the model really answers, and prints the command to fix whichever step fails.

6. **Configure the backend** (`backend/.env`; defaults already match steps 1 to 4):

   ```
   OLLAMA_BASE_URL=http://127.0.0.1:11434
   OLLAMA_MODEL=qwen2.5:3b
   ```

   Start the API (`npm run dev`) and the website. Open the chat bubble and ask something. `GET /api/v1/chatbot/status` returns `{"available":true}` once Ollama is reachable and the model is installed.

Tip for small system drives: set the user environment variable `OLLAMA_MODELS` (for example `D:\OllamaModels`) before pulling models, and install Ollama to another drive (`OllamaSetup.exe /DIR="D:\Ollama"`).

## Settings (`backend/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Where the backend reaches Ollama. No username or password in the URL. |
| `OLLAMA_MODEL` | `qwen2.5:3b` | An installed model. |
| `OLLAMA_API_KEY` | (empty) | Optional secret sent as a Bearer token to an authenticated reverse proxy in front of Ollama. Ollama itself has no login. |
| `OLLAMA_TIMEOUT_MS` | `120000` | Give up on one answer after this long. The first answer after the model was idle loads it into memory and is slower. |
| `OLLAMA_NUM_CTX` | `4096` | Context window. |
| `OLLAMA_MAX_TOKENS` | `400` | Longest answer. |
| `OLLAMA_TEMPERATURE` | `0.2` | Low = steadier, more factual. |
| `OLLAMA_KEEP_ALIVE` | `30m` | How long the model stays loaded after the last question. |
| `CHATBOT_CONTEXT_CHUNKS` | `3` | Website facts given to the model per question (fewer = faster). |
| `CHATBOT_MAX_PENDING` | `4` | Answers that may wait at once. A local machine answers one at a time; more waiting visitors get a polite "busy". |
| `CHATBOT_RATE_LIMIT_MAX` / `CHATBOT_DAILY_LIMIT_MAX` | `20` / `150` | Answers per client IP per 10 minutes / per day. |

## Local development versus a live website

`127.0.0.1` always means "the machine this program runs on". So:

- **Development:** the backend and Ollama run on the same computer, and `OLLAMA_BASE_URL=http://127.0.0.1:11434` works.
- **A deployed backend cannot use the Ollama on your personal computer.** On a host such as Render, Railway or a VPS, its `127.0.0.1` is the host, not your laptop, and your laptop is switched off and unreachable anyway. The assistant will simply report itself unavailable.
- **To run the assistant on the live site,** Ollama must run on a machine that is always on and big enough for the model (enough RAM, ideally a GPU), and the backend must be able to reach it:
  - Same server as the backend: keep `OLLAMA_BASE_URL=http://127.0.0.1:11434`.
  - A separate AI server: put it on a **private network** (VPC / VPN / Tailscale / WireGuard), or put an **HTTPS reverse proxy that requires a secret** in front of it (Nginx or Caddy checking `Authorization: Bearer <secret>`), and set `OLLAMA_BASE_URL=https://ai.yourdomain.com` and `OLLAMA_API_KEY=<secret>` on the backend.
  - **Never open Ollama's port 11434 to the internet.** Ollama has no authentication; anyone who reaches it can run models on your hardware. In production the backend refuses to start if `OLLAMA_BASE_URL` is plain `http://` to a public address, or uses port 11434 on a public host.
- A model on a CPU server answers in several seconds to half a minute. A GPU server, or a smaller model, is much faster.

This repository does not deploy anything or change any hosting; it only reads the settings above.

## API

`POST /api/v1/chatbot/messages` (public, same-origin only)

```json
{ "messages": [ { "role": "user", "content": "How do I become a carrier?" } ] }
```

The body is the conversation so far (at most 8 messages of at most 1,200 characters; first and last from the visitor). Response:

```json
{ "success": true, "data": { "reply": "…", "links": [ { "label": "Become a Carrier", "path": "/become-a-carrier" } ] } }
```

`GET /api/v1/chatbot/status` returns `{ "available": boolean }` and nothing else: the backend asks Ollama itself whether it is reachable and has the model.

Errors are always one of a few fixed messages: `422` invalid request, `429` rate limited, `503` unavailable or busy (`CHATBOT_UNAVAILABLE`, `CHATBOT_BUSY`), `504` timeout (`CHATBOT_TIMEOUT`). Ollama's own messages, file paths, addresses, stack traces and keys never reach the visitor. If Ollama is not running or the model is missing, the assistant says it is unavailable; it never makes up an answer.

## What it knows

- The website's **built-in content** (services, industries, service areas, FAQs, how it works, carrier information, routes), generated from `frontend/src/content` into `backend/src/chatbot/knowledge.data.json`. After changing built-in website content run `cd backend && npm run chatbot:sync`; a test fails when the file is out of date.
- **Published CMS content** (services, industries, service areas, FAQs and the contact details in Site settings) is read live (cached 5 minutes) and replaces the built-in text for the same topic. Nothing else is read: there is no path from the assistant to quotes, shipments, customers, carriers, documents, payments or accounts.

For each question the model gets a short rulebook, a handful of the best-matching facts (keyword search that tolerates typos) and the list of real pages it may mention. A small model reads about 70 tokens a second on a laptop CPU, so these are kept short on purpose.

## Safety and privacy

- **Stateless:** no database writes, no stored conversations. The server logs only timing and token counts, never message text. Conversation context lives in the visitor's browser tab (memory only) and is sent with each request, trimmed to what fits.
- **Limits:** body 10 kb, 8 messages, 1,200 characters each, per-IP burst and daily limits (counted only for valid requests), a hard timeout, a cap on waiting answers, same-origin check.
- **Prompt injection:** the visitor's text and the website facts are data, never part of the instructions. Messages that try to extract the instructions or the key, and requests for the status of a specific shipment, are answered immediately with a fixed reply and never reach the model.
- **Checked output:** a reply that quotes a price, offers ocean/air freight or customs services, makes a guarantee, or contains pieces of the instructions is replaced with a fixed, honest answer before it is shown. Markdown and hidden reasoning are stripped; the widget renders plain text only.
- The assistant never states shipment status, requests payment or login details, submits forms or makes commitments. It sends visitors to `/request-quote`, `/become-a-carrier`, `/carrier-resources`, `/track-shipment`, `/contact` and `/faq`.

## Limits of a small local model

`qwen2.5:3b` follows instructions well enough for short, factual answers from supplied text, but it can still be wrong or awkward, and it is slow on a CPU. The safeguards above reduce the risk; they do not remove it. For better answers use a larger model (`qwen2.5:7b`) on better hardware and raise `CHATBOT_CONTEXT_CHUNKS` a little.

## Not included on purpose

There is no admin panel or CMS page for the assistant: configuration lives in the environment variables above, and the widget's text lives in `frontend/src/components/chatbot/`.

# PeerBox v2.0

> Encrypted, zero-knowledge peer-to-peer file transfer and confidential clipboard sync in your browser.

Direct browser-to-browser transfers secured with ephemeral ECDH P-256 key exchange, military-grade AES-256-GCM authenticated cipher, and streaming SHA-256 checksums. No cloud storage, no tracking, and zero intermediaries.

---

## ⚡ Highlights & Advanced Features

- 🔐 **Zero-Knowledge End-to-End Encryption** — Ephemeral ECDH (P-256 curve) key agreement generated in-browser via Web Crypto API. Private keys never leave device memory.
- 🛡️ **SAS Safety Verification (MITM Prevention)** — 4 visual shield emojis and 6-digit verification code to ensure zero tampering on the signaling layer.
- 🚀 **WebRTC Backpressure Streaming** — High-throughput chunk streaming with dynamic `bufferedAmount` monitoring to transfer gigabyte-sized files without buffer overflow.
- 🔍 **SHA-256 Integrity Check** — Real-time cryptographic hashing verifies byte-for-byte correctness upon receipt.
- 🔑 **Room Passphrase / PIN Protection** — Optional secret passphrase combined with ECDH shared bits to lock rooms against unauthorized access.
- 📝 **Encrypted Secret Notes & Clipboard Sync** — Instant direct P2P transfer of credentials, API tokens, passwords, and text snippets.
- ✨ **Clean, Minimalist Interface** — Refined dark UI with responsive controls and zero unnecessary bloat.

---

## 🛠️ Architecture & Cryptography

```
Sender Browser                              Receiver Browser
┌────────────────────────┐                  ┌────────────────────────┐
│  Generate ECDH P-256   │                  │  Generate ECDH P-256   │
│  (Private / Public Key)│                  │  (Private / Public Key)│
└──────────┬─────────────┘                  └───────────┬────────────┘
           │                                            │
           │  1. Exchange Public Keys via WebRTC        │
           ├───────────────────────────────────────────►│
           │◄───────────────────────────────────────────┤
           │                                            │
           ▼                                            ▼
┌────────────────────────┐                  ┌────────────────────────┐
│  Derive Shared Bits    │                  │  Derive Shared Bits    │
│  + Deterministic Salt  │                  │  + Deterministic Salt  │
│  + Optional PIN / Salt │                  │  + Optional PIN / Salt │
│  ─────────────         │                  │  ─────────────         │
│  HKDF SHA-256          │                  │  HKDF SHA-256          │
│  ==> AES-256-GCM Key   │                  │  ==> AES-256-GCM Key   │
│  ==> 4-Emoji SAS Code  │                  │  ==> 4-Emoji SAS Code  │
└──────────┬─────────────┘                  └───────────┬────────────┘
           │                                            │
           │  2. Direct WebRTC DataChannel (Encrypted)  │
           │===========================================>│
           │  (AES-GCM chunks + IV + SHA-256 checksum)  │
```

---

## 📊 Comparison: PeerBox vs Traditional File Transfer

| Feature | PeerBox v2.0 | Traditional Cloud / Wetransfer |
| :--- | :--- | :--- |
| **Server Storage** | ❌ None (0 bytes on server) | ⚠️ Files uploaded to third-party server |
| **Encryption** | 🔒 ECDH P-256 + AES-256-GCM | ❌ Server can read unencrypted files |
| **MITM Protection** | 🛡️ SAS Visual Emoji & 6-digit Code | ❌ None |
| **Integrity Check** | 🔍 SHA-256 verified per file | ⚠️ Often unverified |
| **Secret Notes / Text**| 📝 Direct E2EE sync | ❌ Not available |
| **Room PIN / Passcode**| 🔑 Optional zero-knowledge lock | ❌ Account login usually required |
| **Transfer Speed** | ⚡ Direct peer speed (LAN / P2P) | 🐢 Bottlenecked by cloud upload/download |

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Run local development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Build for production (Static Export)
```bash
npm run build
npm start
```

---

## ⚙️ Environment Variables (Optional)

| Variable | Description |
| :--- | :--- |
| `NEXT_PUBLIC_TURN_URL` | Optional custom TURN server for strict enterprise NAT traversal |
| `NEXT_PUBLIC_TURN_USERNAME` | TURN username |
| `NEXT_PUBLIC_TURN_CREDENTIAL` | TURN credential |

---

## 📄 License

MIT License. Designed and maintained by [rahulxdevv](https://github.com/rahulxdevv).


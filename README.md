# deepseek-harness-remote

> 🌐 **Language**: English · [中文](README.zh-CN.md)

**Use [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) from any device, anywhere.** Desktop and phone — with a mobile-optimized web UI and a native Android app (APK).

- ✅ **Desktop web access**: `http://127.0.0.1:3080` locally; remotely via Tailscale at `https://<machine>.<tailnet>.ts.net/`
- ✅ **Mobile web adaptation (mobile-fit)**: narrow screens automatically get the mobile layout (drawer navigation, session actions, input experience, full-screen settings, etc.)
- ✅ **APK (native Android shell)**: standalone app icon, zero-dependency WebView container — no browser needed
- ✅ **Remote configuration (optional proxy)**: edit models / plugins / permissions / API keys from the phone

> **Note**: this project **does not modify the dsh source** (a pure overlay). When upstream dsh changes, this project **adapts accordingly**.

## Screenshots

| Desktop web | Mobile APK |
| :---: | :---: |
| ![Desktop web](assets/web.jpg) | ![Mobile APK](assets/apk.jpg) |

## Quick start (from zero to remote control)

1. **On the PC** install Node.js (≥22) and make sure `npx @deepseek-ai/dsh web` starts;
2. **Start** dsh web (manual start or autostart — your choice);
3. **Phone access** (optional): Tailscale networking → `tailscale serve` → configure `trustedHosts`;
4. **Mobile UI** (optional): mount the mobile-fit plugin;
5. **APK & config unlock** (optional): install the APK; deploy the remote-config proxy if you want to edit configuration from the phone.

Every step ships with full commands, manual-vs-autostart choices, the token switch and **complete uninstall** steps — **see [docs/tutorial.md](docs/tutorial.md)**.

## Documentation map

| Document | Audience | Content |
|---|---|---|
| [docs/tutorial.md](docs/tutorial.md) · [中文](docs/tutorial.zh-CN.md) | **All users** | From zero to remote control: web + APK, manual/autostart, token switch, uninstall, FAQ |
| [docs/pitfalls.md](docs/pitfalls.md) · [中文](docs/pitfalls.zh-CN.md) | **Developers** | Pitfall log: root causes and fixes for every known issue |
| [docs/development.md](docs/development.md) · [中文](docs/development.zh-CN.md) | **Developers** | Project structure; mobile-fit / APK / proxy internals; tests; contributing |

## Security notes

- Only devices in the same tailnet can reach the service (Tailscale device identity = authentication);
- The dsh `/api` trust fence (`trustedHosts`) prevents DNS rebinding;
- Configuration/credential APIs stay pinned to loopback by default (upstream security design); deploying the remote-config proxy unlocks them on the phone (at your own risk — tutorial section 4);
- **Never** use `tailscale funnel` (it would expose the service to the public internet).

## License

[MIT](LICENSE)

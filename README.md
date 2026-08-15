# deepseek-harness-remote

> 🌐 **Language**: English · [中文](README.zh-CN.md)

**Use [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) from any device, anywhere.** Access your AI agent on desktop or phone — at home or remotely — with a mobile-optimized interface, plus a native Android app (APK, see [docs/apk.md](docs/apk.md)). Your agent, wherever you are.

- ✅ **Desktop web access**: `http://127.0.0.1:3080` locally; remotely via Tailscale at `https://<machine>.<tailnet>.ts.net/`
- ✅ **Mobile web adaptation (mobile-fit)**: same entry point; narrow screens automatically get the mobile layout (drawer navigation, session actions, input experience, full-screen settings, etc.)
- ✅ **APK (native Android shell)**: `apk/` directory, zero-dependency WebView container (usage: [docs/apk.md](docs/apk.md), dev: [apk/README.md](apk/README.md))
- ✅ **Remote configuration (optional proxy)**: edit models / plugins / permissions / API keys from the phone browser and the APK (deploy: [docs/remote-config.md](docs/remote-config.md))

> **Note**: this project **does not modify the dsh source** (a pure overlay). When upstream dsh changes, this project **adapts accordingly**.

## Screenshots

<!-- Drop your screenshots into assets/ then uncomment and adjust the
     filenames below:
![Desktop web](assets/web-desktop.png)
![Mobile / APK](assets/apk-mobile.png)
-->

## Getting remote control (overview)

1. Install Node.js and make sure `npx @deepseek-ai/dsh web` starts;
2. Start dsh web and verify at `http://127.0.0.1:3080` in a desktop browser;
3. (Optional, for phone access) Tailscale networking → `tailscale serve --bg 3080` → configure `trustedHosts`;
4. (Optional, for mobile UI) mount the mobile-fit plugin.

**Full step-by-step guide (from zero to working, including uninstall/rollback): [docs/tutorial.md](docs/tutorial.md).**

## Documentation map

| Document | Audience | Content |
|---|---|---|
| [docs/tutorial.md](docs/tutorial.md) · [中文](docs/tutorial.zh-CN.md) | **All users** | Complete guide from zero to phone-ready; manual start and autostart options; full uninstall/rollback |
| [docs/apk.md](docs/apk.md) · [中文](docs/apk.zh-CN.md) | **All users** | APK install & usage (first run, daily use, known limitations) |
| [docs/remote-config.md](docs/remote-config.md) · [中文](docs/remote-config.zh-CN.md) | **All users** | Remote config via proxy: principle, deploy, token gate, security boundary |
| [docs/pitfalls.md](docs/pitfalls.md) · [中文](docs/pitfalls.zh-CN.md) | **Developers / maintainers** (users can skip) | Pitfall log: root causes and fixes for every known issue |
| [mobile-fit/README.md](mobile-fit/README.md) · [中文](mobile-fit/README.zh-CN.md) | **Developers** | The mobile-fit plugin package: how it works, install, customization, known notes |
| [apk/README.md](apk/README.md) · [中文](apk/README.zh-CN.md) | **Developers** | The APK shell: build, install, debug, project layout |

## Security notes

- Only devices in the same tailnet can reach the service (Tailscale device identity = authentication);
- The dsh `/api` trust fence (`trustedHosts`) prevents DNS rebinding;
- Configuration/credential privileged APIs stay pinned to loopback by dsh (upstream security design); to edit config from the phone at your own risk, deploy the remote-config proxy ([docs/remote-config.md](docs/remote-config.md));
- **Never** use `tailscale funnel` (it would expose the service to the public internet).

## FAQ

| Symptom | Fix |
|---|---|
| Phone can't open the domain | Make sure the phone's Tailscale app is connected (VPN icon) and logged into the same account as the PC |
| Want to use an IP address | Not supported — use the domain name |
| Phone can't connect after reboot | Make sure Tailscale starts with Windows and `tailscale serve status` shows running |
| Page opens but some features return 403 | Config/credential pages (Models, plugin config, permissions, etc.) always return 403 remotely — that's dsh's upstream security design; open `http://127.0.0.1:<port>` on the machine running dsh instead. If basic features also 403, `trustedHosts` is not effective (see tutorial section 2). Want to edit config from the phone? Deploy the remote-config proxy ([docs/remote-config.md](docs/remote-config.md)) |
| The internal-testing notice pops up on every refresh | It stops after clicking "Continue" once (mobile-fit persists it locally); it reappears once after an upstream copy-version bump, which is expected |
| Page shows "Failed to load plugins" | mobile-fit is not active: verify the junction and patch line, then restart dsh (see tutorial section 3) |
| `tailscale` command not found | On Windows use the full path: `C:\Program Files\Tailscale\tailscale.exe` |
| A cmd.exe window appears at startup | It's the AMD graphics driver (`AMDRSServ.exe`), unrelated to this project; safe to close |

## Roadmap

- [x] Desktop web access (deployment + Tailscale + trust fence + optional autostart)
- [x] Mobile web adaptation (mobile-fit)
- [x] APK (native Android shell, `apk/`, usage: docs/apk.md)

## Contributing

Contributions are welcome! Feel free to open an [issue](https://github.com/joyfish666/deepseek-harness-remote/issues) or submit a [pull request](https://github.com/joyfish666/deepseek-harness-remote/pulls) — even the smallest problem report or fix is appreciated.

Before you start developing, please read the relevant docs first to avoid repeating known pitfalls:

- [docs/pitfalls.md](docs/pitfalls.md) — root causes and fixes for every known issue
- [docs/tutorial.md](docs/tutorial.md) — how the project is deployed and adapted
- [mobile-fit/README.md](mobile-fit/README.md) — how the mobile-fit plugin works

## License

[MIT](LICENSE)

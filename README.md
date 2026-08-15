# deepseek-harness-remote

> 🌐 **Language**: English · [中文](README.zh-CN.md)

Remote web access and mobile adaptation for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`): make the dsh Web UI usable on both desktop and phone.

- ✅ **Desktop web access**: `http://127.0.0.1:3080` locally; remotely via Tailscale at `https://<machine>.<tailnet>.ts.net/`
- ✅ **Mobile web adaptation (mobile-fit)**: same entry point; narrow screens automatically get the mobile layout (drawer navigation, session actions, input experience, full-screen settings, etc.)
- 🚧 **Next**: APK (native Android shell)

> **Note**: this project **does not modify the dsh source** (a pure overlay). When upstream dsh changes, this project **adapts accordingly**.

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
| [docs/pitfalls.md](docs/pitfalls.md) · [中文](docs/pitfalls.zh-CN.md) | **Developers / maintainers** (users can skip) | Pitfall log: root causes and fixes for every known issue |
| [mobile-fit/README.md](mobile-fit/README.md) · [中文](mobile-fit/README.zh-CN.md) | **Developers** | The mobile-fit plugin package: how it works, install, customization, known notes |

## Security notes

- Only devices in the same tailnet can reach the service (Tailscale device identity = authentication);
- The dsh `/api` trust fence (`trustedHosts`) prevents DNS rebinding;
- Configuration/credential privileged APIs stay pinned to loopback by dsh (upstream security design);
- **Never** use `tailscale funnel` (it would expose the service to the public internet).

## FAQ

| Symptom | Fix |
|---|---|
| Phone can't open the domain | Make sure the phone's Tailscale app is connected (VPN icon) and logged into the same account as the PC |
| Want to use an IP address | Not supported — use the domain name |
| Phone can't connect after reboot | Make sure Tailscale starts with Windows and `tailscale serve status` shows running |
| Page opens but some features return 403 | Config/credential pages (Models, plugin config, permissions, etc.) always return 403 remotely — that's dsh's upstream security design; open `http://127.0.0.1:<port>` on the machine running dsh instead. If basic features also 403, `trustedHosts` is not effective (see tutorial section 2) |
| The internal-testing notice pops up on every refresh | It stops after clicking "Continue" once (mobile-fit persists it locally); it reappears once after an upstream copy-version bump, which is expected |
| Page shows "Failed to load plugins" | mobile-fit is not active: verify the junction and patch line, then restart dsh (see tutorial section 3) |
| `tailscale` command not found | On Windows use the full path: `C:\Program Files\Tailscale\tailscale.exe` |
| A cmd.exe window appears at startup | It's the AMD graphics driver (`AMDRSServ.exe`), unrelated to this project; safe to close |

## Roadmap

- [x] Desktop web access (deployment + Tailscale + trust fence + optional autostart)
- [x] Mobile web adaptation (mobile-fit)
- [ ] APK (native Android shell)

## License

[MIT](LICENSE)

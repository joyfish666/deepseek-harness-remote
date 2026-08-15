// Simulate the native-shell gear button added by mobile-fit: when the page
// runs inside the dsh-remote Android shell, window.DshShell exists and the
// gear appears (calling DshShell.openSettings on tap); in a plain browser
// there is no bridge and no gear is created.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync("mobile-fit/lib/client.js", "utf8");

function mount(hasShell) {
  const listeners = new Map();
  const created = [];
  const bridge = { openSettingsCalls: 0, openSettings() { this.openSettingsCalls += 1 } };
  const sandbox = {
    Element: class FakeElement { matches() { return false } closest() { return null } blur() {} },
    HTMLTextAreaElement: class FakeTextarea extends class FakeElement { matches() { return false } closest() { return null } blur() {} } {},
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      addEventListener(name, fn) { listeners.set(name, fn) },
      createElement: () => {
        const el = {
          dataset: {}, style: {}, tagName: "button",
          setAttribute(n, v) { this[n] = v },
          addEventListener(n, fn) { this._listeners = this._listeners || {}; this._listeners[n] = fn },
          appendChild() {}, remove() {}, blur() {},
        };
        created.push(el);
        return el;
      },
      head: { appendChild() {} },
      body: {
        setAttribute() {}, removeAttribute() {},
        hasAttribute: () => false,
        appendChild() {}, addEventListener() {},
      },
    },
    MutationObserver: function () { return { observe() {}, disconnect() {} } },
    setTimeout: () => 0,
    Date: { now: () => 5000000 },
    JSON,
  };
  sandbox.window = {
    __ModuleLoader__: { load: (o) => { sandbox.__loaded = o } },
    matchMedia: () => ({ matches: true, addEventListener() {} }),
  };
  if (hasShell) sandbox.window.DshShell = bridge;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  const exportsObj = sandbox.__loaded.factory(() => { throw new Error("unexpected require") });
  if (typeof exportsObj.apply !== "function") throw new Error("bundle must export apply");
  return { created, bridge, listeners };
}

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures += 1;
}

// 1. Inside the shell: a gear button exists and opens native settings.
{
  const { created, bridge } = mount(true);
  const gear = created.find((el) => el.id === "mobile-fit-gear");
  check("gear is created inside the shell", gear !== undefined);
  if (gear) {
    gear._listeners.click();
    check("gear tap calls DshShell.openSettings", bridge.openSettingsCalls === 1);
  }
}

// 2. Plain browser: no bridge, no gear, nothing leaks.
{
  const { created } = mount(false);
  check("no gear in a plain browser", created.every((el) => el.id !== "mobile-fit-gear"));
}

if (failures > 0) {
  console.error(`FAILED: ${failures} scenario(s)`);
  process.exit(1);
}
console.log("OK: shell gear behaves as specified");

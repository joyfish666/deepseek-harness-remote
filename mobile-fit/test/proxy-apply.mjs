// Simulate mobile-fit's apply-time loopback override: behind the
// remote-config proxy (window.__DSH_PROXY__ injected by the proxy), the
// connection handle's isLoopback is flipped to true so settingsScope-bound
// surfaces (plugin config cards, model settings) bind host persistence
// instead of memory. Without the proxy flag, apply must be a no-op.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync("mobile-fit/lib/client.js", "utf8");

function mount(withProxyFlag) {
  const sandbox = {
    Element: class FakeElement {},
    HTMLTextAreaElement: class FakeTextarea extends class FakeElement {} {},
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
      createElement: () => ({ dataset: {}, style: {}, setAttribute() {}, addEventListener() {}, appendChild() {}, remove() {} }),
      head: { appendChild() {} },
      body: { setAttribute() {}, removeAttribute() {}, hasAttribute: () => false, appendChild() {}, addEventListener() {} },
    },
    MutationObserver: function () { return { observe() {}, disconnect() {} } },
    setTimeout: () => 0,
    Date: { now: () => 5000000 },
    JSON,
  };
  sandbox.window = {
    __ModuleLoader__: { load: (o) => { sandbox.__loaded = o } },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
  };
  if (withProxyFlag) sandbox.window.__DSH_PROXY__ = true;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.__loaded.factory(() => { throw new Error("unexpected require") });
}

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures += 1;
}

// 1. Behind the proxy: apply flips isLoopback before consumers bind.
{
  const exportsObj = mount(true);
  const connection = { isLoopback: false };
  const ctx = { get: (name) => (name === "connection" ? connection : undefined) };
  exportsObj.apply(ctx);
  check("proxy deployment: isLoopback flipped to true", connection.isLoopback === true);
}

// 2. Plain browser (no proxy flag): apply is a no-op.
{
  const exportsObj = mount(false);
  const connection = { isLoopback: false };
  const ctx = { get: (name) => (name === "connection" ? connection : undefined) };
  exportsObj.apply(ctx);
  check("no proxy: isLoopback untouched", connection.isLoopback === false);
}

// 3. Missing connection service must not throw.
{
  const exportsObj = mount(true);
  const ctx = { get: () => { throw new Error("service not found") } };
  exportsObj.apply(ctx);
  check("missing connection handled gracefully", true);
}

if (failures > 0) {
  console.error(`FAILED: ${failures} scenario(s)`);
  process.exit(1);
}
console.log("OK: proxy apply override behaves as specified");

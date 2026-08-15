// Verify mobile-fit client bundle exports a valid cordis plugin shape
// (function or object with an apply method), by simulating the browser-side
// __ModuleLoader__ materialization exactly as the app shell does.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync("mobile-fit/lib/client.js", "utf8");
let loaded = null;

const sandbox = {
  window: {},
  document: {
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => ({
      dataset: {},
      style: {},
      setAttribute() {},
      addEventListener() {},
      appendChild() {},
      remove() {},
    }),
    head: { appendChild() {} },
    body: {
      setAttribute() {},
      removeAttribute() {},
      hasAttribute: () => false,
      appendChild() {},
      addEventListener() {},
    },
  },
  MutationObserver: function () {
    return { observe() {}, disconnect() {} };
  },
  JSON,
};
sandbox.window.__ModuleLoader__ = {
  load: (o) => { loaded = o; },
};
sandbox.window.matchMedia = () => ({ matches: false, addEventListener() {} });
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

if (!loaded) throw new Error("bundle did not call window.__ModuleLoader__.load");
if (typeof loaded.factory !== "function") throw new Error("bundle factory is not a function");
console.log("load id:", loaded.id);
console.log("load has factory:", typeof loaded.factory);

const module = { exports: {} };
const requireShim = () => { throw new Error("unexpected require call"); };
const exportsObj = loaded.factory(requireShim);

const isApplicable = (o) => o && typeof o === "object" && typeof o.apply === "function";
const valid = typeof exportsObj === "function" || isApplicable(exportsObj);
console.log("plugin shape valid:", valid);
console.log("exports keys:", Object.keys(exportsObj));
console.log("exports.apply type:", typeof exportsObj.apply);
console.log("exports.inject:", JSON.stringify(exportsObj.inject));
if (!valid) process.exit(1);
if (!Array.isArray(exportsObj.inject)) throw new Error("bundle must export an inject list (official client bundle shape)");
console.log("OK: browser-side cordis will accept this plugin");

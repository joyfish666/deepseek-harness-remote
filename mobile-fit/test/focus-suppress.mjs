// Simulate the scripted-composer-focus suppression added by mobile-fit:
// session switch focuses the composer by script (upstream unlock effect),
// which raises the keyboard on phones. A trusted focus (real tap on the
// box) must pass; a scripted one must be refused, except right after a
// touch inside the composer dock (send-button keep-focus refocus).
// The bundle is materialized exactly as the browser shell does (see
// bundle-shape.mjs), then the registered listeners are driven with fake
// events whose targets carry controllable matches()/closest() results.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync("mobile-fit/lib/client.js", "utf8");

// ── Fake DOM classes with instanceof chains ─────────────────────────────
class FakeElement {
  matches() { return this.matchesResult ?? false }
  closest() { return this.closestResult ?? null }
  blur() { this.blurred = true }
}
class FakeTextarea extends FakeElement {}

// ── Sandbox: capture listeners, control mq, timers and the clock ────────
let mqMatches = true;
let fakeNow = 5000000; // far from 0 so "no dock touch yet" is always stale
const listeners = new Map();
const created = [];

const sandbox = {
  Element: FakeElement,
  HTMLTextAreaElement: FakeTextarea,
  document: {
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener(name, fn) { listeners.set(name, fn) },
    createElement: (tag) => {
      const el = { dataset: {}, style: {}, tagName: tag, setAttribute() {}, addEventListener() {}, appendChild() {}, remove() {} };
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
  Date: { now: () => fakeNow },
  JSON,
};
sandbox.window = {
  __ModuleLoader__: { load: (o) => { sandbox.__loaded = o } },
  matchMedia: () => ({ get matches() { return mqMatches }, addEventListener() {} }),
};

vm.createContext(sandbox);
vm.runInContext(code, sandbox);

if (!sandbox.__loaded) throw new Error("bundle did not call window.__ModuleLoader__.load");
const exportsObj = sandbox.__loaded.factory(() => { throw new Error("unexpected require") });
if (typeof exportsObj.apply !== "function") throw new Error("bundle must export apply");

const focusin = listeners.get("focusin");
const pointerdown = listeners.get("pointerdown");
if (typeof focusin !== "function" || typeof pointerdown !== "function") {
  throw new Error("focusin/pointerdown listeners not registered");
}

// ── Scenario helpers ────────────────────────────────────────────────────
function composerTarget({ trusted, inDock = false, matchesInput = true }) {
  const t = new FakeTextarea();
  t.matchesResult = matchesInput;
  t.closestResult = inDock ? {} : null;
  return t;
}
function runFocusin(target, trusted) {
  const event = { isTrusted: trusted, target, preventDefault() { this.prevented = true } };
  focusin(event);
  return { target, event };
}

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures += 1;
}

// 1. Scripted focus after picking a session (tap elsewhere): refused.
mqMatches = true;
{
  const { target: t, event: ev } = runFocusin(composerTarget({ trusted: false }), false);
  check("scripted focus (session switch) is blurred", t.blurred === true);
  check("scripted focus is preventDefault'ed", ev.prevented === true);
}

// 2. Trusted focus: a real tap on the box passes through untouched.
{
  const { target: t, event: ev } = runFocusin(composerTarget({ trusted: true }), true);
  check("trusted focus (real tap) is kept", t.blurred !== true);
  check("trusted focus not preventDefault'ed", ev.prevented !== true);
}

// 3. Scripted focus right after a dock touch (send-button keep-focus): kept.
{
  const t = composerTarget({ trusted: false });
  const dockTarget = new FakeElement();
  dockTarget.closestResult = {};
  pointerdown({ target: dockTarget });
  runFocusin(t, false);
  check("dock-gesture refocus is kept", t.blurred !== true);
}

// 4. A scripted focus after a NON-dock touch is still refused — even when a
// dock touch happened earlier but not within the 600ms grace window.
{
  const t = composerTarget({ trusted: false });
  const rowTarget = new FakeElement();
  rowTarget.closestResult = null;
  pointerdown({ target: rowTarget });
  fakeNow += 1000; // the earlier dock touch is now stale
  runFocusin(t, false);
  check("non-dock gesture does not rescue scripted focus", t.blurred === true);
}

// 5. Non-composer textareas (rename dialogs etc.) are never touched.
{
  const t = runFocusin(composerTarget({ trusted: false, matchesInput: false }), false);
  check("other textareas are untouched", t.blurred !== true);
}

// 6. Desktop (mq not matched): suppression is inert.
mqMatches = false;
{
  const t = runFocusin(composerTarget({ trusted: false }), false);
  check("desktop scripted focus is kept", t.blurred !== true);
}

if (failures > 0) {
  console.error(`FAILED: ${failures} scenario(s)`);
  process.exit(1);
}
console.log("OK: focus suppression behaves as specified");

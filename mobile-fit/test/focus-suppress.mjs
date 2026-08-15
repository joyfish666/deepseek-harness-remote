// Simulate the composer-focus suppression added by mobile-fit: session
// switch focuses the composer by script (upstream unlock effect), which
// raises the keyboard on phones. isTrusted is useless — the UA fires
// focus/focusin as trusted even for script focus() — so the suppression
// keys on the pointer that precedes the focus: a pointerdown inside the
// composer dock is typing intent (allowed), anything else is not (refused).
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

const sandbox = {
  Element: FakeElement,
  HTMLTextAreaElement: FakeTextarea,
  document: {
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener(name, fn) { listeners.set(name, fn) },
    createElement: (tag) => ({
      dataset: {}, style: {}, tagName: tag, setAttribute() {}, addEventListener() {}, appendChild() {}, remove() {},
    }),
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
function composerTarget({ inCard = false, inDock = false, matchesInput = true } = {}) {
  const t = new FakeTextarea();
  t.matchesResult = matchesInput;
  // Upstream renders the dock slot as the card's footer CHILD: the
  // textarea's ancestor chain holds the card but never the dock slot.
  t.closestResult = inCard ? { card: true } : inDock ? { dock: true } : null;
  return t;
}
function fireFocusin(target) {
  const event = { target, preventDefault() { this.prevented = true } };
  focusin(event);
  return { target, event };
}
function firePointerdown(target) {
  pointerdown({ target });
}

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures += 1;
}

// 1. No pointer at all (app start / onboarding): refused.
{
  const { target: t, event: ev } = fireFocusin(composerTarget());
  check("focus with no prior pointer is refused", t.blurred === true);
  check("refused focus is preventDefault'ed", ev.prevented === true);
}

// 2. Focus after a NON-dock pointer (session row tap): refused.
{
  const row = new FakeElement();
  row.closestResult = null;
  firePointerdown(row);
  const { target: t } = fireFocusin(composerTarget());
  check("session-row tap does not rescue focus", t.blurred === true);
}

// 3. Focus after a dock pointer (real tap on the box): kept.
{
  firePointerdown(composerTarget({ inDock: true }));
  const { target: t } = fireFocusin(composerTarget());
  check("dock tap (typing intent) is kept", t.blurred !== true);
}

// 3b. Tap DIRECTLY on the textarea whose dock ancestor lookup fails
// (the dock slot is the card's footer sibling, never an ancestor —
// the actual upstream layout): still typing intent.
{
  const ta = new FakeTextarea();
  ta.matchesResult = true;
  ta.closestResult = null; // not inside [data-slot=...composer.dock]
  firePointerdown(ta);
  const { target: t } = fireFocusin(composerTarget());
  check("textarea self-tap survives dock mismatch", t.blurred !== true);
}

// 3c. Tap inside the composer CARD (send/tool buttons): typing intent,
// so the keep-focus refocus that follows the mousedown is kept.
{
  const button = new FakeElement();
  button.closestResult = { card: true }; // inside [data-composer-card]
  firePointerdown(button);
  const { target: t } = fireFocusin(composerTarget());
  check("card tap (send keep-focus) is kept", t.blurred !== true);
}

// 4. Scripted refocus within the 1000ms grace (send-button keep-focus): kept.
{
  firePointerdown(composerTarget({ inDock: true }));
  const { target: t } = fireFocusin(composerTarget());
  check("dock-gesture refocus within 1000ms is kept", t.blurred !== true);
}

// 4b. Dock pointer just inside the window (<1000ms) still rescues.
{
  fakeNow += 800; // 800ms after the touch above — still within grace
  const { target: t } = fireFocusin(composerTarget());
  check("dock pointer at 800ms still rescues focus", t.blurred !== true);
}

// 5. Focus with a STALE dock pointer (>1000ms): refused again.
{
  fakeNow += 1500; // the dock touch above is now stale
  const { target: t } = fireFocusin(composerTarget());
  check("stale dock pointer does not rescue focus", t.blurred === true);
}

// 6. Non-composer textareas (rename dialogs etc.) are never touched.
{
  const { target: t } = fireFocusin(composerTarget({ matchesInput: false }));
  check("other textareas are untouched", t.blurred !== true);
}

// 7. Desktop (mq not matched): suppression is inert.
mqMatches = false;
{
  const { target: t } = fireFocusin(composerTarget());
  check("desktop focus is kept", t.blurred !== true);
}

if (failures > 0) {
  console.error(`FAILED: ${failures} scenario(s)`);
  process.exit(1);
}
console.log("OK: focus suppression behaves as specified");

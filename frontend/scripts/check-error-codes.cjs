/*
 * Checks the error-code contract between the backend and the UI catalogue.
 *
 * Run: node scripts/check-error-codes.cjs   (from frontend/)
 * Exits non-zero on any problem, so it can gate a commit or CI.
 *
 * Every backend error response carries a stable `code`, and the UI translates on
 * that code rather than on the wording - which is what lets the server reword a
 * message without breaking the UI, and lets the UI speak Spanish while the
 * server only speaks English.
 *
 * Three things can go wrong, and all three are silent at runtime:
 *
 *  1. A code with no catalogue entry. The user sees the untranslated English.
 *  2. A catalogue entry no code emits. Dead weight, and usually a rename.
 *  3. TWO DIFFERENT FAILURES SHARING A CODE. This one is the nastiest: an
 *     unmatched route and a missing database row were both `NOT_FOUND`, so
 *     hitting an endpoint the server did not have rendered as "that record does
 *     not exist" and sent whoever was debugging to the wrong layer entirely.
 */
const fs = require("fs");
const path = require("path");

const BACKEND = path.join(__dirname, "..", "..", "backend", "src");
const CATALOGUE = path.join(__dirname, "..", "src", "i18n", "translations.ts");

/*
 * Validation responses deliberately have NO catalogue entry. Their `message` is
 * field-specific ("The end date must be after the start date"), and a generic
 * translated line would be less useful than the untranslated detail, so the
 * client falls through to the server's own text for these.
 */
const INTENTIONAL_FALLTHROUGH = new Set([
  "VALIDATION_ERROR",
  "INVALID_INPUT",
  "INVALID_TASK",
  "INVALID_COMMENT",
  "INVALID_MESSAGE",
  "INVALID_STATE",
  "INVALID_STATUS_CHANGE",
  "INVALID_NEW_PASSWORD",
]);

/** Produced client-side only, never sent by the backend. */
const CLIENT_ONLY = new Set(["SESSION_EXPIRED", "UNKNOWN"]);

const emitted = new Set();
/** code -> set of the distinct messages it is emitted with. */
const messagesFor = new Map();

function note(code, message) {
  emitted.add(code);
  if (!messagesFor.has(code)) messagesFor.set(code, new Set());
  if (message) messagesFor.get(code).add(message.trim());
}

(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith(".ts")) {
      const src = fs.readFileSync(full, "utf8").replace(/\r\n/g, "\n");

      // Domain errors carry their code as the first constructor argument.
      for (const m of src.matchAll(/new WorkingTaskError\(\s*"([A-Z][A-Z0-9_]*)"/g)) {
        note(m[1], null);
      }

      // `code: "X"` and the ternary form `code: cond ? "A" : "B"`, each followed
      // by the message literal on the same or the next couple of lines.
      for (const m of src.matchAll(
        /\bcode:([^,\n]*(?:\n[^,\n]*)?)(?:,\s*)?(?:message:\s*\n?\s*"((?:[^"\\]|\\.)*)")?/g
      )) {
        const codes = [...m[1].matchAll(/"([A-Z][A-Z0-9_]*)"/g)].map((c) => c[1]);
        for (const code of codes) note(code, codes.length === 1 ? m[2] : null);
      }
    }
  }
})(BACKEND);

const catalogue = new Set();
const cat = fs.readFileSync(CATALOGUE, "utf8");
for (const m of cat.matchAll(/"error\.([A-Z][A-Z0-9_]*)"/g)) catalogue.add(m[1]);

const missing = [...emitted].filter(
  (c) => !catalogue.has(c) && !INTENTIONAL_FALLTHROUGH.has(c)
);
const unused = [...catalogue].filter((c) => !emitted.has(c) && !CLIENT_ONLY.has(c));
const collisions = [...messagesFor.entries()].filter(([, msgs]) => msgs.size > 1);

console.log(`backend emits          : ${emitted.size} codes`);
console.log(`catalogue covers       : ${catalogue.size} codes`);
console.log(
  `deliberate fallthrough : ${[...emitted].filter((c) => INTENTIONAL_FALLTHROUGH.has(c)).length}`
);

let failed = false;

if (missing.length) {
  failed = true;
  console.log(`\nMISSING CATALOGUE KEYS: ${missing.join(", ")}`);
}
if (unused.length) {
  failed = true;
  console.log(`UNUSED CATALOGUE KEYS : ${unused.join(", ")}`);
}
if (collisions.length) {
  failed = true;
  console.log("\nONE CODE, SEVERAL MEANINGS - the client can only translate it one way:");
  for (const [code, msgs] of collisions) {
    console.log(`  ${code}`);
    for (const msg of msgs) console.log(`    - "${msg}"`);
  }
}

if (!failed) console.log("\ncontract ok");
process.exit(failed ? 1 : 0);

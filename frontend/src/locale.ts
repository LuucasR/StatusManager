/**
 * Locale used to format every date the UI renders.
 *
 * en-GB, not en-US, on purpose: it keeps DD/MM/YYYY, which is the ordering the
 * team already reads. Switching to en-US would silently turn 03/08 from
 * "3 August" into "March 8th" — the same digits meaning a different day.
 * Translating the language must not change the data.
 *
 * Kept in sync with backend/src/locale.ts so the screen and the PDF of the same
 * report never disagree.
 */
export const LOCALE = "en-GB";

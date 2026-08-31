/**
 * Locale used to format every date the backend renders (PDF reports, period
 * labels).
 *
 * en-GB, not en-US, on purpose: it keeps DD/MM/YYYY, which is the ordering the
 * team already reads. Switching to en-US would silently turn 03/08 from
 * "3 August" into "March 8th" — the same digits meaning a different day, on
 * reports people use to account for their time. Translating the language must
 * not change the data.
 */
export const LOCALE = "en-GB";

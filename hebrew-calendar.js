/**
 * hebrew-calendar.js
 *
 * Browser-ready Hebrew calendar helpers built on the JS engine's built-in
 * Hebrew calendar support (Intl.DateTimeFormat with calendar "hebrew").
 * No external dependencies. Requires full ICU data, which all modern
 * browsers ship with.
 *
 * Exposes a single global: window.HebrewCalendar
 */
(function (root, factory) {
  const mod = factory();
  if (typeof window !== 'undefined') {
    window.HebrewCalendar = mod;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  }
})(this, function () {
  'use strict';

  const EN_FORMATTER = new Intl.DateTimeFormat('en-u-ca-hebrew', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const HE_FORMATTER = new Intl.DateTimeFormat('he-u-ca-hebrew', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const WEEKDAY_GREG_FORMATTER = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const SHORT_GREG_FORMATTER = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // ---- Gregorian <-> Hebrew part extraction ----

  function partsFromParts(parts) {
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    return {
      year: parseInt(map.year, 10),
      month: map.month,
      day: parseInt(map.day, 10),
    };
  }

  /** English Hebrew-calendar parts, e.g. { year: 5750, month: "Sivan", day: 22 } */
  function getHebrewParts(date) {
    return partsFromParts(EN_FORMATTER.formatToParts(date));
  }

  /** Hebrew-script Hebrew-calendar parts, e.g. { year: 5750, month: "סיוון", day: 22 } */
  function getHebrewPartsHe(date) {
    return partsFromParts(HE_FORMATTER.formatToParts(date));
  }

  // ---- Gematria (Hebrew numeral) conversion ----

  const LETTER_VALUES = [
    [400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'],
    [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'],
    [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'],
    [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'],
    [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א'],
  ];
  const FINAL_FORMS = { 'כ': 'ך', 'מ': 'ם', 'נ': 'ן', 'פ': 'ף', 'צ': 'ץ' };
  const GERESH = '\u05F3';
  const GERSHAYIM = '\u05F4';

  function lettersFor(num, table) {
    let out = '';
    let n = num;
    for (const [value, letter] of table) {
      while (n >= value) {
        out += letter;
        n -= value;
      }
    }
    return out;
  }

  /**
   * Convert a positive integer into a Hebrew numeral (gematria) string,
   * with the 15/16 exception (ט״ו / ט״ז) and proper geresh/gershayim.
   * @param {boolean} [useFinalForms] - use final letter forms (ך ם ן ף ץ)
   *   when they land at the end of the word — conventional for Hebrew
   *   year numbers, not typically used for day-of-month numbers.
   */
  function toHebrewNumeral(num, useFinalForms) {
    if (!num || num <= 0) return '';
    const hundreds = num - (num % 100);
    const remainder = num % 100;

    const hundredsStr = lettersFor(hundreds, LETTER_VALUES.filter(([v]) => v >= 100));

    let remainderStr;
    if (remainder === 15) remainderStr = 'טו';
    else if (remainder === 16) remainderStr = 'טז';
    else remainderStr = lettersFor(remainder, LETTER_VALUES.filter(([v]) => v < 100));

    let full = hundredsStr + remainderStr;

    if (useFinalForms && full.length > 0) {
      const last = full[full.length - 1];
      if (FINAL_FORMS[last]) full = full.slice(0, -1) + FINAL_FORMS[last];
    }

    if (full.length === 1) return full + GERESH;
    return full.slice(0, -1) + GERSHAYIM + full.slice(-1);
  }

  /** Full Hebrew-script gematria rendering of a date, e.g. "כ״ב בסיוון תש״ן" */
  function formatGematriyaDate(date) {
    const he = getHebrewPartsHe(date);
    const dayStr = toHebrewNumeral(he.day, false);
    const yearStr = toHebrewNumeral(he.year % 1000, true);
    return `${dayStr} ב${he.month} ${yearStr}`;
  }

  // ---- Adar-aware month matching (for finding upcoming birthdays) ----

  function normalizeMonth(monthName) {
    if (monthName === 'Adar I') return { base: 'Adar', adarType: 'I' };
    if (monthName === 'Adar II') return { base: 'Adar', adarType: 'II' };
    if (monthName === 'Adar') return { base: 'Adar', adarType: 'regular' };
    return { base: monthName, adarType: null };
  }

  function monthMatches(candidateMonth, birthNorm, adarIConvention) {
    if (birthNorm.adarType === null) return candidateMonth === birthNorm.base;
    if (birthNorm.adarType === 'regular') {
      return adarIConvention
        ? candidateMonth === 'Adar' || candidateMonth === 'Adar I'
        : candidateMonth === 'Adar' || candidateMonth === 'Adar II';
    }
    const specific = birthNorm.adarType === 'I' ? 'Adar I' : 'Adar II';
    return candidateMonth === specific || candidateMonth === 'Adar';
  }

  /**
   * Find the next upcoming Hebrew-calendar birthday (as a Gregorian date)
   * for a given Gregorian date of birth.
   * @param {Date} birthDate
   * @param {object} [options]
   * @param {Date} [options.from] - search starting point (default: today)
   * @param {boolean} [options.adarIConvention] - see module docs
   * @param {number} [options.searchDays] - search window (default: 400)
   */
  function getUpcomingHebrewBirthday(birthDate, options = {}) {
    const { from = new Date(), adarIConvention = false, searchDays = 400 } = options;

    const birthHebrew = getHebrewParts(birthDate);
    const birthNorm = normalizeMonth(birthHebrew.month);
    const birthDay = birthHebrew.day;

    const start = new Date(from);
    start.setHours(0, 0, 0, 0);

    let fallbackRoshChodesh = null;

    for (let i = 0; i < searchDays; i++) {
      const candidate = new Date(start);
      candidate.setDate(candidate.getDate() + i);
      const hDate = getHebrewParts(candidate);

      if (monthMatches(hDate.month, birthNorm, adarIConvention)) {
        if (hDate.day === birthDay) {
          return { gregorianDate: candidate, hebrewDate: hDate };
        }
        if (birthDay === 30 && hDate.day === 1 && fallbackRoshChodesh === null) {
          fallbackRoshChodesh = { gregorianDate: candidate, hebrewDate: hDate };
        }
      }
    }

    if (birthDay === 30 && fallbackRoshChodesh) return fallbackRoshChodesh;

    throw new Error('Could not find an upcoming Hebrew birthday within the search window.');
  }

  return {
    getHebrewParts,
    getHebrewPartsHe,
    toHebrewNumeral,
    formatGematriyaDate,
    getUpcomingHebrewBirthday,
    weekdayGregFormatter: WEEKDAY_GREG_FORMATTER,
    shortGregFormatter: SHORT_GREG_FORMATTER,
  };
});

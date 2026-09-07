/*
 * Self-contained Hebrew <-> Gregorian calendar conversion.
 *
 * Implements the traditional arithmetic (Metonic 19-year cycle) Hebrew
 * calendar: the molad (mean new moon) calculation and the four Rosh
 * Hashanah postponement rules (dechiyot). No external library or network
 * call is used - every value below is derived from the fixed constants
 * of the calendar itself.
 *
 * Reference constants (chalakim = "parts", 1080 per hour, 25920 per day;
 * mean lunation = 29d 12h 793p; molad tohu = 2d 5h 204p) are the same
 * ones published in the Mishneh Torah's rules for calendar calculation
 * and used by every standard implementation of this calendar.
 */
const HebrewCalendar = (function () {
  'use strict';

  // A "chelek" (plural "chalakim", i.e. "part") is the calendar's smallest
  // unit of time: 1/1080 of an hour (3 1/3 seconds). Using integer chalakim
  // instead of fractional hours/minutes keeps every calculation below in
  // exact integer arithmetic - no floating-point rounding error is possible.
  const CHALAKIM_PER_DAY = 25920; // 24 hours * 1080 chalakim/hour

  // The mean lunation (average time from one new moon to the next) is
  // defined as exactly 29 days, 12 hours, 793 parts.
  // In chalakim: 29*25920 + 12*1080 + 793 = 765433.
  const CHALAKIM_PER_MONTH = 765433;

  // "Molad Tohu" ("the mean new moon of chaos") is the calendar's fixed
  // starting point: a theoretical molad, 2 days 5 hours 204 parts into the
  // week, that precedes the calendar's year 1. Every later molad is found
  // by adding whole mean-lunations to this one value - so this single
  // number is the seed for the entire calendar.
  // In chalakim: (2-1)*25920 + 5*1080 + 204 = 31524.
  const CHALAKIM_MOLAD_TOHU = 31524;

  // JEWISH_EPOCH converts the Hebrew calendar's internal day-count (which
  // starts counting from molad tohu) onto the same absolute-day number
  // line used by gregorianToAbsDate() below, so the two calendars can be
  // compared/added directly. It has no meaning on its own; it only makes
  // sense paired with the exact Gregorian absolute-day formula used here.
  const JEWISH_EPOCH = -1373428;

  // Standard month numbers. Nisan is month 1 for reckoning "month of the
  // year" (this is what most people mean by "the first month" religiously),
  // but the calendar YEAR itself begins later, at Tishrei (month 7) - see
  // monthOrder() below. ADAR is month 12 in every year; in a leap year it
  // splits into Adar I (still numbered 12) plus an extra Adar II (13).
  const NISAN = 1, IYYAR = 2, SIVAN = 3, TAMUZ = 4, AV = 5, ELUL = 6,
    TISHREI = 7, CHESHVAN = 8, KISLEV = 9, TEVET = 10, SHEVAT = 11,
    ADAR = 12, ADAR_II = 13;

  // English transliterations, keyed by month number, for display.
  // ADAR (12) is handled specially in monthName() because its name depends
  // on whether the year is a leap year ("Adar" vs "Adar I").
  const MONTH_NAMES = {
    [NISAN]: 'Nisan', [IYYAR]: 'Iyyar', [SIVAN]: 'Sivan', [TAMUZ]: 'Tamuz',
    [AV]: 'Av', [ELUL]: 'Elul', [TISHREI]: 'Tishrei', [CHESHVAN]: 'Cheshvan',
    [KISLEV]: 'Kislev', [TEVET]: 'Tevet', [SHEVAT]: "Sh'vat", [ADAR_II]: 'Adar II'
  };

  // Hebrew-script month names (no vowel points/nikud), for the gematriya line.
  const MONTH_NAMES_HE = {
    [NISAN]: 'ניסן', [IYYAR]: 'אייר', [SIVAN]: 'סיון', [TAMUZ]: 'תמוז',
    [AV]: 'אב', [ELUL]: 'אלול', [TISHREI]: 'תשרי', [CHESHVAN]: 'חשון',
    [KISLEV]: 'כסלו', [TEVET]: 'טבת', [SHEVAT]: 'שבט', [ADAR_II]: 'אדר ב׳'
  };

  // The Hebrew calendar keeps the sun and moon in sync using a 19-year
  // cycle in which 7 of the 19 years are "leap years" that get a 13th
  // month. This formula (equivalent to checking whether `year` is one of
  // the 7 leap positions in its 19-year cycle) is the standard closed-form
  // test: expand it and you'll find it's true for exactly 7 out of every
  // 19 consecutive integers.
  function isLeapYear(year) {
    return ((7 * year + 1) % 19) < 7;
  }

  // A leap year has 13 months (the extra Adar II); a regular year has 12.
  function monthsInYear(year) {
    return isLeapYear(year) ? 13 : 12;
  }

  // English name for a given month number, aware of the Adar/Adar I split.
  function monthName(year, month) {
    if (month === ADAR) return isLeapYear(year) ? 'Adar I' : 'Adar';
    return MONTH_NAMES[month];
  }

  // Hebrew-script name for a given month number, same Adar handling as above.
  function monthNameHebrew(year, month) {
    if (month === ADAR) return isLeapYear(year) ? 'אדר א׳' : 'אדר';
    return MONTH_NAMES_HE[month];
  }

  // How many whole months have passed between "1 Tishrei of year 1" and
  // "1 Tishrei of `year`"? We need this so we can find the molad (new
  // moon) of any year's Tishrei by adding that many mean-lunations to
  // molad tohu.
  //
  // Every full 19-year cycle contains 235 months (12 regular years * 12
  // months + 7 leap years * 13 months = 144 + 91 = 235). So we split the
  // years-elapsed count into whole cycles, plus a remainder `r` of 0-18
  // years into the current cycle, then add 12 months per remainder year
  // plus 1 extra month for each leap year already passed within that
  // remainder (the `(7*r + 1) / 19` term counts exactly that, using the
  // same closed-form trick as isLeapYear).
  function elapsedMonths(year) {
    const y = year - 1; // number of full years before `year`
    const cycle = Math.floor(y / 19); // number of complete 19-year cycles
    const r = y % 19; // remaining years into the current cycle
    return 235 * cycle + 12 * r + Math.floor((7 * r + 1) / 19);
  }

  // The molad (mean new moon) of Tishrei of `year`, in chalakim, measured
  // from the same zero-point as molad tohu: just add one mean lunation
  // for every month that has elapsed since year 1.
  function moladChalakim(year) {
    return CHALAKIM_MOLAD_TOHU + CHALAKIM_PER_MONTH * elapsedMonths(year);
  }

  // Rosh Hashanah (1 Tishrei) does not always fall on the day of the molad
  // itself - four traditional postponement rules ("dechiyot") can push it
  // forward by a day or two, chiefly so that Yom Kippur never lands next
  // to Shabbat and the year's total length stays within allowed bounds.
  // This returns the day index (still relative to molad tohu's own day
  // axis - the JEWISH_EPOCH offset is added later) of 1 Tishrei of `year`.
  function elapsedDays(year) {
    const chalakim = moladChalakim(year);

    // Split the molad instant into a whole-day count and a time-of-day
    // remainder (both still in chalakim).
    let day = Math.floor(chalakim / CHALAKIM_PER_DAY);
    const parts = chalakim - day * CHALAKIM_PER_DAY;

    // Day-of-week of the raw (un-postponed) molad: 0 = Sunday .. 6 = Saturday.
    const dow = day % 7;

    // Rule 1 - "Molad Zaken" (an "old"/late molad): if the molad falls at
    // or after noon (18 hours after the Hebrew day's start at the
    // previous evening = 19440 chalakim), the new moon won't be visible
    // until the following day, so Rosh Hashanah is postponed by one day.
    const moladZaken = parts >= 19440;

    // Rule 2 - "GaTaRaD": in a plain (non-leap) year, if the molad falls
    // on a Tuesday at/after 9h204p (9924 chalakim), postponing by a day
    // keeps the following year from becoming too long. Named for the
    // Hebrew letters representing 3 (Tuesday), 9, 204.
    const gatarad = dow === 2 && parts >= 9924 && !isLeapYear(year);

    // Rule 3 - "BeTuTaKPaT": if the PREVIOUS year was a leap year and this
    // molad falls on a Monday at/after 15h589p (16789 chalakim), postpone
    // by a day for the same reason (keeps year lengths valid).
    const betutakpot = dow === 1 && parts >= 16789 && isLeapYear(year - 1);

    if (moladZaken || gatarad || betutakpot) {
      day += 1;
    }

    // Rule 4 - "Lo ADU Rosh": Rosh Hashanah itself is never allowed to
    // fall on Sunday, Wednesday, or Friday (this keeps Yom Kippur off
    // Friday/Sunday and Hoshana Rabbah off Shabbat). If rules 1-3 above
    // landed us on one of those days, push forward one more day.
    const dow2 = day % 7;
    if (dow2 === 0 || dow2 === 3 || dow2 === 5) {
      day += 1;
    }

    return day;
  }

  // A Hebrew year's total length (353-385 days depending on leap/non-leap
  // and on Cheshvan/Kislev's variable lengths, see below) is simply the
  // gap between one Rosh Hashanah and the next.
  function daysInYear(year) {
    return elapsedDays(year + 1) - elapsedDays(year);
  }

  // Every month has a fixed length except Cheshvan and Kislev, which vary
  // so the year's total length can be adjusted to one of six valid values
  // (353/354/355 regular, 383/384/385 leap). Rather than tracking that
  // directly, we derive it from the year's total length: years whose
  // length ends in 5 (355 or 385) have a "long" 30-day Cheshvan; years
  // whose length ends in 3 (353 or 383) have a "short" 29-day Kislev.
  function isCheshvanLong(year) {
    return daysInYear(year) % 10 === 5;
  }

  function isKislevShort(year) {
    return daysInYear(year) % 10 === 3;
  }

  // Day count for a given month of a given year.
  function daysInMonth(year, month) {
    if (
      month === IYYAR || month === TAMUZ || month === ELUL || // always 29
      (month === CHESHVAN && !isCheshvanLong(year)) ||         // 29 unless "long" this year
      (month === KISLEV && isKislevShort(year)) ||              // 29 if "short" this year
      month === TEVET ||                                        // always 29
      (month === ADAR && !isLeapYear(year)) ||                  // Adar is 29 in a regular year...
      month === ADAR_II                                         // ...and Adar II (leap only) is always 29
    ) {
      return 29;
    }
    return 30; // Nisan, Sivan, Av, Tishrei, Shevat, and Adar I (leap year) are always 30
  }

  // The calendar YEAR starts at Tishrei (not Nisan), so the chronological
  // order of months within one Hebrew year is Tishrei..Adar(/Adar I, Adar
  // II), then Nisan..Elul. We need this order to add up "days since the
  // start of the year" for any given date.
  function monthOrder(year) {
    const order = [TISHREI, CHESHVAN, KISLEV, TEVET, SHEVAT, ADAR];
    if (isLeapYear(year)) order.push(ADAR_II); // only exists in leap years
    order.push(NISAN, IYYAR, SIVAN, TAMUZ, AV, ELUL);
    return order;
  }

  // Sum the length of every month before `month` in this year's
  // chronological order, then add the day-of-month (minus 1, since day 1
  // itself contributes 0 elapsed days).
  function daysSinceStartOfYear(year, month, day) {
    let total = 0;
    for (const m of monthOrder(year)) {
      if (m === month) break;
      total += daysInMonth(year, m);
    }
    return total + (day - 1);
  }

  // Convert a Hebrew (year, month, day) into an absolute day number on the
  // same number line as gregorianToAbsDate() below: how far into the year
  // we are, plus where that year's Rosh Hashanah sits, plus the epoch
  // offset that aligns the two calendars' day-numbering.
  function hebrewToAbsDate(year, month, day) {
    return daysSinceStartOfYear(year, month, day) + elapsedDays(year) + JEWISH_EPOCH;
  }

  // Convert an absolute day number back into a Hebrew (year, month, day).
  function absDateToHebrew(absDate) {
    // Start with a deliberately-low estimate of the year (a Hebrew year
    // is at most 385 days, so dividing by 365 and subtracting a small
    // buffer guarantees we start at or before the true year)...
    let year = Math.floor((absDate - JEWISH_EPOCH) / 365) - 2;
    // ...then walk forward until the next year's Rosh Hashanah would
    // already be past absDate...
    while (elapsedDays(year + 1) + JEWISH_EPOCH <= absDate) year++;
    // ...and walk backward in case the estimate above overshot.
    while (elapsedDays(year) + JEWISH_EPOCH > absDate) year--;

    // Now that we know the year, find how far into it absDate falls...
    let dayOfYear = absDate - (elapsedDays(year) + JEWISH_EPOCH); // 0-indexed
    // ...and walk through the months in chronological order, subtracting
    // each one's length, until we land in the right month.
    const order = monthOrder(year);
    let month = order[0];
    for (const m of order) {
      const len = daysInMonth(year, m);
      if (dayOfYear < len) { month = m; break; }
      dayOfYear -= len;
    }
    return { year, month, day: dayOfYear + 1 };
  }

  // ---- Gregorian <-> absolute day number (proleptic Gregorian, day 1 = Jan 1, year 1) ----
  // This section is completely independent of the Hebrew-calendar math
  // above; it's just standard Gregorian calendar arithmetic, used so both
  // calendars can be compared on one shared "day number" line.

  // Leap year rule: divisible by 4, except centuries, unless divisible by 400.
  function isGregorianLeap(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  const GREG_MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  function gregDaysInMonth(year, month) {
    if (month === 2 && isGregorianLeap(year)) return 29;
    return GREG_MONTH_DAYS[month - 1];
  }

  // Day number = (days in every prior month this year) + (day of month)
  // + (365 days for every full prior year) + (leap-day corrections for
  // those prior years: +1 every 4 years, -1 every 100, +1 every 400).
  function gregorianToAbsDate(year, month, day) {
    let days = day;
    for (let m = 1; m < month; m++) days += gregDaysInMonth(year, m);
    const y = year - 1; // full years before this one
    return days + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400);
  }

  // The reverse: given an absolute day number, find which Gregorian
  // year/month/day it falls on. Same estimate-then-correct approach as
  // absDateToHebrew() above.
  function absDateToGregorian(absDate) {
    let year = Math.floor(absDate / 365) - 1; // safely low estimate
    while (gregorianToAbsDate(year + 1, 1, 1) <= absDate) year++;
    while (gregorianToAbsDate(year, 1, 1) > absDate) year--;

    let month = 1;
    while (absDate > gregorianToAbsDate(year, month, gregDaysInMonth(year, month))) month++;
    const day = absDate - gregorianToAbsDate(year, month, 1) + 1;
    return { year, month, day };
  }

  // ---- public API ----

  // JS Date -> { year, month, day } Hebrew date.
  function fromGregorian(date) {
    const abs = gregorianToAbsDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
    return absDateToHebrew(abs);
  }

  // Hebrew (year, month, day) -> JS Date (local midnight on the matching Gregorian day).
  function toGregorian(year, month, day) {
    const abs = hebrewToAbsDate(year, month, day);
    const g = absDateToGregorian(abs);
    return new Date(g.year, g.month - 1, g.day);
  }

  // Convert a number into a Hebrew-numeral (gematriya) string, e.g. 5786 -> "תשפ״ו".
  // Traditional letter values: ones = 1-9 (א-ט), tens = 10-90 (י-צ),
  // hundreds = 100-900 (ק-תתק, built by prefixing extra ת's past 400).
  function toHebrewNumeral(num) {
    // 15 and 16 are special-cased to ט״ו / ט״ז (9+6, 9+7) instead of the
    // literal יה / יו, because those letter pairs are read as an
    // abbreviation of the divine name - a well-known convention this
    // calendar's numerals always follow.
    if (num === 15) return 'ט״ו';
    if (num === 16) return 'ט״ז';

    const hundreds = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];
    const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
    const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];

    let n = num;
    let letters = hundreds[Math.floor(n / 100)];
    n %= 100;
    letters += tens[Math.floor(n / 10)];
    n %= 10;
    letters += ones[n];

    // A gershayim (״) is inserted before the last letter of a multi-letter
    // numeral; a single-letter numeral gets a trailing geresh (׳) instead.
    // Both are the standard punctuation marks for Hebrew numerals.
    if (letters.length > 1) {
      letters = letters.slice(0, -1) + '״' + letters.slice(-1);
    } else {
      letters += '׳';
    }
    return letters;
  }

  // English display string, e.g. "15 Cheshvan 5769".
  function toString(hd) {
    return hd.day + ' ' + monthName(hd.year, hd.month) + ' ' + hd.year;
  }

  // Hebrew-script display string, e.g. "ט״ו חשון תשס״ט".
  // The year's numeral drops the thousands digit (5769 -> 769), which is
  // the standard convention since the "thousands" are implied.
  function toGematriya(hd) {
    const dayPart = toHebrewNumeral(hd.day);
    const yearPart = toHebrewNumeral(hd.year % 1000);
    return dayPart + ' ' + monthNameHebrew(hd.year, hd.month) + ' ' + yearPart;
  }

  // Expose only what the rest of the site needs to call.
  return {
    months: { NISAN, IYYAR, SIVAN, TAMUZ, AV, ELUL, TISHREI, CHESHVAN, KISLEV, TEVET, SHEVAT, ADAR, ADAR_II },
    isLeapYear,
    monthsInYear,
    daysInMonth,
    fromGregorian,
    toGregorian,
    toString,
    toGematriya
  };
})();

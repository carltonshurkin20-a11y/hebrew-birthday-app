// Grab every element we'll read from or write to, once, up front.
const form = document.getElementById('convert-form');
const input = document.getElementById('birthdate');
const errorEl = document.getElementById('error');
const resultEl = document.getElementById('result');
const hebrewEl = document.getElementById('result-hebrew');
const gematriyaEl = document.getElementById('result-gematriya');
const gregEl = document.getElementById('result-greg');
const nextEl = document.getElementById('result-next');
const datePlaceholder = document.getElementById('date-placeholder');

// Formats a JS Date as e.g. "March 19, 2003" for display.
const gregFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric', month: 'long', day: 'numeric'
});

// Our own "mm/dd/yyyy" hint (see styles.css .date-placeholder) only makes
// sense while the field is empty - hide it the instant a real date is
// picked, and bring it back if the field is ever cleared.
function updateDatePlaceholder() {
  datePlaceholder.hidden = input.value !== '';
}
updateDatePlaceholder();
input.addEventListener('input', updateDatePlaceholder);
input.addEventListener('change', updateDatePlaceholder);

// Shorthand for the month-number constants exported by hebrew-calendar.js.
const M = HebrewCalendar.months;

// Given the Hebrew month someone was born in, figure out which month
// their anniversary should land on in a *different* target year - this
// only matters for Adar, because Adar is the one month that moves around
// depending on whether a year is a leap year (13 months) or not (12).
//
// Months 1-11 (Nisan..Shevat) exist identically in every year, so they
// never need adjusting.
function monthForTargetYear(birthMonth, birthYearIsLeap, targetYearIsLeap) {
  if (birthMonth <= 11) return birthMonth; // no Adar involved - nothing to adjust

  if (!birthYearIsLeap) {
    // Born in the single Adar of a regular year. Ashkenazi convention:
    // observe the anniversary in Adar II when the target year is a leap
    // year (Adar II is "the real Adar" - the one adjacent to Nisan/Pesach).
    return targetYearIsLeap ? M.ADAR_II : M.ADAR;
  }

  if (birthMonth === M.ADAR) {
    // Born in Adar I of a leap year. In a future regular year there's
    // only one Adar, so Adar I collapses into it.
    return M.ADAR;
  }

  // Born in Adar II of a leap year.
  return targetYearIsLeap ? M.ADAR_II : M.ADAR;
}

// Find the next Gregorian date, on or after `today`, whose Hebrew
// month/day matches the birth date's Hebrew month/day.
function nextHebrewAnniversary(birthGregDate, today) {
  // Convert the birthday itself to a Hebrew date, so we know which
  // Hebrew month/day/leap-status we're looking for.
  const hdBirth = HebrewCalendar.fromGregorian(birthGregDate);
  const birthYearIsLeap = HebrewCalendar.isLeapYear(hdBirth.year);

  // Normalize "today" to midnight so a same-day match still counts.
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // Start searching from the current Hebrew year.
  let candidateYear = HebrewCalendar.fromGregorian(todayMidnight).year;

  // Try this year, then next year, etc., until we find an anniversary
  // that hasn't already passed. Two iterations is normally enough (this
  // year's anniversary already passed -> try next year), but we allow a
  // few extra as a safety margin.
  for (let i = 0; i < 4; i++) {
    const targetYearIsLeap = HebrewCalendar.isLeapYear(candidateYear);
    const targetMonth = monthForTargetYear(hdBirth.month, birthYearIsLeap, targetYearIsLeap);

    // Guard against day 30 in a month that only has 29 days this year
    // (only Cheshvan/Kislev vary) by clamping to the month's real length.
    const maxDay = HebrewCalendar.daysInMonth(candidateYear, targetMonth);
    const targetDay = Math.min(hdBirth.day, maxDay);

    // Convert that candidate Hebrew date back to a Gregorian date.
    const candidateGreg = HebrewCalendar.toGregorian(candidateYear, targetMonth, targetDay);

    // If it's today or later, we've found the next anniversary.
    if (candidateGreg.getTime() >= todayMidnight.getTime()) {
      return candidateGreg;
    }

    // Otherwise it already happened this Hebrew year - check next year.
    candidateYear++;
  }
  return null; // unreachable in practice, but keeps the function's contract honest
}

form.addEventListener('submit', function (event) {
  event.preventDefault(); // stop the browser from reloading the page
  errorEl.textContent = ''; // clear any previous error message

  const value = input.value; // e.g. "2003-03-19", or "" if empty
  if (!value) {
    errorEl.textContent = 'Choose a date to convert.';
    resultEl.classList.remove('show'); // hide any previous result
    return;
  }

  // Parse the "YYYY-MM-DD" string manually (rather than `new Date(value)`)
  // so the date is built in the browser's local timezone, avoiding the
  // off-by-one-day bug that UTC parsing can cause.
  const [year, month, day] = value.split('-').map(Number);
  const gregDate = new Date(year, month - 1, day);

  // `new Date` silently rolls invalid dates forward (e.g. Feb 30 becomes
  // Mar 2), so we check the constructed date's fields match what we
  // asked for; if not, the input was never a real calendar date.
  if (
    gregDate.getFullYear() !== year ||
    gregDate.getMonth() !== month - 1 ||
    gregDate.getDate() !== day
  ) {
    errorEl.textContent = "That date doesn't exist. Try again.";
    resultEl.classList.remove('show');
    return;
  }

  // Do the actual conversions.
  const hd = HebrewCalendar.fromGregorian(gregDate);
  const today = new Date();
  const nextGreg = nextHebrewAnniversary(gregDate, today);

  // Fill in the result card's text content.
  hebrewEl.textContent = HebrewCalendar.toString(hd); // e.g. "15 Cheshvan 5769"
  gematriyaEl.textContent = HebrewCalendar.toGematriya(hd); // e.g. "ט״ו חשון תשס״ט"
  gregEl.textContent = 'Gregorian: ' + gregFormatter.format(gregDate);

  // Build the "next birthday" line as real DOM nodes (rather than
  // innerHTML + a string) so there's no way for any text ever placed in
  // it to be interpreted as markup.
  nextEl.textContent = 'Your next Hebrew birthday falls on ';
  const strong = document.createElement('strong');
  strong.textContent = gregFormatter.format(nextGreg);
  nextEl.appendChild(strong);

  // Re-trigger the reveal animation: remove the class, force the browser
  // to acknowledge the removal (the `offsetWidth` read does this), then
  // add it back - so converting a second time animates again instead of
  // the browser seeing "class already present" and skipping the transition.
  resultEl.classList.remove('show');
  void resultEl.offsetWidth;
  resultEl.classList.add('show');
});

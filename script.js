(function () {
  'use strict';

  const form = document.getElementById('convert-form');
  const input = document.getElementById('birthdate');
  const errorEl = document.getElementById('error');
  const resultEl = document.getElementById('result');
  const hebrewEl = document.getElementById('result-hebrew');
  const gematriyaEl = document.getElementById('result-gematriya');
  const gregEl = document.getElementById('result-greg');
  const nextEl = document.getElementById('result-next');

  function showError(message) {
    errorEl.textContent = message;
    resultEl.classList.remove('show');
  }

  function clearError() {
    errorEl.textContent = '';
  }

  function daysBetween(a, b) {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
  }

  function buildNextBirthdayLine(upcoming) {
    nextEl.textContent = ''; // clear previous content

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntil = daysBetween(today, upcoming.gregorianDate);

    if (daysUntil === 0) {
      nextEl.append('Your Hebrew birthday is today! ');
      const strong = document.createElement('strong');
      strong.textContent = '🎉';
      nextEl.append(strong);
      return;
    }

    nextEl.append('Next Hebrew birthday: ');
    const strong = document.createElement('strong');
    strong.textContent = window.HebrewCalendar.shortGregFormatter.format(upcoming.gregorianDate);
    nextEl.append(strong);
    nextEl.append(` (in ${daysUntil} day${daysUntil === 1 ? '' : 's'})`);
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    const value = input.value;
    if (!value) {
      showError('Please enter your birthday.');
      return;
    }

    const birthDate = new Date(value + 'T00:00:00');
    if (isNaN(birthDate.getTime())) {
      showError('That date doesn\u2019t look right.');
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (birthDate.getTime() > today.getTime()) {
      showError('Birthday can\u2019t be in the future.');
      return;
    }

    let hebrewParts, gematriya, upcoming;
    try {
      hebrewParts = window.HebrewCalendar.getHebrewParts(birthDate);
      gematriya = window.HebrewCalendar.formatGematriyaDate(birthDate);
      upcoming = window.HebrewCalendar.getUpcomingHebrewBirthday(birthDate);
    } catch (err) {
      showError('Something went wrong converting that date. Please try again.');
      return;
    }

    clearError();

    hebrewEl.textContent = `${hebrewParts.day} ${hebrewParts.month}, ${hebrewParts.year}`;
    gematriyaEl.textContent = gematriya;
    gregEl.textContent = window.HebrewCalendar.weekdayGregFormatter.format(birthDate);
    buildNextBirthdayLine(upcoming);

    resultEl.classList.add('show');
  });

  input.addEventListener('input', clearError);
})();

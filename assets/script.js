(function () {
  'use strict';

  document.documentElement.classList.add('js');

  var header = document.querySelector('header');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Elements that only make sense with JavaScript (survey progress, Back/Next)
  document.querySelectorAll('[data-js-only]').forEach(function (el) { el.hidden = false; });

  /* ---------- Mobile menu ---------- */
  var toggle = document.getElementById('menu-toggle');
  var menu = document.getElementById('mobile-menu');

  function setMenu(open) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.hidden = !open;
  }

  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      setMenu(toggle.getAttribute('aria-expanded') !== 'true');
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) {
        setMenu(false);
        toggle.focus();
      }
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth >= 1024 && !menu.hidden) setMenu(false);
    });
  }

  /* ---------- Smooth scroll (offset for the sticky header) ---------- */
  function scrollToEl(target, id) {
    var offset = header ? header.offsetHeight : 0;
    var top = id === '#top' ? 0 : target.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top: top, behavior: reduceMotion ? 'auto' : 'smooth' });
    if (history.replaceState) history.replaceState(null, '', id);
  }

  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href^="#"]');
    if (!link) return;
    var id = link.getAttribute('href');
    if (id.length < 2) return;
    var target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    scrollToEl(target, id);

    // "Start here" links pre-answer the survey's first question
    var situation = link.getAttribute('data-situation');
    if (situation && survey) {
      survey.preselect(situation);
      return;
    }
    // Move focus for keyboard and screen-reader users without a second jump
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });

  /* ---------- FAQ accordion ---------- */
  document.querySelectorAll('.faq-q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      document.getElementById(btn.getAttribute('aria-controls')).hidden = open;
    });
  });

  /* ---------- Intake survey: steps, validation, lead triage, Netlify submit ---------- */
  var form = document.getElementById('lead-form');
  var survey = null;

  if (form) {
    var steps = Array.prototype.slice.call(form.querySelectorAll('.survey-step'));
    var progressLabel = document.getElementById('survey-progress');
    var progressBar = form.querySelector('.progress-bar');
    var success = document.getElementById('form-success');
    var formError = document.getElementById('form-error');
    var current = 0;

    var textChecks = {
      name: function (v) { return v.trim().length > 1; },
      phone: function (v) { return v.replace(/\D/g, '').length >= 10; },
      email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); }
    };

    function radioValue(name) {
      var checked = form.querySelector('input[name="' + name + '"]:checked');
      return checked ? checked.value : '';
    }

    function showStep(i, focus) {
      current = i;
      steps.forEach(function (s, n) { s.classList.toggle('is-active', n === i); });
      progressLabel.textContent = 'Step ' + (i + 1) + ' of ' + steps.length + ' · ' + steps[i].getAttribute('data-title');
      progressBar.style.transform = 'scaleX(' + (i + 1) / steps.length + ')';
      if (focus) steps[i].querySelector('.step-title').focus({ preventScroll: true });
    }

    function validateText(field) {
      var ok = textChecks[field.name](field.value);
      var err = document.getElementById(field.id + '-err');
      field.setAttribute('aria-invalid', String(!ok));
      if (err) err.hidden = ok;
      return ok;
    }

    // Validates one step; returns the first field that needs attention, or null
    function validateStep(step) {
      var firstBad = null;
      step.querySelectorAll('fieldset.survey-q').forEach(function (fs) {
        var input = fs.querySelector('input[type="radio"]');
        var ok = !!radioValue(input.name);
        fs.setAttribute('aria-invalid', String(!ok));
        document.getElementById('err-' + input.name).hidden = ok;
        if (!ok && !firstBad) firstBad = input;
      });
      step.querySelectorAll('input[name="name"], input[name="phone"], input[name="email"]').forEach(function (field) {
        if (!validateText(field) && !firstBad) firstBad = field;
      });
      return firstBad;
    }

    // A one-line label at the top of the lead email so Manoj can triage at a glance
    function leadFit() {
      var situation = radioValue('situation');
      var credit = radioValue('credit');
      var income = radioValue('income');
      var equity = radioValue('down-payment');
      var timeline = radioValue('timeline');
      var fit;
      if (credit === 'Rough (under 600)' && equity === '20% or more') {
        fit = 'Possible private / B-lender';
      } else if (credit === 'Strong (680+)' && income === 'Employed (T4)' &&
                 ['Declined by bank', 'Self-employed', 'New to Canada', 'Divorce or separation'].indexOf(situation) === -1) {
        fit = 'Likely A-lender';
      } else {
        fit = 'B-lender fit';
      }
      if (timeline === 'Within 30 days') fit = 'URGENT · ' + fit;
      return fit;
    }

    form.noValidate = true;
    showStep(0, false);

    form.addEventListener('click', function (e) {
      if (e.target.closest('[data-next]')) {
        var bad = validateStep(steps[current]);
        if (bad) { bad.focus(); return; }
        showStep(current + 1, true);
        scrollToEl(form.closest('section'), '#contact');
      } else if (e.target.closest('[data-back]')) {
        showStep(current - 1, true);
      }
    });

    // Clear a question's error as soon as it's answered
    form.addEventListener('change', function (e) {
      if (e.target.type === 'radio') {
        var fs = e.target.closest('fieldset.survey-q');
        fs.setAttribute('aria-invalid', 'false');
        document.getElementById('err-' + e.target.name).hidden = true;
      }
    });

    Object.keys(textChecks).forEach(function (name) {
      var field = form.elements[name];
      field.addEventListener('blur', function () { if (field.value) validateText(field); });
      field.addEventListener('input', function () {
        if (field.getAttribute('aria-invalid') === 'true') validateText(field);
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      formError.hidden = true;

      for (var i = 0; i < steps.length; i++) {
        var bad = validateStep(steps[i]);
        if (bad) {
          showStep(i, false);
          bad.focus();
          return;
        }
      }

      form.elements['lead-fit'].value = leadFit();

      var button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = 'Sending…';

      // A shared preview has no form backend; it shows the finished state without sending anything
      var send = window.PREVIEW_MODE
        ? Promise.resolve({ ok: true })
        : fetch('/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(new FormData(form)).toString()
          });

      send
        .then(function (res) {
          if (!res.ok) throw new Error('Form submit failed: ' + res.status);
          form.hidden = true;
          success.hidden = false;
          success.focus();
          if (window.gtag) window.gtag('event', 'generate_lead', { form: 'manoj-lead', situation: radioValue('situation') });
          offerBooking(form.elements.name.value, form.elements.email.value);
        })
        .catch(function () {
          formError.hidden = false;
          button.disabled = false;
          button.textContent = 'Send My Details';
        });
    });

    survey = {
      preselect: function (value) {
        var radio = form.querySelector('input[name="situation"][value="' + value + '"]');
        if (!radio) return;
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        if (current === 0) showStep(1, true);
      }
    };
  }

  /* ---------- Calendly: load the widget only once a real link is set ---------- */
  var cal = document.querySelector('.calendly-inline-widget');
  var calUrl = cal ? cal.getAttribute('data-url') || '' : '';
  var calendlyLive = cal && calUrl.indexOf('{{') === -1 && calUrl.indexOf('calendly.com') !== -1;

  if (cal && !calendlyLive) {
    cal.style.height = 'auto';
    cal.innerHTML =
      '<div class="calendly-fallback">' +
      '<p class="text-lg font-semibold">Online booking opens soon.</p>' +
      '<p class="text-navy/75 max-w-sm">Until then, call or text <a class="underline underline-offset-4 whitespace-nowrap" href="tel:6478248251">647-824-8251</a>, ' +
      'or <a class="underline underline-offset-4" href="#contact">send me your situation</a> and I\'ll call you back.</p>' +
      '</div>';
  } else if (calendlyLive) {
    var s = document.createElement('script');
    s.src = 'https://assets.calendly.com/assets/external/widget.js';
    s.async = true;
    document.body.appendChild(s);
  }

  // After the survey: offer a call time, with the calendar pre-filled with their name and email
  function offerBooking(name, email) {
    if (!calendlyLive) return;
    document.getElementById('success-book').hidden = false;
    if (window.Calendly && window.Calendly.initInlineWidget) {
      cal.innerHTML = '';
      window.Calendly.initInlineWidget({ url: calUrl, parentElement: cal, prefill: { name: name, email: email } });
    }
  }
})();

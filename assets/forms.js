// Renders one bilingual registration form (crew or guest) and posts it to the
// Google Apps Script web app, which appends a row to the Google Sheet.
(function () {
  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  const MAX_IMAGE_EDGE = 2000; // downscale big phone photos before upload
  const MAX_ANSWER_LENGTH = 2000;
  const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const TEL_RE = /^\+?[\d\s()-]+$/;

  const COPY = {
    next: { en: 'Next', ar: 'نكمل' },
    back: { en: 'Back', ar: 'رجوع' },
    submit: { en: 'Submit', ar: 'إرسال المعلومات' },
    sending: { en: 'Sending…', ar: 'جارٍ الإرسال…' },
    chooseOption: { en: 'Choose an option', ar: 'اختر الخيار المناسب' },
    aboutProject: { en: 'About the project', ar: 'عن المشروع' },
    team: { en: 'The team', ar: 'فريق العمل' },
    chooseFile: { en: 'Choose file or take photo', ar: 'اختر ملف أو صوّر' },
    replaceFile: { en: 'Replace', ar: 'تغيير' },
    errRequired: { en: 'This field is required.', ar: 'هذا الحقل مطلوب.' },
    errEmail: { en: 'Enter a valid email.', ar: 'أدخل بريدًا إلكترونيًا صحيحًا.' },
    errTel: { en: 'Enter a valid phone number.', ar: 'أدخل رقم جوال صحيح.' },
    errTooLong: { en: 'This answer is too long.', ar: 'الإجابة طويلة جدًا.' },
    errFileType: { en: 'Upload a photo (JPG, PNG, HEIC) or a PDF.', ar: 'ارفع صورة (JPG أو PNG أو HEIC) أو ملف PDF.' },
    errFileSize: { en: 'The file is larger than 8 MB.', ar: 'حجم الملف أكبر من 8 ميجابايت.' },
    submitError: { en: 'We could not send your details. Please check your connection and try again.', ar: 'تعذّر إرسال المعلومات. تأكد من الاتصال وحاول مرة أخرى.' },
    notConfigured: { en: 'This form is not connected yet. Please contact production.', ar: 'النموذج غير مربوط بعد. تواصل مع فريق الإنتاج.' },
  };

  const form = window.OSOOL_FORMS[document.body.dataset.form];
  const scriptUrl = (window.OSOOL_CONFIG || {}).SCRIPT_URL || '';
  const hasBrief = form.brief.facts.length > 0 || form.team.length > 0 || !!(form.brief.body.en || form.brief.body.ar);
  const steps = hasBrief ? ['intro', 'brief', 'form', 'done'] : ['intro', 'form', 'done'];

  const state = {
    lang: new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : form.defaultLang,
    step: 0,
    answers: {},
    files: {}, // key -> { name, mimeType, data (base64), size }
    showErrors: false,
    submitting: false,
    submitError: '',
  };

  const app = document.getElementById('app');
  document.documentElement.style.setProperty('--accent', form.accent);

  const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const pick = text => (text ? text[state.lang] || text[state.lang === 'ar' ? 'en' : 'ar'] || '' : '');
  const t = key => COPY[key][state.lang];

  // ── Visibility + validation ────────────────────────────────────────────────
  function visibleFields() {
    const kept = {};
    return form.fields.filter(field => {
      const visible = !field.showIf || kept[field.showIf.field] === field.showIf.equals;
      if (visible && state.answers[field.key]) kept[field.key] = state.answers[field.key];
      return visible;
    });
  }

  function errors() {
    const out = {};
    for (const field of visibleFields()) {
      if (field.type === 'file') {
        const file = state.files[field.key];
        if (file && file.error) out[field.key] = file.error;
        else if (!file && field.required) out[field.key] = 'errRequired';
        continue;
      }
      const value = (state.answers[field.key] || '').trim();
      if (!value) { if (field.required) out[field.key] = 'errRequired'; }
      else if (value.length > MAX_ANSWER_LENGTH) out[field.key] = 'errTooLong';
      else if (field.type === 'email' && !EMAIL_RE.test(value)) out[field.key] = 'errEmail';
      else if (field.type === 'tel' && (!TEL_RE.test(value) || value.replace(/\D/g, '').length < 7)) out[field.key] = 'errTel';
    }
    return out;
  }

  // ── Files ──────────────────────────────────────────────────────────────────
  const readAsDataUrl = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  async function downscale(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
      if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
    } catch {
      return file; // browser can't decode it (e.g. HEIC outside Safari) — send as-is
    }
  }

  async function onFile(key, file) {
    if (!file) { delete state.files[key]; render(); return; }
    const type = file.type || (/\.hei[cf]$/i.test(file.name) ? 'image/heic' : '');
    if (!FILE_TYPES.includes(type)) { state.files[key] = { name: file.name, error: 'errFileType' }; render(); return; }
    const ready = await downscale(file);
    if (ready.size > MAX_FILE_BYTES) { state.files[key] = { name: file.name, error: 'errFileSize' }; render(); return; }
    const dataUrl = await readAsDataUrl(ready);
    state.files[key] = { name: ready.name, mimeType: ready.type || type, size: ready.size, data: String(dataUrl).split(',')[1] };
    render();
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  function payload() {
    const answers = {};
    const files = {};
    for (const field of visibleFields()) {
      if (field.type === 'file') {
        const file = state.files[field.key];
        if (file && file.data) files[field.key] = { name: file.name, mimeType: file.mimeType, data: file.data };
        continue;
      }
      const value = (state.answers[field.key] || '').trim();
      if (!value) continue;
      // Choice answers go to the sheet as their English label, readable by everyone.
      const option = (field.options || []).find(o => o.value === value);
      answers[field.key] = option ? option.label.en : value;
    }
    return {
      form: form.kind,
      lang: state.lang,
      answers,
      files,
      website: document.getElementById('hp-website')?.value || '', // honeypot
    };
  }

  async function next() {
    const step = steps[state.step];
    if (step !== 'form') { state.step += 1; render(); window.scrollTo(0, 0); return; }

    const errs = errors();
    if (Object.keys(errs).length) {
      state.showErrors = true;
      render();
      const first = form.fields.find(field => errs[field.key]);
      document.getElementById(`field-${first.key}`)?.focus();
      return;
    }
    if (!scriptUrl) { state.submitError = 'notConfigured'; render(); return; }

    state.submitting = true;
    state.submitError = '';
    render();
    try {
      // text/plain keeps this a "simple" request, so Apps Script needs no CORS preflight.
      const res = await fetch(scriptUrl, { method: 'POST', body: JSON.stringify(payload()) });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error || 'Submission rejected');
      state.step = steps.indexOf('done');
    } catch (error) {
      console.error('Submission failed:', error);
      state.submitError = 'submitError';
    } finally {
      state.submitting = false;
      render();
      window.scrollTo(0, 0);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function control(field, invalid) {
    const id = `field-${field.key}`;
    const value = esc(state.answers[field.key] || '');
    const placeholder = pick(field.placeholder);
    const aria = `aria-invalid="${invalid}" ${invalid ? `aria-describedby="${id}-error"` : ''}`;
    switch (field.type) {
      case 'textarea':
        return `<textarea id="${id}" data-key="${field.key}" rows="4" maxlength="${MAX_ANSWER_LENGTH}" placeholder="${esc(placeholder)}" ${aria}>${value}</textarea>`;
      case 'select':
        return `<select id="${id}" data-key="${field.key}" data-rerender ${aria}>
          <option value="">${t('chooseOption')}</option>
          ${field.options.map(o => `<option value="${esc(o.value)}" ${state.answers[field.key] === o.value ? 'selected' : ''}>${esc(pick(o.label))}</option>`).join('')}
        </select>`;
      case 'pills':
        return `<div id="${id}" class="pills" role="radiogroup" aria-labelledby="${id}-label" ${aria} tabindex="-1">
          ${field.options.map(o => {
            const on = state.answers[field.key] === o.value;
            return `<button type="button" role="radio" aria-checked="${on}" class="pill ${on ? 'on' : ''}" data-pill="${field.key}" data-value="${esc(o.value)}">${esc(pick(o.label))}</button>`;
          }).join('')}
        </div>`;
      case 'file': {
        const file = state.files[field.key];
        const ok = file && file.data;
        return `<label class="file ${ok ? 'has-file' : ''}" for="${id}">
          <input id="${id}" type="file" data-file="${field.key}" accept="image/*,application/pdf" ${aria}>
          <span class="file-btn">${ok ? t('replaceFile') : t('chooseFile')}</span>
          <span class="file-name" dir="auto">${ok ? esc(file.name) : esc(placeholder)}</span>
        </label>`;
      }
      default: {
        const ltr = field.type === 'tel' || field.type === 'email';
        return `<input id="${id}" data-key="${field.key}" type="${field.type}" ${ltr ? `dir="ltr" inputmode="${field.type}"` : ''} maxlength="${MAX_ANSWER_LENGTH}" placeholder="${esc(placeholder)}" value="${value}" ${aria}>`;
      }
    }
  }

  function view() {
    const step = steps[state.step];
    if (step === 'intro') {
      return `<section class="center">
        <h1 class="brand">${esc(pick(form.clientName))}</h1>
        <span class="rule"></span>
        <p class="muted lg">${esc(pick(form.tagline))}</p>
        <h2>${esc(pick(form.title))}</h2>
        <p class="chip">${esc(pick(form.subtitle))}</p>
      </section>`;
    }
    if (step === 'brief') {
      const team = [...form.team.filter(m => m.featured), ...form.team.filter(m => !m.featured)];
      return `<section class="stack">
        <h1>${esc(pick(form.title))}</h1>
        ${form.brief.facts.length ? `<div class="facts">${form.brief.facts.map(f => `
          <div class="card"><span class="label">${esc(pick(f.label))}</span><strong>${esc(pick(f.value))}</strong></div>`).join('')}</div>` : ''}
        ${pick(form.brief.body) ? `<div class="card accent"><h3>${t('aboutProject')}</h3><p class="muted">${esc(pick(form.brief.body))}</p></div>` : ''}
        ${team.length ? `<div><h2>${t('team')}</h2><div class="team">${team.map(m => `
          <div class="card ${m.featured ? 'accent featured' : ''}"><span class="label">${esc(pick(m.role))}</span><strong class="lg">${esc(pick(m.name))}</strong></div>`).join('')}</div></div>` : ''}
      </section>`;
    }
    if (step === 'form') {
      const errs = state.showErrors ? errors() : {};
      return `<form id="the-form" class="stack" novalidate>
        <div>
          <h1>${esc(pick(form.title))}</h1>
          <p class="muted">${esc(pick(form.formIntro))}</p>
        </div>
        <div class="grid">
          ${visibleFields().map(field => {
            const err = errs[field.key];
            return `<div class="field ${field.width === 'full' ? 'full' : ''}">
              <label id="field-${field.key}-label" for="field-${field.key}">${esc(pick(field.label))}${field.required ? ' <span class="req">*</span>' : ''}</label>
              ${control(field, !!err)}
              ${err ? `<p id="field-${field.key}-error" class="error">${t(err)}</p>` : ''}
            </div>`;
          }).join('')}
        </div>
        <div class="hp" aria-hidden="true"><label>Website<input id="hp-website" tabindex="-1" autocomplete="off"></label></div>
        ${state.submitError ? `<p role="alert" class="error">${t(state.submitError)}</p>` : ''}
      </form>`;
    }
    return `<section class="center">
      <svg class="check" viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
      <p class="lg">${esc(pick(form.thankYou))}</p>
    </section>`;
  }

  function render() {
    const step = steps[state.step];
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    document.title = `${pick(form.title)} · ${pick(form.subtitle)}`;
    const nextLabel = step === 'form' ? (state.submitting ? t('sending') : t('submit')) : t('next');

    app.innerHTML = `
      <div class="panel">
        <header>
          <span class="logo">CAPTAINS</span>
          <div class="dots" aria-hidden="true">${steps.map((_, i) => `<span class="${i === state.step ? 'on' : ''}"></span>`).join('')}</div>
          <button type="button" class="ghost" id="lang">${state.lang === 'ar' ? 'English' : 'العربية'}</button>
        </header>
        <main>${view()}</main>
        ${step !== 'done' ? `<footer>
          ${state.step > 0 ? `<button type="button" id="back">${t('back')}</button>` : '<span></span>'}
          <button type="button" class="primary" id="next" ${state.submitting ? 'disabled' : ''}>${nextLabel}</button>
        </footer>` : ''}
      </div>
      <p class="foot">${esc(pick(form.title))}</p>`;
  }

  // Event delegation: the DOM is re-rendered, the listeners stay on #app.
  app.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.id === 'lang') { state.lang = state.lang === 'ar' ? 'en' : 'ar'; render(); }
    else if (target.id === 'back') { state.step -= 1; render(); }
    else if (target.id === 'next') void next();
    else if (target.dataset.pill) { state.answers[target.dataset.pill] = target.dataset.value; render(); }
  });
  app.addEventListener('input', event => {
    const key = event.target.dataset.key;
    if (key) state.answers[key] = event.target.value;
  });
  app.addEventListener('change', event => {
    const el = event.target;
    if (el.dataset.file) void onFile(el.dataset.file, el.files[0]);
    else if (el.hasAttribute('data-rerender')) { state.answers[el.dataset.key] = el.value; render(); }
  });
  app.addEventListener('submit', event => { event.preventDefault(); void next(); });

  render();
})();

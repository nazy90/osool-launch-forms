// Renders one bilingual registration form (crew or guest) in the National Day
// form's single-page layout, and posts it to the Google Apps Script web app,
// which appends a row to the Google Sheet.
(function () {
  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  const MAX_IMAGE_EDGE = 2000; // downscale big phone photos before upload
  const MAX_ANSWER_LENGTH = 2000;
  const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const TEL_RE = /^\+?[\d\s()-]+$/;

  const COPY = {
    submit: { en: 'Submit', ar: 'إرسال البيانات' },
    reset: { en: 'Clear form', ar: 'مسح النموذج' },
    preparing: { en: 'Preparing…', ar: 'جار التحضير...' },
    uploading: { en: 'Uploading file…', ar: 'جار رفع المرفق...' },
    sending: { en: 'Sending…', ar: 'جار الإرسال...' },
    choose: { en: 'Choose', ar: 'اختر' },
    fileReady: { en: 'Attached:', ar: 'تم إرفاق:' },
    errRequired: { en: 'This field is required.', ar: 'هذا الحقل مطلوب.' },
    errEmail: { en: 'Enter a valid email.', ar: 'أدخل بريدًا إلكترونيًا صحيحًا.' },
    errTel: { en: 'Enter a valid phone number.', ar: 'أدخل رقم جوال صحيح.' },
    errTooLong: { en: 'This answer is too long.', ar: 'الإجابة طويلة جدًا.' },
    errFileType: { en: 'Upload a photo (JPG, PNG, HEIC) or a PDF.', ar: 'ارفع صورة (JPG أو PNG أو HEIC) أو ملف PDF.' },
    errFileSize: { en: 'The file is larger than 8 MB. Please compress it or choose a smaller photo.', ar: 'حجم المرفق أكبر من 8 ميجابايت. يرجى ضغط الصورة أو اختيار صورة أصغر.' },
    errFileRead: { en: 'Could not read the file. Try another one.', ar: 'تعذر قراءة الملف المرفق. جرّب ملفاً آخر.' },
    fixErrors: { en: 'Please complete the highlighted fields.', ar: 'يرجى إكمال الحقول المحددة.' },
    errNetwork: { en: 'Could not reach the server. Check your connection and try again.', ar: 'تعذر الاتصال بالخادم. تحقق من الاتصال بالإنترنت وحاول مرة أخرى.' },
    errScript: { en: 'Your details were not saved. Please tell production (script error).', ar: 'لم يتم حفظ البيانات. يرجى إبلاغ مسؤول النموذج (خطأ في السكربت).' },
    errSaved: { en: 'Your details were not saved: ', ar: 'لم يتم حفظ البيانات: ' },
    notConfigured: { en: 'This form is not connected yet. Please contact production.', ar: 'النموذج غير مربوط بعد. تواصل مع فريق الإنتاج.' },
    thanksTitle: { en: 'Thank you', ar: 'شكراً لك' },
    thanksNote: { en: 'If we need anything else, production will contact you.', ar: 'في حال احتجنا أي توضيح، سيتواصل معك فريق الإنتاج.' },
    followUs: { en: 'Follow us on Instagram', ar: 'تابعنا على انستا' },
  };

  const form = window.OSOOL_FORMS[document.body.dataset.form];
  const scriptUrl = (window.OSOOL_CONFIG || {}).SCRIPT_URL || '';

  const state = {
    lang: new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : form.defaultLang,
    answers: {},
    files: {}, // key -> { name, mimeType, data (base64) } or { name, error }
    showErrors: false,
    submitting: false,
    done: false,
  };

  const app = document.getElementById('app');
  const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const pick = text => (text ? text[state.lang] || text[state.lang === 'ar' ? 'en' : 'ar'] || '' : '');
  const t = key => COPY[key][state.lang];
  const $ = selector => app.querySelector(selector);

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

  // Updates shown/hidden fields and error text in place, so typing never loses focus.
  function refresh() {
    const visible = new Set(visibleFields().map(field => field.key));
    const errs = state.showErrors ? errors() : {};
    for (const field of form.fields) {
      const wrap = $(`[data-field="${field.key}"]`);
      wrap.classList.toggle('hidden', !visible.has(field.key));
      const err = errs[field.key];
      const errEl = wrap.querySelector('.error');
      errEl.textContent = err ? t(err) : '';
      errEl.classList.toggle('hidden', !err);
      const control = wrap.querySelector('input:not([type=radio]), select, textarea, .choices');
      control.setAttribute('aria-invalid', String(!!err));
      if (field.type === 'file') {
        const file = state.files[field.key];
        const hint = wrap.querySelector('.hint');
        hint.textContent = file && file.data ? `${t('fileReady')} ${file.name}` : pick(field.placeholder);
        hint.classList.toggle('ok', !!(file && file.data));
      }
    }
    if (state.showErrors && !Object.keys(errs).length) setMessage('');
  }

  function setMessage(text) {
    const message = $('#formMessage');
    message.textContent = text;
    message.className = text ? 'message error' : 'message';
  }

  // ── Files ──────────────────────────────────────────────────────────────────
  const readAsBase64 = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const result = String(reader.result); resolve(result.slice(result.indexOf(',') + 1)); };
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
    if (!file) delete state.files[key];
    else {
      const type = file.type || (/\.hei[cf]$/i.test(file.name) ? 'image/heic' : '');
      if (!FILE_TYPES.includes(type)) state.files[key] = { name: file.name, error: 'errFileType' };
      else {
        const ready = await downscale(file);
        if (ready.size > MAX_FILE_BYTES) state.files[key] = { name: file.name, error: 'errFileSize' };
        else {
          try {
            state.files[key] = { name: ready.name, mimeType: ready.type || type, data: await readAsBase64(ready) };
          } catch {
            state.files[key] = { name: file.name, error: 'errFileRead' };
          }
        }
      }
    }
    // Show file problems right away, even before the first submit attempt.
    if (state.files[key] && state.files[key].error) state.showErrors = true;
    refresh();
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
    return { form: form.kind, lang: state.lang, answers, files, website: $('#hp-website').value };
  }

  async function send(data) {
    let response;
    try {
      // text/plain keeps this a "simple" request, so Apps Script needs no CORS preflight.
      response = await fetch(scriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
    } catch {
      throw new Error(t('errNetwork'));
    }
    let result;
    try {
      result = JSON.parse(await response.text());
    } catch {
      // An HTML page here means the Apps Script itself failed or is not deployed correctly.
      throw new Error(t('errScript'));
    }
    if (!result.ok) throw new Error(t('errSaved') + (result.error || ''));
  }

  async function submit() {
    state.showErrors = true;
    const errs = errors();
    refresh();
    if (Object.keys(errs).length) {
      setMessage(t('fixErrors'));
      const first = form.fields.find(field => errs[field.key]);
      const el = $(`[data-field="${first.key}"]`);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.querySelector('input, select, textarea')?.focus({ preventScroll: true });
      return;
    }
    if (!scriptUrl) { setMessage(t('notConfigured')); return; }

    const button = $('#submitButton');
    state.submitting = true;
    button.disabled = true;
    try {
      const data = payload();
      button.textContent = Object.keys(data.files).length ? t('uploading') : t('sending');
      await send(data);
      state.done = true;
      clearAnswers();
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      $('#thankYou').focus();
    } catch (error) {
      setMessage(error.message);
    } finally {
      state.submitting = false;
      if (!state.done) { button.disabled = false; button.textContent = t('submit'); }
    }
  }

  function clearAnswers() {
    state.answers = {};
    state.files = {};
    state.showErrors = false;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function control(field) {
    const id = `field-${field.key}`;
    const value = esc(state.answers[field.key] || '');
    const placeholder = field.type === 'file' ? '' : esc(pick(field.placeholder));
    const errorId = `aria-describedby="${id}-error"`;
    switch (field.type) {
      case 'textarea':
        return `<textarea id="${id}" name="${field.key}" maxlength="${MAX_ANSWER_LENGTH}" placeholder="${placeholder}" ${errorId}>${value}</textarea>`;
      case 'select':
        return `<select id="${id}" name="${field.key}" ${errorId}>
          <option value="">${t('choose')}</option>
          ${field.options.map(o => `<option value="${esc(o.value)}" ${state.answers[field.key] === o.value ? 'selected' : ''}>${esc(pick(o.label))}</option>`).join('')}
        </select>`;
      case 'pills':
        return `<div class="choices" role="radiogroup" aria-labelledby="${id}-label" ${errorId}>
          ${field.options.map((o, i) => `<label><input type="radio" ${i === 0 ? `id="${id}"` : ''} name="${field.key}" value="${esc(o.value)}" ${state.answers[field.key] === o.value ? 'checked' : ''}> ${esc(pick(o.label))}</label>`).join('')}
        </div>`;
      case 'file':
        return `<input id="${id}" name="${field.key}" type="file" accept="image/*,.pdf,.jpg,.jpeg,.png,.heic,.heif" ${errorId}>
          <span class="hint" dir="auto"></span>`;
      default: {
        const ltr = field.type === 'tel' || field.type === 'email';
        return `<input id="${id}" name="${field.key}" type="${field.type}" ${ltr ? `dir="ltr" inputmode="${field.type}"` : ''} maxlength="${MAX_ANSWER_LENGTH}" placeholder="${placeholder}" value="${value}" ${errorId}>`;
      }
    }
  }

  function render() {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    document.title = `${state.lang === 'ar' ? 'كابتنز' : 'Captains'} | ${pick(form.title)} · ${pick(form.subtitle)}`;
    const logo = state.lang === 'ar' ? 'captains-logo-ar-white.png' : 'captains-logo-white.png';

    app.innerHTML = `
      <div class="brandbar">
        <div class="brand">
          <img class="logo-image" src="../assets/${logo}" alt="${state.lang === 'ar' ? 'كابتنز' : 'Captains'}">
          <p class="brandtag">${esc(form.brandtag)}</p>
        </div>
        <div class="side">
          <div class="status"><span class="dot"></span><span>${esc(pick(form.subtitle))}</span></div>
          <button type="button" class="lang-toggle" id="lang" lang="${state.lang === 'ar' ? 'en' : 'ar'}">${state.lang === 'ar' ? 'English' : 'العربية'}</button>
        </div>
      </div>

      <section class="hero ${state.done ? 'hidden' : ''}">
        <h1>${esc(pick(form.heading))}</h1>
        <p class="subtitle">${esc(pick(form.formIntro))}</p>
        ${form.brief.facts.length ? `<div class="facts">${form.brief.facts.map(f => `
          <div class="fact"><span>${esc(pick(f.label))}</span><strong>${esc(pick(f.value))}</strong></div>`).join('')}</div>` : ''}
        ${pick(form.brief.body) ? `<div class="notice">${esc(pick(form.brief.body))}</div>` : ''}
      </section>

      <form id="theForm" class="${state.done ? 'hidden' : ''}" novalidate>
        <h2 class="section-title">${esc(pick(form.section))}</h2>
        <div class="grid">
          ${form.fields.map(field => `
            <div class="field ${field.width === 'full' ? 'full' : ''}" data-field="${field.key}">
              <label id="field-${field.key}-label" for="field-${field.key}">${esc(pick(field.label))}${field.required ? ' <span class="req">*</span>' : ''}</label>
              ${control(field)}
              <p id="field-${field.key}-error" class="error hidden"></p>
            </div>`).join('')}
        </div>
        <div class="hp" aria-hidden="true"><label>Website<input id="hp-website" tabindex="-1" autocomplete="off"></label></div>
        <div class="actions">
          <button class="primary" id="submitButton" type="submit">${t('submit')}</button>
          <button class="secondary" type="reset">${t('reset')}</button>
        </div>
        <div id="formMessage" class="message" role="status" aria-live="polite"></div>
      </form>

      <section class="thanks ${state.done ? 'show' : ''}" id="thankYou" role="status" aria-live="polite" tabindex="-1">
        <div class="thanks-mark" aria-hidden="true">✓</div>
        <h2>${t('thanksTitle')}</h2>
        <p class="thanks-lead">${esc(pick(form.thankYou))}</p>
        <p class="thanks-note">${t('thanksNote')}</p>
        <div class="thanks-social">
          <p>${t('followUs')}</p>
          <a class="ig-link" href="https://www.instagram.com/captains_film/" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
            </svg>
            <span>@captains_film</span>
          </a>
        </div>
        <div class="again"><button class="secondary" type="button" id="newEntryButton">${esc(pick(form.another))}</button></div>
      </section>

      <div class="footer">${esc(pick(form.footer))}</div>`;
    refresh();
  }

  // Event delegation: the DOM is re-rendered on language change, listeners stay on #app.
  app.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.id === 'lang') { state.lang = state.lang === 'ar' ? 'en' : 'ar'; render(); }
    else if (target.id === 'newEntryButton') { state.done = false; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });
  app.addEventListener('input', event => {
    const el = event.target;
    if (!el.name || el.type === 'file' || el.type === 'radio') return;
    state.answers[el.name] = el.value;
    if (state.showErrors || el.tagName === 'SELECT') refresh();
  });
  app.addEventListener('change', event => {
    const el = event.target;
    if (el.type === 'file') void onFile(el.name, el.files[0]);
    else if (el.type === 'radio' || el.tagName === 'SELECT') { state.answers[el.name] = el.value; refresh(); }
  });
  app.addEventListener('submit', event => { event.preventDefault(); if (!state.submitting) void submit(); });
  app.addEventListener('reset', () => { clearAnswers(); setTimeout(() => { refresh(); setMessage(''); }); });

  render();
})();

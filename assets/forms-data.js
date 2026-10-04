// Content for both forms. Every guest-facing string is { en, ar }.
// Replace the [TBD] placeholders once the shoot details are confirmed.
(function () {
  const bi = (en, ar) => ({ en, ar });
  const opt = (value, en, ar) => ({ value, label: bi(en, ar) });

  const shared = {
    accent: '#c8a96b',
    defaultLang: 'ar',
    clientName: bi('OSOOL', 'أصول'),
    tagline: bi('Production Registration Portal', 'بوابة التسجيل للإنتاج'),
    title: bi('OSOOL Launch Campaign & Film', 'حملة إطلاق أصول والفيلم'),
    brief: {
      body: bi(
        '[TBD] A short paragraph about the launch campaign and film: what we are shooting, where, and when.',
        '[يُحدد لاحقًا] فقرة قصيرة عن حملة الإطلاق والفيلم: وش رح نصوّر، وفين، ومتى.',
      ),
      facts: [
        { label: bi('Shoot date', 'موعد التصوير'), value: bi('[TBD]', '[يُحدد لاحقًا]') },
        { label: bi('Location', 'الموقع'), value: bi('[TBD]', '[يُحدد لاحقًا]') },
        { label: bi('Call time', 'وقت الحضور'), value: bi('[TBD]', '[يُحدد لاحقًا]') },
      ],
    },
    team: [
      { role: bi('Production Captain', 'الكابتن الإنتاجي'), name: bi('[TBD]', '[يُحدد لاحقًا]'), featured: true },
      { role: bi('Directing Captain', 'الكابتن الإخراجي'), name: bi('[TBD]', '[يُحدد لاحقًا]'), featured: true },
      { role: bi('Production Manager', 'مدير الإنتاج'), name: bi('[TBD]', '[يُحدد لاحقًا]') },
    ],
  };

  const crew = {
    ...shared,
    kind: 'crew',
    subtitle: bi('Crew registration', 'تسجيل فريق العمل'),
    formIntro: bi(
      'Please fill in your details and upload a clear photo or scan of your ID. We need it for site access permits.',
      'نحتاج منك تعبئة بياناتك ورفع صورة واضحة من هويتك، عشان تصاريح الدخول للموقع.',
    ),
    fields: [
      { key: 'full_name', type: 'text', width: 'half', required: true, label: bi('Full name (as on ID)', 'الاسم الكامل (كما في الهوية)') },
      {
        key: 'role', type: 'text', width: 'half', required: true,
        label: bi('Role / department', 'الدور / القسم'),
        placeholder: bi('e.g. Gaffer, Art department', 'مثال: إضاءة، قسم الديكور'),
      },
      { key: 'nationality', type: 'text', width: 'half', required: true, label: bi('Nationality', 'الجنسية') },
      { key: 'id_number', type: 'text', width: 'half', required: true, label: bi('National ID / Iqama / passport number', 'رقم الهوية / الإقامة / جواز السفر') },
      { key: 'mobile', type: 'tel', width: 'half', required: true, label: bi('Mobile number', 'رقم الجوال'), placeholder: bi('05xxxxxxxx', '05xxxxxxxx') },
      { key: 'email', type: 'email', width: 'half', required: true, label: bi('Email', 'البريد الإلكتروني') },
      {
        key: 'id_file', type: 'file', width: 'full', required: true,
        label: bi('Upload your ID', 'ارفع صورة الهوية'),
        placeholder: bi('Photo or PDF, up to 8 MB', 'صورة أو PDF، بحد أقصى 8 ميجابايت'),
      },
    ],
    thankYou: bi(
      'Thank you, we have received your details and ID. Production will share the call sheet with you.',
      'يعطيك العافية، استلمنا بياناتك وصورة الهوية. فريق الإنتاج بيرسل لك جدول التصوير.',
    ),
  };

  const guest = {
    ...shared,
    kind: 'guest',
    subtitle: bi('Guest registration', 'تسجيل الضيوف'),
    formIntro: bi(
      'So we can prepare a smooth experience from the moment you arrive, please fill in your access, reception, transport and hospitality details.',
      'عشان نجهّز لك تجربة مرتبة من لحظة الوصول، نحتاج منك تعبئة المعلومات الخاصة بالدخول، الاستقبال، Transportation والضيافة.',
    ),
    fields: [
      {
        key: 'visitor_type', type: 'select', width: 'half', required: true,
        label: bi('You are joining as', 'صفتك معنا'),
        options: [opt('client', 'Client', 'عميل'), opt('guest', 'Guest', 'ضيف')],
      },
      { key: 'full_name', type: 'text', width: 'half', required: true, label: bi('Full name', 'الاسم الكامل') },
      { key: 'id_number', type: 'text', width: 'half', required: true, label: bi('National ID or passport number', 'رقم الهوية أو جواز السفر') },
      { key: 'mobile', type: 'tel', width: 'half', required: true, label: bi('Mobile number', 'رقم الجوال') },
      { key: 'email', type: 'email', width: 'full', required: false, label: bi('Email', 'البريد الإلكتروني') },
      {
        key: 'arrival', type: 'pills', width: 'full', required: true,
        label: bi('How will you arrive?', 'كيف ناوي توصل؟'),
        options: [opt('pickup', 'Pick-up', 'Pick-up'), opt('own_car', 'My own car', 'بسيارتي')],
      },
      {
        key: 'pickup_location', type: 'text', width: 'full', required: true,
        label: bi('Pick-up location / map link', 'موقع الاستلام / Location Link'),
        placeholder: bi('Paste a map link or write the address clearly', 'حط رابط الـLocation أو اكتب العنوان بشكل واضح'),
        showIf: { field: 'arrival', equals: 'pickup' },
      },
      {
        key: 'plate_number', type: 'text', width: 'half', required: true,
        label: bi('Plate number', 'رقم اللوحة'),
        showIf: { field: 'arrival', equals: 'own_car' },
      },
      {
        key: 'car_type', type: 'text', width: 'half', required: true,
        label: bi('Car type', 'نوع السيارة'),
        placeholder: bi('e.g. SUV, sedan', 'مثال: SUV، سيدان'),
        showIf: { field: 'arrival', equals: 'own_car' },
      },
      {
        key: 'drink', type: 'pills', width: 'full', required: true,
        label: bi('Your preferred drink?', 'وش مشروبك المفضل؟'),
        options: [
          opt('coffee', 'Coffee', 'قهوة'),
          opt('tea', 'Tea', 'شاي'),
          opt('any', 'Happy with anything', 'مرن مع كل الخيارات'),
          opt('decaf', 'Decaf', 'منزوع الكافيين'),
        ],
      },
      {
        key: 'food', type: 'pills', width: 'full', required: true,
        label: bi('Food preference?', 'وش يناسبك بالأكل؟'),
        options: [
          opt('diet', 'Diet', 'دايت'),
          opt('regular', 'Regular', 'عادي'),
          opt('vegetarian', 'Vegetarian', 'Vegetarian'),
          opt('vegan', 'Vegan', 'Vegan'),
        ],
      },
      {
        key: 'special_requests', type: 'textarea', width: 'full', required: false,
        label: bi('Any notes or special requests for the location?', 'فيه أي ملاحظات أو طلبات خاصة بالموقع؟'),
        placeholder: bi(
          'e.g. food allergies, access requirements, special arrangements',
          'مثلاً: حساسية غذائية، متطلبات دخول، ترتيبات خاصة أو أي ملاحظة تهمنا',
        ),
      },
    ],
    thankYou: bi(
      'We have received all your details. We will send you the timings and driver details if you chose pick-up.',
      'استلمنا كافة المعلومات. سيتم تزويدك بالأوقات وتفاصيل السائق في حال اختيار خدمة الPick-up.',
    ),
  };

  window.OSOOL_FORMS = { crew, guest };
})();

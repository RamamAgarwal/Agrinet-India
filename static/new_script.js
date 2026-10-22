// Utils
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

// State & I18N
let currentLanguage = localStorage.getItem('agrinet_language') || 'en';
let advisoryRequestId = 0;
let dxRequestId = 0;

let pin = null;
let currentAnalysisResponse = null;
let currentFieldState = null;
let currentAdvisory = null;
let lastDxResult = null; // store to know if dx exists

window.localizeEnum = function(val, category) {
    if (val === undefined || val === null) return '';
    if (typeof val === 'boolean') return window.t('enum_bool_' + String(val)) || String(val);
    const key = `enum_${category}_${String(val).toLowerCase()}`;
    const result = window.t(key);
    return result !== key ? result : String(val);
};

window.t = function(key, params = {}) {
    const lang = currentLanguage || 'en';
    const dictionary = UI_TRANSLATIONS[lang] || UI_TRANSLATIONS.en;
    let enVal = UI_TRANSLATIONS.en[key] ?? key;
    let localVal = dictionary[key] ?? enVal;

    if (typeof enVal !== 'string') enVal = String(enVal);
    if (typeof localVal !== 'string') localVal = String(localVal);

    for (const [param, replacement] of Object.entries(params)) {
        enVal = enVal.replaceAll(`{${param}}`, String(replacement));
        localVal = localVal.replaceAll(`{${param}}`, String(replacement));
    }

    if (lang === 'en') return enVal;
    
    // Some keys might return identical in English (untranslated). If it's untranslated, just return English.
    if (localVal === key) return enVal;
    return localVal;
};

const LOCATION_TRANSLATIONS = {
    "Sambalpur": { "en": "Sambalpur", "hi": "संबलपुर", "ta": "சம்பல்பூர்", "te": "సంబల్పూర్", "bn": "সম্বলপুর", "mr": "संबलपूर", "pa": "ਸੰਬਲਪੁਰ", "gu": "સંબલપુર", "kn": "ಸಂಬಲ್ಪುರ", "ml": "സംബൽപൂർ" },
    "Odisha": { "en": "Odisha", "hi": "ओडिशा", "ta": "ஒடிசா", "te": "ఒడిశా", "bn": "ওড়িশা", "mr": "ओडिशा", "pa": "ਓਡੀਸ਼ਾ", "gu": "ઓડિશા", "kn": "ಒಡಿಶಾ", "ml": "ഒഡീഷ" },
    "Agra": { "en": "Agra", "hi": "आगरा", "ta": "ஆக்ரா", "te": "ఆగ్రా", "bn": "আগ্রা", "mr": "आग्रा", "pa": "ਆਗਰਾ", "gu": "આગરા", "kn": "ಆಗ್ರಾ", "ml": "ആഗ്ര" },
    "Uttar Pradesh": { "en": "Uttar Pradesh", "hi": "उत्तर प्रदेश", "ta": "உத்தரப் பிரதேசம்", "te": "ఉత్తర ప్రదేశ్", "bn": "উত্তরপ্রদেশ", "mr": "उत्तर प्रदेश", "pa": "ਉੱਤਰ ਪ੍ਰਦੇਸ਼", "gu": "ઉત્તર પ્રદેશ", "kn": "ಉತ್ತರ ಪ್ರದೇಶ", "ml": "ഉത്തർപ്രദേശ്" },
    "Ludhiana": { "en": "Ludhiana", "hi": "लुधियाना", "ta": "லுதியானா", "te": "లుధియానా", "bn": "লুধিয়ানা", "mr": "लुधियाना", "pa": "ਲੁਧਿਆਣਾ", "gu": "લુધિયાણા", "kn": "ಲುಧಿಯಾನಾ", "ml": "ലുധിയാന" },
    "Punjab": { "en": "Punjab", "hi": "पंजाब", "ta": "பஞ்சாப்", "te": "పంజాబ్", "bn": "পাঞ্জাব", "mr": "पंजाब", "pa": "ਪੰਜਾਬ", "gu": "પંજાબ", "kn": "ಪಂಜಾಬ್", "ml": "പഞ്ചാബ്" },
    "Nashik": { "en": "Nashik", "hi": "नाशिक", "ta": "நாசிக்", "te": "నాసిక్", "bn": "নাশিক", "mr": "नाशिक", "pa": "ਨਾਸਿਕ", "gu": "નાશિક", "kn": "ನಾಸಿಕ್", "ml": "നാസിക്" },
    "Maharashtra": { "en": "Maharashtra", "hi": "महाराष्ट्र", "ta": "மகாராஷ்டிரா", "te": "మహారాష్ట్ర", "bn": "মহারাষ্ট্র", "mr": "महाराष्ट्र", "pa": "ਮਹਾਰਾਸ਼ਟਰ", "gu": "મહારાષ્ટ્ર", "kn": "ಮಹಾರಾಷ್ಟ್ರ", "ml": "മഹാരാഷ്ട്ര" },
    "Guntur": { "en": "Guntur", "hi": "गुंटूर", "ta": "குண்டூர்", "te": "గుంటూరు", "bn": "গুন্টুর", "mr": "गुंटूर", "pa": "ਗੁੰਟੂਰ", "gu": "ગુંટુર", "kn": "ಗುಂಟೂರು", "ml": "ഗുണ്ടൂർ" },
    "Andhra Pradesh": { "en": "Andhra Pradesh", "hi": "आंध्र प्रदेश", "ta": "ஆந்திரப் பிரதேசம்", "te": "ఆంధ్రప్రదేశ్", "bn": "অন্ধ্রপ্রদেশ", "mr": "आंध्र प्रदेश", "pa": "ਆਂਧરા ਪ੍ਰਦੇਸ਼", "gu": "આંધ્ર પ્રદેશ", "kn": "ಆಂಧ್ರ ಪ್ರದೇಶ", "ml": "ആന്ധ്രാപ്രദേശ്" },
    "Villupuram": { "en": "Villupuram", "hi": "विल्लुपुरम", "ta": "விழுப்புரம்", "te": "విళ్ళుపురం", "bn": "ভিন্নুপুরম", "mr": "विल्लुपुरम", "pa": "ਵਿਲੁਪੁਰਮ", "gu": "વિલ્લુપુરમ", "kn": "ವಿழுப்புರಂ", "ml": "വിഴുപ്പുറം" },
    "Tamil Nadu": { "en": "Tamil Nadu", "hi": "तमिलनाडु", "ta": "தமிழ்நாடு", "te": "తమిళనాడు", "bn": "তামিলনাড়ু", "mr": "तमिळनाडू", "pa": "ਤਮਿਲਨਾਡੂ", "gu": "તમિલનાડુ", "kn": "ತಮಿಳುನಾಡು", "ml": "തമിഴ്നാട്" },
    "Wheat": { "en": "Wheat", "hi": "गेहूँ", "ta": "கோதுமை", "te": "గోధుమ", "bn": "গম", "mr": "गहू", "pa": "ਕਣਕ", "gu": "ઘઉં", "kn": "ಗೋಧಿ", "ml": "ഗോതമ്പ്" },
    "Rice": { "en": "Rice", "hi": "चावल", "ta": "அரிசி", "te": "వరి", "bn": "চাল", "mr": "तांदूळ", "pa": "ਚੌਲ", "gu": "ચોખા", "kn": "ಅಕ್ಕಿ", "ml": "അരി" },
    "Cotton": { "en": "Cotton", "hi": "कपास", "ta": "பருத்தி", "te": "పత్తి", "bn": "তুলা", "mr": "कापूस", "pa": "ਕਪਾਹ", "gu": "કપાસ", "kn": "ಹತ್ತಿ", "ml": "പരുത്തി" },
    "Groundnut": { "en": "Groundnut", "hi": "मूंगफली", "ta": "நிலக்கடலை", "te": "వేరుశెనగ", "bn": "চিনাবাদাম", "mr": "भुईमूग", "pa": "ਮੂੰਗਫਲੀ", "gu": "મગફળી", "kn": "ಕಡಲೆಕಾಯಿ", "ml": "നിലക്കടല" },
    "Sorghum": { "en": "Sorghum", "hi": "ज्वार", "ta": "சோளம்", "te": "జొన్న", "bn": "জোয়ার", "mr": "ज्वारी", "pa": "ਜਵਾਰ", "gu": "જુવાર", "kn": "ಜೋಳ", "ml": "ചോളം" }
};
const NO_LAND_TEXT = {
  en: ['No land detected', 'AI advisory is unavailable for water bodies.'],
  hi: ['भूमि नहीं मिली', 'जल निकायों के लिए AI सलाह उपलब्ध नहीं है।'],
  ta: ['நிலம் கண்டறியப்படவில்லை', 'நீர்நிலைகளுக்கு AI ஆலோசனை கிடைக்காது.'],
  te: ['భూమి గుర్తించబడలేదు', 'నీటి వనరులకు AI సలహా అందుబాటులో లేదు.'],
  bn: ['কোনও জমি শনাক্ত হয়নি', 'জলাশয়ের জন্য AI পরামর্শ উপলভ্য নয়।'],
  mr: ['जमीन आढळली नाही', 'जलाशयांसाठी AI सल्ला उपलब्ध नाही.'],
  pa: ['ਕੋਈ ਜ਼ਮੀਨ ਨਹੀਂ ਮਿਲੀ', 'ਜਲ ਸਰੋਤਾਂ ਲਈ AI ਸਲਾਹ ਉਪਲਬਧ ਨਹੀਂ ਹੈ।'],
  gu: ['જમીન મળી નથી', 'જળાશયો માટે AI સલાહ ઉપલબ્ધ નથી.'],
  kn: ['ಭೂಮಿ ಪತ್ತೆಯಾಗಿಲ್ಲ', 'ಜಲಮೂಲಗಳಿಗೆ AI ಸಲಹೆ ಲಭ್ಯವಿಲ್ಲ.'],
  ml: ['കര കണ്ടെത്തിയില്ല', 'ജലാശയങ്ങൾക്ക് AI ഉപദേശം ലഭ്യമല്ല.']
};

window.localizePlace = function(name, language = currentLanguage) {
    if(!name) return "";
    const enStr = LOCATION_TRANSLATIONS[name]?.en || name;
    if (language === 'en') return enStr;
    const localStr = LOCATION_TRANSLATIONS[name]?.[language] || enStr;
    return localStr;
};

// Also redefine localizeLocation to handle structured "City, State"
window.localizeLocation = function(locStr) {
    if(!locStr) return "";
    let parts = locStr.split(',').map(s => s.trim());
    if (parts.length === 2) {
         return `${window.localizePlace(parts[0])}, ${window.localizePlace(parts[1])}`;
    }
    return window.localizePlace(locStr);
};


// Init Map
const map = L.map('map').setView([22.5, 79], 4.6);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap'
}).addTo(map);

function place(lat, lon) {
  if(pin) map.removeLayer(pin);
  pin = L.marker([lat, lon]).addTo(map);
  $('pin-coords').textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  if ($('lat-input')) $('lat-input').value = lat.toFixed(4);
  if ($('lon-input')) $('lon-input').value = lon.toFixed(4);
}
function normalizeLongitude(lon) {
    return ((Number(lon) + 180) % 360 + 360) % 360 - 180;
}

const indiaBounds = L.latLngBounds([6, 67], [38, 98]);
map.setMaxBounds(indiaBounds.pad(0.08));
map.on('click', e => {
    const lat = Number(e.latlng.lat);
    const lon = normalizeLongitude(e.latlng.lng);
    if (lat < 6 || lat > 38 || lon < 67 || lon > 98) return;
    place(lat, lon);
});

// Init and I18N wiring
document.addEventListener('DOMContentLoaded', () => {
  $('lang').value = currentLanguage;
  updateUI();
  
  $('lang').addEventListener('change', (e) => {
    changeLanguage(e.target.value);
  });
  
  init();
});




let currentScenarios = null;

function renderScenarios() {
  if (!currentScenarios) return;
  $('scenario-list').innerHTML = currentScenarios.scenarios.map(s => `
      <div class="scenario-btn" onclick="runScenario('${s.key}', ${s.lat}, ${s.lon})">
        <span class="badge badge-demo" style="margin-bottom:8px">${window.t('demoBadge') || 'DEMO'}</span>
        <div class="sb-title">${esc(window.localizeLocation(s.name))}</div>
        <div class="sb-sub">${esc(window.localizePlace(s.crop))}</div>
      </div>
    `).join('');
}

function updateUI() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    let translated = window.t(key);
    if (translated !== key) {
      if (el.children.length === 0) {
         el.textContent = translated;
      } else {
         el.innerHTML = translated;
      }
    }
  });
  
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    let translated = window.t(key);
    if (translated !== key) el.placeholder = translated;
  });

  renderScenarios();

  
  // Contextual Dynamic UIs
  if (currentFieldState && currentFieldState.field.crop) {
    $('f-crop').textContent = `${window.t('declaredCrop') || 'Declared Crop: '} ${currentFieldState.field.crop}`;
  } else if (currentFieldState) {
     $('f-crop').textContent = window.t('unknownCrop') || 'Unknown Crop';
  }
  
  // Re-render Dynamic field contents and badging (health, evidence, badging if present)
  if (currentAnalysisResponse) {
    renderField(currentAnalysisResponse); 
  }
  
  // Re-render Advisory
  if (currentAdvisory) {
    renderAdvisory(currentAdvisory);
  }
  
  // Re-render Dx
  if (lastDxResult) {
     renderDx(lastDxResult);
  }
}

async function changeLanguage(lang) {
  currentLanguage = lang;
  document.documentElement.lang = lang;
  localStorage.setItem('agrinet_language', lang);
  updateUI(); // Immediately shift static UI
  
  // Triger re-generation if context exists
  if (currentAdvisory) {
     await regenerateAdvisory();
  }
  
  if (lastDxResult && $('dx-file').files[0]) {
     await regenerateDx();
  }
}


// Navigation
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    e.target.classList.add('active');
    $(e.target.dataset.target).classList.add('active');
  });
});

// API Helpers
async function apiPost(url, body, isForm=false) {
  const opts = { method: 'POST', body: isForm ? body : JSON.stringify(body) };
  if(!isForm) opts.headers = { 'Content-Type': 'application/json' };
  const r = await fetch(url, opts);
  const j = await r.json();
  if(!r.ok) throw new Error(j.detail || r.statusText);
  return j;
}

async function apiGet(url) {
  const r = await fetch(url);
  return await r.json();
}

function buildWhy(r, btnText) {
  if(!r.evidence_ids || !r.evidence_ids.length) return '';
  return `
    <button class="why-toggle" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'block' ? 'none' : 'block'">
      <span>${esc(btnText || 'WHY?')}</span> <span>▾</span>
    </button>
    <div class="why-content">
      ${esc(r.reason)}
      <div style="margin-top:8px">
        ${r.evidence_ids.map(id => `<span class="evidence-tag">${esc(id)}</span>`).join('')}
      </div>
    </div>
  `;
}

// App Initialization
async function init() {
  try {
        const hc = await apiGet('/api/health');
    $('sys-status').innerHTML = `
      <div style="width:8px;height:8px;border-radius:50%;background:var(--health-good)"></div>
      ${esc(window.t('apiOnline'))} | ${hc.ai_configured ? esc(window.t('aiConnected')) : esc(window.t('aiOffline'))}
    `;

    const man = await apiGet('/api/v1/manifest');
    $('manifest-out').textContent = JSON.stringify(man, null, 2);

    currentScenarios = await apiGet('/api/scenarios');
    renderScenarios();

  } catch (e) {
        $('sys-status').innerHTML = `<span style="color:var(--health-poor)">${window.t('sysError')} ${e.message}</span>`;
  }
}

// Run Analysis
async function runScenario(key, lat, lon) {
  place(lat, lon);
  map.setView([lat, lon], 10);
  await analyzeField({ lat, lon, scenario_key: key, is_demo: true });
}

$('btn-analyze').onclick = async () => {
  if(!pin) return alert('Tap map first');
  const {lat, lng} = pin.getLatLng();
  const lon = normalizeLongitude(lng);
  await analyzeField({ lat, lon, crop: $('crop-input').value, is_demo: false });
};

async function analyzeField(req) {
  req.lang = currentLanguage;
  $('btn-analyze').disabled = true;
    $('btn-analyze').textContent = window.t('analyzingBtn');
  
  try {
    currentAnalysisResponse = await apiPost('/api/v1/analyze', req);
    currentFieldState = currentAnalysisResponse.field_state;
    // Wipe advisory on new field
    currentAdvisory = null;
    $('adv-content').style.display = 'none';
    $('adv-empty').style.display = 'block';
    
    renderField(currentAnalysisResponse);
    document.querySelector('[data-target="view-field"]').click();
  } catch(e) {
    alert(e.message);
  } finally {
    $('btn-analyze').disabled = false;
    $('btn-analyze').textContent = window.t('analyzeBtn');
  }
}

function renderField(res) {
    const fs = res.field_state;
  const evidence = res.evidence;
  const provenance = res.provenance;
  
  $('field-empty').style.display = 'none';
  $('field-content').style.display = 'block';
  if (!currentAdvisory) $('adv-empty').style.display = 'block';
  
  const v = provenance.satellite_badge;
  let bClass = v==='LIVE'?'badge-live':v==='MODEL'?'badge-model':v==='DEMO'?'badge-demo':'badge-err';
  $('f-badge-mode').className = `badge ${bClass}`;
  
  if (provenance.data_status === 'DEMO' && provenance.scenario_date) {
    $('f-badge-mode').textContent = `${window.t('demoBadge')} · ${window.t('historicalSnapshot') || 'Historical snapshot'} · ${provenance.scenario_date}`;
  } else {
    $('f-badge-mode').textContent = String(v).toLowerCase() === 'precomputed' ? window.t('precomputedBadge') : window.t(String(v).toLowerCase() + 'Badge');
  }
  
  $('f-geohash').textContent = `${window.t('geohash')} ${fs.field.geohash}`;
  $('f-location').textContent = `${fs.field.lat.toFixed(4)}, ${fs.field.lon.toFixed(4)}`;
  $('f-crop').textContent = fs.field.crop ? `${window.t('declaredCrop')} ${esc(fs.field.crop)}` : window.t('unknownCrop');

  const h = fs.health;
  const ring = $('f-health-ring');
  if(h.score !== null) {
    ring.dataset.status = h.status;
    $('f-health-score').textContent = h.score;
    $('f-health-status').textContent = window.t('status_' + h.status) || h.status.toUpperCase();
    $('f-health-status').style.color = ring.dataset.status === 'healthy' ? 'var(--health-good)' : ring.dataset.status === 'watch' ? 'var(--health-watch)' : 'var(--health-poor)';
    
    $('f-health-comps').innerHTML = Object.entries(h.components).map(([k,val]) => `
      <div class="data-point">
        <span class="dp-label" style="text-transform:capitalize">${window.t('health_' + k) || k}</span>
        <span class="dp-val">${val ?? '--'}</span>
      </div>
    `).join('');
  } else {
    $('f-health-score').textContent = '--';
    $('f-health-status').textContent = h.status === 'no_land_detected' ? NO_LAND_TEXT[currentLanguage][0] : (window.t('status_unknown') || 'UNAVAILABLE');
    $('f-health-comps').innerHTML = '';
  }

  $('f-evidence-list').innerHTML = evidence.map(e => {
    const ebadge = e.badge || 'UNAVAILABLE';
    const bClass = ebadge==='LIVE'?'badge-live':ebadge==='MODEL'?'badge-model':ebadge==='DEMO'?'badge-demo':'badge-pre';
    let localBadge = String(ebadge).toLowerCase() === 'precomputed' ? window.t('precomputedBadge') : window.t(String(ebadge).toLowerCase() + 'Badge');
    
    let localIndicator = window.t(e.indicator_key) || e.indicator;
    let localInterpretation = e.interpretation_key ? window.t(e.interpretation_key, {val: String(e.value)}) : e.interpretation;
    
    return `
    <div style="padding: 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 8px;">
      <div style="display:flex; justify-content:space-between; margin-bottom: 4px;">
        <code style="font-size:11px; color:var(--text-muted);">${e.id}</code>
        <span class="badge ${bClass}">${localBadge}</span>
      </div>
      <div style="font-weight:600; font-size:14px;">${esc(localIndicator)}: ${esc(e.value)} ${esc(e.unit)}</div>
      <div style="font-size:13px; color:var(--text-muted); margin-top:2px;">${esc(localInterpretation)}</div>
      <div style="font-size:11px; color:var(--text-light); margin-top:4px;">${window.t('source')} ${esc(e.source)}</div>
    </div>
  `}).join('');
}

// AI Advisory
$('btn-gen-adv').onclick = async () => {
  if(!currentFieldState) return;
  document.querySelector('[data-target="view-advisory"]').click();
  await regenerateAdvisory();
};

async function regenerateAdvisory() {
   if (String(currentFieldState?.land_cover?.class || '').toLowerCase().replaceAll('_', ' ') === 'water') {
     currentAdvisory = null;
     $('adv-loading').style.display = 'none';
     $('adv-empty').textContent = NO_LAND_TEXT[currentLanguage][1];
     $('adv-empty').style.display = 'block';
     $('adv-content').style.display = 'none';
     return;
   }
   const expectedReqId = ++advisoryRequestId;
   
   $('adv-empty').style.display = 'none';
   
   // Update loading text translation dynamically
      // Check if we are updating an existing advisory or generating new
   if (currentAdvisory) {
      $('adv-loading').innerHTML = `<div class="loader" style="width:40px;height:40px;margin-bottom:20px;"></div><p style="color:var(--text-muted); margin-top:8px;">${window.t('updatingAdvisory')}</p>`;
      $('adv-content').style.opacity = '0.5';
   } else {
      $('adv-loading').innerHTML = `<div class="loader" style="width:40px;height:40px;margin-bottom:20px;"></div><h3 style="font-family:var(--font-display);">${window.t('advLoadingTitle')}</h3><p style="color:var(--text-muted); margin-top:8px;">${window.t('advLoadingDesc')}</p>`;
      $('adv-content').style.display = 'none';
   }
   
   $('adv-loading').style.display = 'block';
   
   try {
    const adv = await apiPost('/api/v1/advisory', {
      field_state: currentAnalysisResponse.field_state,
      evidence: currentAnalysisResponse.evidence,
      lang: currentLanguage
    });
    
    if (expectedReqId !== advisoryRequestId) return; // Stale protection
    currentAdvisory = adv;
    
    renderAdvisory(currentAdvisory);
  } catch(e) {
    if (expectedReqId !== advisoryRequestId) return; 
    alert(e.message);
    if (!currentAdvisory) $('adv-empty').style.display = 'block';
  } finally {
    if (expectedReqId === advisoryRequestId) {
       $('adv-loading').style.display = 'none';
       $('adv-content').style.opacity = '1';
    }
  }
}


function renderAdvisory(a) {
  $('adv-content').style.display = 'block';
  $('btn-speak').disabled = false;
  
  const buildSec = (titleKey, contentHtml, isCollapsible=false) => {
      if(!contentHtml) return '';
      const title = esc(window.t(titleKey));
      if(isCollapsible) {
         return `<details style="margin-bottom:12px; padding:12px; background:#f9fafb; border: 1px solid var(--border); border-radius:6px; cursor:pointer;">
           <summary style="font-weight:600; color:var(--primary); font-size:14px;">${title}</summary>
           <div style="margin-top:12px; font-size:14px;">${contentHtml}</div>
         </details>`;
      }
      return `<div style="margin-bottom:24px;">
         <h3 class="card-title" style="margin-bottom:12px; font-size:16px;">${title}</h3>
         ${contentHtml}
      </div>`;
  };

  const safeMap = (arr, fn) => {
      if(!arr || !arr.length) return `<p class="dp-label">${window.t('adv_no_data')}</p>`;
      return arr.map(fn).join('');
  };

  const evidMap = (arr) => arr?.length ? `<div style="margin-top:6px;">${arr.map(id => `<span class="evidence-tag" style="font-size:11px; margin-right:4px;">${id}</span>`).join('')}</div>` : '';

  let html = '';
  
  // Field Status
  html += buildSec('sec_field_status', `
     <p style="font-weight:600; margin-bottom:4px; font-size: 16px;">${esc(window.localizeEnum(a.field_status?.status, 'status') || '')}</p>
     <p>${esc(a.field_status?.explanation || '')}</p>
  `, false);
  
  // What Data Shows
  html += buildSec('sec_what_data_shows', safeMap(a.what_the_data_shows, r => `
    <div style="padding:12px; border-bottom:1px solid #eee;">
      <div style="font-weight:500;">${esc(r.observation)}</div>
      <div style="font-size:13px; color:#666; margin-top:2px;">${esc(r.importance)}</div>
      ${r.evidence_id ? evidMap([r.evidence_id]) : ''}
    </div>
  `));
  
  // Risks
  html += buildSec('sec_priority_risks', safeMap(a.priority_risks, r => `
    <div style="padding:12px; background:#fef2f2; border:1px solid #fecaca; border-radius:6px; margin-bottom:8px;">
      <div style="font-weight:600; color:#991b1b; font-size:14px;">${esc(r.risk)} <span class="badge badge-err" style="float:right">${esc(window.localizeEnum(r.severity, 'severity'))}</span></div>
      <p style="margin-top:4px;">${esc(r.why_it_matters)}</p>
      ${evidMap(r.evidence_ids)}
    </div>
  `));
  
  // Immediate Actions
  html += buildSec('sec_immediate_actions', safeMap(a.immediate_actions, r => `
    <div style="padding:12px; background:var(--bg); border:1px solid var(--border); border-radius:6px; margin-bottom:8px; border-left: 4px solid var(--primary);">
       <div style="font-weight:600; font-size:14px;">${esc(r.action)} <span class="badge badge-live" style="float:right">${esc(window.localizeEnum(r.timing, "priority"))}</span></div>
       <p style="margin-top:8px;">${esc(r.reason)}</p>
    </div>
  `));
  
  // Weather Responses
  html += buildSec('sec_weather_response', safeMap(a.weather_response, r => `
    <div style="margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:8px;">
       <div style="font-weight:600;">${esc(r.condition)}</div>
       <div>${esc(r.action)} <span style="font-size:12px; color:#666;">(${esc(r.timing)})</span></div>
    </div>
  `), true);
  
  // Soil Management
  html += buildSec('sec_soil_management', safeMap(a.soil_management, r => `
    <div style="margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:8px;">
       <div style="font-weight:600;">${esc(r.action)}</div>
       <div>${esc(r.reason)} <span style="font-size:12px; color:#666;">(${esc(r.timing)})</span></div>
    </div>
  `), true);
  
  // Crop Management
  html += buildSec('sec_crop_management', safeMap(a.crop_management, r => `
    <div style="margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:8px;">
       <div style="font-weight:600;">${esc(r.action)}</div>
       <div>${esc(r.reason)}</div>
    </div>
  `), true);

  // Regen Actions
  html += buildSec('sec_regen_actions', safeMap(a.regenerative_actions, r => `
    <div style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid #eee;">
       <div style="font-weight:600;">🌱 ${esc(r.practice)}</div>
       <p style="font-size: 13px; margin-top:2px;">${esc(r.how_to_apply)}</p>
       <div style="font-size:12px; color:#666; margin-top:2px;">Benefit: ${esc(r.benefit)} | Timing: ${esc(r.timing)}</div>
    </div>
  `), true);

  // Crop Options
  html += buildSec('sec_crop_options', safeMap(a.crop_options, r => `
    <div style="margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:8px;">
       <div style="font-weight:600;">${esc(r.crop)} <span class="badge ${String(r.suitability).toLowerCase()==='high'?'badge-live':'badge-model'}">${esc(r.suitability)}</span></div>
       <div style="margin-top:2px; font-size:13px;">${esc(r.reason)}</div>
       <div style="font-size:12px; color:#666; margin-top:2px;">Conditions: ${esc(r.conditions)}</div>
    </div>
  `), true);
  
  // Monitoring Plan
  html += buildSec('sec_monitoring_plan', safeMap(a.monitoring_plan, r => `
    <div style="margin-bottom:8px; padding-bottom:8px;">
       <div><strong style="color:var(--text-main)">${esc(r.indicator)}</strong>: ${esc(r.what_to_watch)}</div>
       <div style="font-size:12px; color:#666; margin-top:2px;">Check: ${esc(r.when_to_check)}</div>
       <div style="font-size:13px; color:#991b1b; margin-top:2px;">If occurs: ${esc(r.action_if_condition_occurs)}</div>
    </div>
  `), true);
  
  // Why this advice matches
  html += buildSec('sec_why_advice', safeMap(a.why_this_advice, r => `
    <div style="margin-bottom:8px; padding:12px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:6px;">
       <div style="font-weight:500;">${esc(r.recommendation)}</div>
       <p style="margin-top:4px; font-size:13px;">${esc(r.reasoning)}</p>
       ${evidMap(r.evidence_ids)}
    </div>
  `), true);

  const container = $('adv-content');
  container.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 24px;">
        <h2 class="card-title" style="font-size: 22px; color: var(--primary);">${esc(window.t('localizedAdvisory'))}</h2>
        <button class="btn btn-secondary" id="btn-speak">${esc(window.t('listen'))}</button>
      </div>`;
  
  container.innerHTML += `<p style="font-size:16px; margin-bottom: 24px;">${esc(a.summary || '')}</p>`;
  
  const dynBox = document.createElement('div');
  dynBox.innerHTML = html;
  
  // Meta block
  const meta = document.createElement('div');
  meta.style.marginTop = '24px';
  meta.style.padding = '12px';
  meta.style.background = '#f3f4f6';
  meta.style.borderRadius = 'var(--radius-sm)';
  meta.style.fontSize = '13px';
  meta.innerHTML = `<strong style="color:#b45309;"><span data-i18n="sec_when_expert">${esc(window.t('sec_when_expert'))}</span>:</strong> <span>${esc(a.when_to_seek_expert_help || '')}</span><br>
  <strong style="color:var(--text-main); margin-top:8px; display:inline-block;"><span data-i18n="sec_confidence">${esc(window.t('sec_confidence'))}</span>:</strong> <span>${esc(a.confidence_note || '')}</span>`;
  
  dynBox.appendChild(meta);
  container.appendChild(dynBox);

  $('btn-speak').onclick = speakAdvisory;
}

// Voice
const VOICE = {en:'en-IN',hi:'hi-IN',ta:'ta-IN',te:'te-IN',bn:'bn-IN',mr:'mr-IN',pa:'pa-IN',gu:'gu-IN',kn:'kn-IN',ml:'ml-IN'};
function speakAdvisory() {
  if (!currentAdvisory || !('speechSynthesis' in window)) return;
  const collect = value => Array.isArray(value) ? value.flatMap(collect)
    : value && typeof value === 'object' ? Object.values(value).flatMap(collect)
    : typeof value === 'string' ? [value] : [];
  const payload = collect(currentAdvisory).join('. ').trim();
  if (!payload) return;
  speechSynthesis.cancel();
  const langPrefix = currentLanguage.toLowerCase();
  const voice = speechSynthesis.getVoices().find(item => item.lang.toLowerCase().startsWith(langPrefix));
  const chunks = payload.match(/[^.!?।]+[.!?।]*/g) || [payload];
  let pending = '';
  for (const sentence of chunks) {
    if (pending.length + sentence.length > 220 && pending) {
      queueSpeech(pending, voice);
      pending = '';
    }
    pending += `${sentence} `;
  }
  if (pending.trim()) queueSpeech(pending, voice);
}

function queueSpeech(text, voice) {
  const utterance = new SpeechSynthesisUtterance(text.trim());
  utterance.lang = VOICE[currentLanguage] || 'en-IN';
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}

// Crop Doctor
$('dx-drop').onclick = () => $('dx-file').click();
$('dx-file').onchange = (e) => {
  if(e.target.files[0]) {
    $('dx-preview').src = URL.createObjectURL(e.target.files[0]);
    $('dx-preview').style.display = 'block';
    // Remove previous result context when image changes
    lastDxResult = null;
    $('dx-res').style.display = 'none';
  }
};

$('btn-dx').onclick = async () => {
  if(!$('dx-file').files[0]) return alert('Choose photo first');
  await regenerateDx();
};

async function regenerateDx() {
  const expectedReqId = ++dxRequestId;
  const f = $('dx-file').files[0];
    
  $('dx-empty').style.display = 'none';
  if (lastDxResult) {
       $('dx-loading').innerHTML = `<div class="loader"></div><p style="margin-top:12px;">${window.t('updatingDx')}</p>`;
       $('dx-res').style.opacity = '0.5';
  } else {
       $('dx-loading').innerHTML = `<div class="loader"></div><p style="margin-top:12px;">${window.t('dxLoading')}</p>`;
       $('dx-res').style.display = 'none';
  }
  
  $('dx-loading').style.display = 'block';
  $('btn-dx').disabled = true;
  
  const fd = new FormData();
  fd.append('image', f);
  fd.append('lang', currentLanguage);
  fd.append('crop', $('dx-crop').value);
  if(currentFieldState) fd.append('field_context_json', JSON.stringify(currentFieldState));
  
  try {
    const d = await apiPost('/api/v1/diagnose', fd, true);
    if (expectedReqId !== dxRequestId) return; 
    
    lastDxResult = d;
    renderDx(d);
    
  } catch(e) {
    if (expectedReqId !== dxRequestId) return; 
    alert(e.message);
    if(!lastDxResult) $('dx-empty').style.display = 'block';
  } finally {
    if (expectedReqId === dxRequestId) {
       $('dx-loading').style.display = 'none';
       $('dx-res').style.opacity = '1';
       $('btn-dx').disabled = false;
    }
  }
}

function renderDx(d) {
    $('dx-badge').className = `badge ${d.healthy ? 'badge-live' : 'badge-err'}`;
    $('dx-badge').textContent = d.healthy ? (window.t('status_healthy') || 'HEALTHY') : (window.t('status_issue') || 'ISSUE DETECTED');
    $('dx-conf').textContent = `${window.t('dx_conf') || 'Conf:'} ${window.localizeEnum(d.confidence, 'confidence').toUpperCase()}`;
    
    $('dx-issue').textContent = d.likely_issue;
    $('dx-diag').textContent = d.diagnosis;
    
    const list = (arr) => arr?.length ? arr.join(', ') : 'None';
  $('dx-sym').textContent = list(d.observed_symptoms);
    $('dx-act').textContent = list(d.recommended_action);
    $('dx-exp').textContent = d.expert_escalation || (window.t('dx_monitor') || 'Monitor closely.');
    
    $('dx-res').style.display = 'block';
}


function handleManualCoord() {
    let lat = parseFloat($('lat-input').value);
    let lon = parseFloat($('lon-input').value);
    if (!isNaN(lat) && !isNaN(lon)) {
        lon = normalizeLongitude(lon);
        if(pin) map.removeLayer(pin);
        pin = L.marker([lat, lon]).addTo(map);
        $('pin-coords').textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        map.setView([lat, lon]);
    }
}
document.addEventListener('DOMContentLoaded', () => {
    if ($('lat-input')) $('lat-input').addEventListener('change', handleManualCoord);
    if ($('lon-input')) $('lon-input').addEventListener('change', handleManualCoord);
    // Bind Enter key as well
    if ($('lat-input')) $('lat-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') handleManualCoord(); });
    if ($('lon-input')) $('lon-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') handleManualCoord(); });
});

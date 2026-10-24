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
let advisoryAbortController = null;
let dxAbortController = null;

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
const noLandText = i => (NO_LAND_TEXT[currentLanguage] || NO_LAND_TEXT.en)[i];

// Status / error strings used by the async flows (lang.js still carries English placeholders for several of these).
const UI_EXTRA_KEYS = ['updatingAdvisory', 'updatingDx', 'stop', 'noVoice', 'timeout', 'failed', 'tapMapFirst', 'choosePhoto'];
const UI_EXTRA = {
  en: ['Updating advisory in the selected language…', 'Updating diagnosis in the selected language…', '⏹ Stop', 'No voice for this language is installed on this device; playback may be silent or use another voice.', 'The request took too long. Please try again.', 'Request failed:', 'Tap the map to place a pin first.', 'Choose a photo first.'],
  hi: ['चुनी गई भाषा में सलाह अपडेट हो रही है…', 'चुनी गई भाषा में निदान अपडेट हो रहा है…', '⏹ रोकें', 'इस डिवाइस पर इस भाषा की आवाज़ इंस्टॉल नहीं है; ऑडियो शांत रह सकता है या दूसरी आवाज़ में चल सकता है।', 'अनुरोध में बहुत समय लगा। कृपया फिर से प्रयास करें।', 'अनुरोध विफल:', 'पहले नक्शे पर टैप करके पिन लगाएँ।', 'पहले फ़ोटो चुनें।'],
  ta: ['தேர்ந்தெடுத்த மொழியில் ஆலோசனை புதுப்பிக்கப்படுகிறது…', 'தேர்ந்தெடுத்த மொழியில் நோயறிதல் புதுப்பிக்கப்படுகிறது…', '⏹ நிறுத்து', 'இந்த சாதனத்தில் இந்த மொழிக்கான குரல் நிறுவப்படவில்லை; ஒலி வராமல் போகலாம் அல்லது வேறு குரலில் ஒலிக்கலாம்.', 'கோரிக்கைக்கு அதிக நேரம் ஆனது. மீண்டும் முயலவும்.', 'கோரிக்கை தோல்வியடைந்தது:', 'முதலில் வரைபடத்தில் தட்டி பின் வைக்கவும்.', 'முதலில் புகைப்படத்தைத் தேர்ந்தெடுக்கவும்.'],
  te: ['ఎంచుకున్న భాషలో సలహా నవీకరించబడుతోంది…', 'ఎంచుకున్న భాషలో నిర్ధారణ నవీకరించబడుతోంది…', '⏹ ఆపు', 'ఈ పరికరంలో ఈ భాషకు వాయిస్ ఇన్‌స్టాల్ కాలేదు; ఆడియో వినిపించకపోవచ్చు లేదా వేరే వాయిస్‌లో రావచ్చు.', 'అభ్యర్థనకు చాలా సమయం పట్టింది. దయచేసి మళ్లీ ప్రయత్నించండి.', 'అభ్యర్థన విఫలమైంది:', 'ముందుగా మ్యాప్‌పై నొక్కి పిన్ ఉంచండి.', 'ముందుగా ఫోటోను ఎంచుకోండి.'],
  bn: ['নির্বাচিত ভাষায় পরামর্শ হালনাগাদ হচ্ছে…', 'নির্বাচিত ভাষায় রোগনির্ণয় হালনাগাদ হচ্ছে…', '⏹ থামান', 'এই ডিভাইসে এই ভাষার কণ্ঠস্বর ইনস্টল করা নেই; অডিও নীরব থাকতে পারে বা অন্য কণ্ঠে বাজতে পারে।', 'অনুরোধে অনেক সময় লেগেছে। আবার চেষ্টা করুন।', 'অনুরোধ ব্যর্থ হয়েছে:', 'প্রথমে মানচিত্রে ট্যাপ করে পিন বসান।', 'প্রথমে একটি ছবি বেছে নিন।'],
  mr: ['निवडलेल्या भाषेत सल्ला अद्ययावत होत आहे…', 'निवडलेल्या भाषेत निदान अद्ययावत होत आहे…', '⏹ थांबवा', 'या डिव्हाइसवर या भाषेचा आवाज इंस्टॉल नाही; ऑडिओ शांत राहू शकतो किंवा दुसऱ्या आवाजात वाजू शकतो.', 'विनंतीला खूप वेळ लागला. कृपया पुन्हा प्रयत्न करा.', 'विनंती अयशस्वी:', 'आधी नकाशावर टॅप करून पिन लावा.', 'आधी फोटो निवडा.'],
  pa: ['ਚੁਣੀ ਭਾਸ਼ਾ ਵਿੱਚ ਸਲਾਹ ਅੱਪਡੇਟ ਹੋ ਰਹੀ ਹੈ…', 'ਚੁਣੀ ਭਾਸ਼ਾ ਵਿੱਚ ਨਿਦਾਨ ਅੱਪਡੇਟ ਹੋ ਰਿਹਾ ਹੈ…', '⏹ ਰੋਕੋ', "ਇਸ ਡਿਵਾਈਸ 'ਤੇ ਇਸ ਭਾਸ਼ਾ ਦੀ ਆਵਾਜ਼ ਇੰਸਟਾਲ ਨਹੀਂ ਹੈ; ਆਡੀਓ ਚੁੱਪ ਰਹਿ ਸਕਦਾ ਹੈ ਜਾਂ ਹੋਰ ਆਵਾਜ਼ ਵਿੱਚ ਚੱਲ ਸਕਦਾ ਹੈ।", 'ਬੇਨਤੀ ਨੂੰ ਬਹੁਤ ਸਮਾਂ ਲੱਗਿਆ। ਕਿਰਪਾ ਕਰਕੇ ਮੁੜ ਕੋਸ਼ਿਸ਼ ਕਰੋ।', 'ਬੇਨਤੀ ਅਸਫਲ:', "ਪਹਿਲਾਂ ਨਕਸ਼ੇ 'ਤੇ ਟੈਪ ਕਰਕੇ ਪਿੰਨ ਲਗਾਓ।", 'ਪਹਿਲਾਂ ਫੋਟੋ ਚੁਣੋ।'],
  gu: ['પસંદ કરેલી ભાષામાં સલાહ અપડેટ થઈ રહી છે…', 'પસંદ કરેલી ભાષામાં નિદાન અપડેટ થઈ રહ્યું છે…', '⏹ રોકો', 'આ ઉપકરણ પર આ ભાષાનો અવાજ ઇન્સ્ટોલ નથી; ઑડિયો શાંત રહી શકે અથવા બીજા અવાજમાં વાગી શકે.', 'વિનંતીમાં ઘણો સમય લાગ્યો. કૃપા કરીને ફરી પ્રયાસ કરો.', 'વિનંતી નિષ્ફળ:', 'પહેલા નકશા પર ટૅપ કરીને પિન મૂકો.', 'પહેલા ફોટો પસંદ કરો.'],
  kn: ['ಆಯ್ಕೆ ಮಾಡಿದ ಭಾಷೆಯಲ್ಲಿ ಸಲಹೆ ನವೀಕರಿಸಲಾಗುತ್ತಿದೆ…', 'ಆಯ್ಕೆ ಮಾಡಿದ ಭಾಷೆಯಲ್ಲಿ ರೋಗನಿರ್ಣಯ ನವೀಕರಿಸಲಾಗುತ್ತಿದೆ…', '⏹ ನಿಲ್ಲಿಸಿ', 'ಈ ಸಾಧನದಲ್ಲಿ ಈ ಭಾಷೆಯ ಧ್ವನಿ ಸ್ಥಾಪಿಸಲಾಗಿಲ್ಲ; ಆಡಿಯೋ ಮೌನವಾಗಿರಬಹುದು ಅಥವಾ ಬೇರೆ ಧ್ವನಿಯಲ್ಲಿ ಕೇಳಬಹುದು.', 'ವಿನಂತಿಗೆ ತುಂಬಾ ಸಮಯ ಹಿಡಿಯಿತು. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.', 'ವಿನಂತಿ ವಿಫಲವಾಗಿದೆ:', 'ಮೊದಲು ನಕ್ಷೆಯ ಮೇಲೆ ಟ್ಯಾಪ್ ಮಾಡಿ ಪಿನ್ ಇರಿಸಿ.', 'ಮೊದಲು ಫೋಟೋ ಆಯ್ಕೆಮಾಡಿ.'],
  ml: ['തിരഞ്ഞെടുത്ത ഭാഷയിൽ ഉപദേശം പുതുക്കുന്നു…', 'തിരഞ്ഞെടുത്ത ഭാഷയിൽ രോഗനിർണയം പുതുക്കുന്നു…', '⏹ നിർത്തുക', 'ഈ ഉപകരണത്തിൽ ഈ ഭാഷയുടെ ശബ്ദം ഇൻസ്റ്റാൾ ചെയ്തിട്ടില്ല; ഓഡിയോ കേൾക്കാതിരിക്കാം അല്ലെങ്കിൽ മറ്റൊരു ശബ്ദത്തിൽ കേൾക്കാം.', 'അഭ്യർത്ഥനയ്ക്ക് വളരെ സമയമെടുത്തു. വീണ്ടും ശ്രമിക്കുക.', 'അഭ്യർത്ഥന പരാജയപ്പെട്ടു:', 'ആദ്യം മാപ്പിൽ ടാപ്പ് ചെയ്ത് പിൻ ഇടുക.', 'ആദ്യം ഒരു ഫോട്ടോ തിരഞ്ഞെടുക്കുക.']
};
const uiText = key => {
  const i = UI_EXTRA_KEYS.indexOf(key);
  return (UI_EXTRA[currentLanguage] || UI_EXTRA.en)[i] ?? UI_EXTRA.en[i];
};

// Non-blocking notice; replaces alert(), whose modal dialog froze the page while requests were still in flight.
function showNotice(message, kind = 'error') {
  let box = $('app-notice');
  if (!box) {
    box = document.createElement('div');
    box.id = 'app-notice';
    box.setAttribute('role', 'status');
    box.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(560px,calc(100% - 32px));padding:12px 16px;border-radius:8px;font-size:14px;box-shadow:0 6px 24px rgba(0,0,0,.18);z-index:9999;display:none;';
    document.body.appendChild(box);
  }
  box.style.background = kind === 'error' ? '#fef2f2' : '#eff6ff';
  box.style.color = kind === 'error' ? '#991b1b' : '#1e3a8a';
  box.style.border = `1px solid ${kind === 'error' ? '#fecaca' : '#bfdbfe'}`;
  box.textContent = message;
  box.style.display = 'block';
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => { box.style.display = 'none'; }, 6000);
}

function isNoLand(fs) {
  return fs?.health?.status === 'no_land_detected'
    || ['water', 'water body', 'water bodies'].includes(String(fs?.land_cover?.class || '').toLowerCase().replaceAll('_', ' '));
}

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
  } else if (isNoLand(currentFieldState) && $('adv-empty').style.display !== 'none' && !$('adv-empty').querySelector('[data-i18n]')) {
    $('adv-empty').textContent = `${noLandText(0)} — ${noLandText(1)}`;
  }

  // Re-render Dx
  if (lastDxResult) {
     renderDx(lastDxResult);
  }
}

// Results are cached per field/photo and language, so switching back to a language is instant
// and the previous content stays on screen (dimmed) while a new translation loads.
const advisoryCache = new Map();
const dxCache = new Map();
let analysisId = 0;
let dxImageId = 0;
let advisoryLang = null;
let langRefreshTimer = null;
const advisoryKey = (lang = currentLanguage) => `${analysisId}|${lang}`;
const dxKey = (lang = currentLanguage) => `${dxImageId}|${$('dx-crop').value}|${lang}`;
const cacheResult = (cache, key, value) => {
  cache.set(key, value);
  if (cache.size > 40) cache.delete(cache.keys().next().value);
};

async function changeLanguage(lang) {
  const refreshAdvisory = Boolean(currentAdvisory) || $('adv-loading').style.display !== 'none';
  const refreshDiagnosis = Boolean(lastDxResult) || $('dx-loading').style.display !== 'none';
  // Invalidate in-flight requests so a late response in the old language is never rendered.
  ++advisoryRequestId;
  ++dxRequestId;
  advisoryAbortController?.abort();
  dxAbortController?.abort();
  currentLanguage = lang;
  document.documentElement.lang = lang;
  try { localStorage.setItem('agrinet_language', lang); } catch (e) { /* storage may be blocked */ }
  stopSpeech();
  updateUI(); // Immediately shift static UI; existing advisory/diagnosis stay visible until replaced.

  // Debounce so flicking through several languages only fetches the one the user settles on.
  clearTimeout(langRefreshTimer);
  langRefreshTimer = setTimeout(() => {
    if (refreshAdvisory && currentFieldState) void regenerateAdvisory();
    if (refreshDiagnosis && $('dx-file').files[0]) void regenerateDx();
  }, 350);
}


// Navigation
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const target = e.currentTarget;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    target.classList.add('active');
    $(target.dataset.target).classList.add('active');
    // Each view opens at its top (e.g. Field Intelligence on the health score) rather than
    // inheriting the scroll offset of the previous view.
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
});

// API Helpers
async function apiPost(url, body, isForm=false, signal=null) {
  const controller = new AbortController();
  const abortRequest = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', abortRequest, { once: true });
  }
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 45000);
  const opts = { method: 'POST', body: isForm ? body : JSON.stringify(body), signal: controller.signal };
  if(!isForm) opts.headers = { 'Content-Type': 'application/json' };
  try {
    const r = await fetch(url, opts);
    let j = null;
    try { j = await r.json(); } catch (parseError) { /* non-JSON error page */ }
    if(!r.ok || !j) throw new Error(`${uiText('failed')} ${j?.detail || r.statusText || r.status}`);
    return j;
  } catch (e) {
    if (timedOut) throw new Error(uiText('timeout'));
    throw e;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortRequest);
  }
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
  if(!pin) return showNotice(uiText('tapMapFirst'), 'info');
  const {lat, lng} = pin.getLatLng();
  const lon = normalizeLongitude(lng);
  await analyzeField({ lat, lon, crop: $('crop-input').value, is_demo: false });
};

async function analyzeField(req) {
  req.lang = currentLanguage;
  ++advisoryRequestId;
  advisoryAbortController?.abort();
  currentAdvisory = null;
  $('btn-analyze').disabled = true;
    $('btn-analyze').textContent = window.t('analyzingBtn');
  
  try {
    currentAnalysisResponse = await apiPost('/api/v1/analyze', req);
    currentFieldState = currentAnalysisResponse.field_state;
    // Wipe advisory on new field
    ++analysisId;
    currentAdvisory = null;
    advisoryLang = null;
    stopSpeech();
    $('adv-loading').style.display = 'none';
    $('adv-content').style.display = 'none';
    resetAdvisoryEmpty();

    renderField(currentAnalysisResponse);
    document.querySelector('[data-target="view-field"]').click();
  } catch(e) {
    showNotice(e.message);
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

  const noLand = isNoLand(fs);
  $('btn-gen-adv').disabled = noLand;
  $('btn-gen-adv').title = noLand ? noLandText(1) : '';

  const h = fs.health;
  const ring = $('f-health-ring');
  if (noLand) {
    ring.dataset.status = 'no_land';
    $('f-health-score').textContent = '--';
    $('f-health-status').textContent = noLandText(0);
    $('f-health-status').style.color = 'var(--text-muted)';
    $('f-health-comps').innerHTML = `<p class="dp-label" style="text-align:center;">${esc(noLandText(1))}</p>`;
  } else if(h.score !== null) {
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
    ring.dataset.status = 'unavailable';
    $('f-health-score').textContent = '--';
    $('f-health-status').textContent = window.t('status_unknown') || 'UNAVAILABLE';
    $('f-health-status').style.color = 'var(--text-muted)';
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

function resetAdvisoryEmpty() {
  $('adv-empty').innerHTML = `<span data-i18n="advEmpty">${esc(window.t('advEmpty'))}</span>`;
  $('adv-empty').style.display = 'block';
}

async function regenerateAdvisory() {
   if (isNoLand(currentFieldState)) {
     ++advisoryRequestId;
     advisoryAbortController?.abort();
     currentAdvisory = null;
     $('adv-loading').style.display = 'none';
     $('adv-empty').textContent = `${noLandText(0)} — ${noLandText(1)}`;
     $('adv-empty').style.display = 'block';
     $('adv-content').style.display = 'none';
     return;
   }
   const expectedReqId = ++advisoryRequestId;
   advisoryAbortController?.abort();
   advisoryAbortController = new AbortController();
   const requestLang = currentLanguage;
   const cacheKey = advisoryKey(requestLang);

   $('adv-empty').style.display = 'none';

   const cached = advisoryCache.get(cacheKey);
   if (cached) {
      currentAdvisory = cached;
      advisoryLang = requestLang;
      $('adv-loading').style.display = 'none';
      $('adv-content').style.opacity = '1';
      renderAdvisory(cached);
      return;
   }

   // Check if we are updating an existing advisory or generating new
   if (currentAdvisory) {
      $('adv-loading').innerHTML = `<div class="loader" style="width:40px;height:40px;margin-bottom:20px;"></div><p style="color:var(--text-muted); margin-top:8px;">${esc(uiText('updatingAdvisory'))}</p>`;
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
      lang: requestLang
    }, false, advisoryAbortController.signal);

    if (expectedReqId !== advisoryRequestId) return; // Stale protection
    // Only cache real advisories; offline/timeout fallbacks carry no structured sections.
    if (adv.field_status || adv.what_the_data_shows) cacheResult(advisoryCache, cacheKey, adv);
    currentAdvisory = adv;
    advisoryLang = requestLang;

    renderAdvisory(currentAdvisory);
  } catch(e) {
    if (expectedReqId !== advisoryRequestId) return;
    showNotice(e.message);
    if (!currentAdvisory) resetAdvisoryEmpty();
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
  updateSpeakButton();
}

// Voice
const VOICE = {en:'en-IN',hi:'hi-IN',ta:'ta-IN',te:'te-IN',bn:'bn-IN',mr:'mr-IN',pa:'pa-IN',gu:'gu-IN',kn:'kn-IN',ml:'ml-IN'};
// Enum-like or ID fields that should not be read aloud (they are codes, not sentences).
const SILENT_ADVISORY_KEYS = new Set(['evidence_id', 'evidence_ids', 'severity', 'priority', 'suitability', 'status', '_raw']);
let speechSession = 0;

function updateSpeakButton() {
  const btn = $('btn-speak');
  if (!btn) return;
  btn.textContent = speechSession ? uiText('stop') : window.t('listen');
}

function stopSpeech() {
  speechSession = 0;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  updateSpeakButton();
}

// Chrome fills the voice list asynchronously; wait briefly for it instead of picking from an empty list.
function loadVoices() {
  const voices = speechSynthesis.getVoices();
  if (voices.length) return Promise.resolve(voices);
  return new Promise(resolve => {
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1200);
  });
}

async function speakAdvisory() {
  if (!('speechSynthesis' in window)) return;
  if (speechSession) return stopSpeech();
  if (!currentAdvisory) return;
  const collect = (value, key = '') => SILENT_ADVISORY_KEYS.has(key) ? []
    : Array.isArray(value) ? value.flatMap(v => collect(v))
    : value && typeof value === 'object' ? Object.entries(value).flatMap(([k, v]) => collect(v, k))
    : typeof value === 'string' && value.trim() ? [value.trim()] : [];
  const payload = collect(currentAdvisory).join('. ').trim();
  if (!payload) return;

  stopSpeech();
  const session = speechSession = Date.now();
  // Speak in the language the advisory was written in, even if a translation is still loading.
  const lang = advisoryLang || currentLanguage;
  const voices = await loadVoices();
  if (session !== speechSession) return;
  const voice = voices.find(v => v.lang.toLowerCase().replace('_', '-') === VOICE[lang]?.toLowerCase())
    || voices.find(v => v.lang.toLowerCase().startsWith(lang));
  if (!voice && lang !== 'en') showNotice(uiText('noVoice'), 'info');

  const chunks = payload.match(/[^.!?।]+[.!?।]*/g) || [payload];
  const parts = [];
  let pending = '';
  for (const sentence of chunks) {
    if (pending.length + sentence.length > 220 && pending) {
      parts.push(pending);
      pending = '';
    }
    pending += `${sentence} `;
  }
  if (pending.trim()) parts.push(pending);
  // Chrome can drop an utterance queued in the same tick as cancel(); give it a moment.
  setTimeout(() => {
    if (session !== speechSession) return;
    parts.forEach((text, i) => queueSpeech(text, voice, lang, session, i === parts.length - 1));
    updateSpeakButton();
  }, 60);
}

function queueSpeech(text, voice, lang, session, isLast) {
  const utterance = new SpeechSynthesisUtterance(text.trim());
  utterance.lang = VOICE[lang] || 'en-IN';
  if (voice) utterance.voice = voice;
  const finish = () => {
    if (session === speechSession && (isLast || !speechSynthesis.speaking)) {
      speechSession = 0;
      updateSpeakButton();
    }
  };
  if (isLast) utterance.onend = finish;
  utterance.onerror = finish;
  speechSynthesis.speak(utterance);
}

// Crop Doctor
let optimizedDxImage = null; // { id, file } — re-encoded once per photo, reused on language switches
$('dx-drop').onclick = () => $('dx-file').click();
$('dx-file').onchange = (e) => {
  if(e.target.files[0]) {
    $('dx-preview').src = URL.createObjectURL(e.target.files[0]);
    $('dx-preview').style.display = 'block';
    // Remove previous result context when image changes
    ++dxImageId;
    ++dxRequestId;
    dxAbortController?.abort();
    optimizedDxImage = null;
    lastDxResult = null;
    $('dx-loading').style.display = 'none';
    $('btn-dx').disabled = false;
    $('dx-res').style.display = 'none';
  }
};

$('btn-dx').onclick = async () => {
  if(!$('dx-file').files[0]) return showNotice(uiText('choosePhoto'), 'info');
  await regenerateDx();
};

async function regenerateDx() {
  const expectedReqId = ++dxRequestId;
  dxAbortController?.abort();
  dxAbortController = new AbortController();
  const f = $('dx-file').files[0];
  const requestLang = currentLanguage;
  const cacheKey = dxKey(requestLang);

  $('dx-empty').style.display = 'none';
  const cached = dxCache.get(cacheKey);
  if (cached) {
    lastDxResult = cached;
    $('dx-loading').style.display = 'none';
    $('dx-res').style.opacity = '1';
    $('btn-dx').disabled = false;
    renderDx(cached);
    return;
  }

  if (lastDxResult) {
       $('dx-loading').innerHTML = `<div class="loader"></div><p style="margin-top:12px;">${esc(uiText('updatingDx'))}</p>`;
       $('dx-res').style.opacity = '0.5';
  } else {
       $('dx-loading').innerHTML = `<div class="loader"></div><p style="margin-top:12px;">${esc(window.t('dxLoading'))}</p>`;
       $('dx-res').style.display = 'none';
  }
  
  $('dx-loading').style.display = 'block';
  $('btn-dx').disabled = true;
  
  try {
    const fd = new FormData();
    const imageId = dxImageId;
    if (optimizedDxImage?.id !== imageId) optimizedDxImage = { id: imageId, file: await optimizeDiagnosisImage(f) };
    if (expectedReqId !== dxRequestId) return;
    fd.append('image', optimizedDxImage.file);
    fd.append('lang', requestLang);
    fd.append('crop', $('dx-crop').value);
    // Only the fields the diagnosis prompt uses; the full field state (series, evidence) just bloats the upload.
    if (currentFieldState) fd.append('field_context_json', JSON.stringify({
      land_cover: { class: currentFieldState.land_cover?.class, is_cropland: currentFieldState.land_cover?.is_cropland },
      vegetation: { ndvi: currentFieldState.vegetation?.ndvi, ndwi: currentFieldState.vegetation?.ndwi },
    }));
    const d = await apiPost('/api/v1/diagnose', fd, true, dxAbortController.signal);
    if (expectedReqId !== dxRequestId) return; 
    
    if (d.diagnosis && d.confidence && !d._raw) cacheResult(dxCache, cacheKey, d);
    lastDxResult = d;
    renderDx(d);
    
  } catch(e) {
    if (expectedReqId !== dxRequestId) return; 
    showNotice(e.message);
    if(!lastDxResult) $('dx-empty').style.display = 'block';
  } finally {
    if (expectedReqId === dxRequestId) {
       $('dx-loading').style.display = 'none';
       $('dx-res').style.opacity = '1';
       $('btn-dx').disabled = false;
    }
  }
}

// Phone photos are often 3–12 MB; a 1280 px JPEG is plenty for leaf symptoms and uploads and
// processes several times faster. Formats the browser cannot decode (e.g. HEIC on Chrome) are
// sent unchanged and identified server-side.
const DX_MAX_EDGE = 1280;
async function optimizeDiagnosisImage(file) {
  if (!window.createImageBitmap) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, DX_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000 && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // transparent PNGs would otherwise turn black as JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob ? new File([blob], 'crop-photo.jpg', { type: 'image/jpeg' }) : file;
  } catch (error) {
    return file;
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

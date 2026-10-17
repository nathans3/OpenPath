// Safety layer that runs BEFORE anything leaves the device:
//   1. redact()      — strips passwords, SSNs, card and account numbers, codes
//   2. detectScam()  — scores the user's words plus what is on screen for
//                      fraud patterns (fake tech support, prizes, gift cards,
//                      wire transfers, remote access, family-emergency scams)
//
// Each pattern has a Latin-script regex (uses \b word boundaries) and a
// separate regex for Chinese and Hindi, because \b does not work between
// Devanagari or Chinese characters in JavaScript.

const SSN = /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g;
const LONG_DIGITS = /\b(?:\d[ -]?){12,19}\b/g;           // card / account numbers
const PASSWORD = /\b(?:password|passcode|pass code|pin|contraseña|clave)\s*(?:is|es|:)?\s*["']?([^\s"']{3,})/gi;
const PASSWORD_INTL = /(?:密码|口令|पासवर्ड|पिन)\s*(?:是|:|है|हैं)?\s*["']?([^\s"'，。]{3,})/g;
const OTP = /\b(?:code|código)\s*(?:is|es|:)?\s*(\d{4,8})\b/gi;
const OTP_INTL = /(?:验证码|कोड)\s*(?:是|:|है)?\s*(\d{4,8})/g;
const ACCOUNT = /\b(?:account|acct|routing|cuenta)\s*(?:number|no\.?|#|número)?\s*(?:is|es|:)?\s*(\d{6,17})\b/gi;
const ACCOUNT_INTL = /(?:账号|账户|खाता संख्या|खाता नंबर|अकाउंट नंबर)\s*(?:是|:|है)?\s*(\d{6,17})/g;
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
const DOB = /\b(?:0?[1-9]|1[0-2])[\/-](?:0?[1-9]|[12]\d|3[01])[\/-](?:19|20)\d{2}\b/g;

function luhnOk(digits) {
  let sum = 0, dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = +digits[i];
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return sum % 10 === 0;
}

export function redact(text) {
  const found = [];
  let out = text;
  const hide = (label, placeholder) => (m, secret) => { found.push(label); return m.replace(secret, placeholder); };

  out = out.replace(PASSWORD, hide("password", "[PASSWORD HIDDEN]"));
  out = out.replace(PASSWORD_INTL, hide("password", "[PASSWORD HIDDEN]"));
  out = out.replace(OTP, hide("one-time code", "[CODE HIDDEN]"));
  out = out.replace(OTP_INTL, hide("one-time code", "[CODE HIDDEN]"));
  out = out.replace(ACCOUNT, hide("account number", "[ACCOUNT HIDDEN]"));
  out = out.replace(ACCOUNT_INTL, hide("account number", "[ACCOUNT HIDDEN]"));
  out = out.replace(SSN, () => { found.push("SSN"); return "[SSN HIDDEN]"; });
  out = out.replace(LONG_DIGITS, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length >= 13 && luhnOk(digits)) { found.push("card number"); return "[CARD HIDDEN]"; }
    if (digits.length >= 12) { found.push("long number"); return "[NUMBER HIDDEN]"; }
    return m;
  });
  out = out.replace(DOB, () => { found.push("date of birth"); return "[DATE HIDDEN]"; });
  out = out.replace(EMAIL, () => { found.push("email address"); return "[EMAIL HIDDEN]"; });

  return { text: out, redactions: [...new Set(found)] };
}

// Weighted fraud signals in English, Spanish, Chinese and Hindi.
const SIGNALS = [
  { w: 4, label: "gift cards as payment",
    re: /\b(gift ?cards?|google play|itunes|steam cards?|tarjetas? de regalo)\b/i,
    intl: /(礼品卡|点卡|गिफ्ट ?कार्ड|गिफ़्ट ?कार्ड|उपहार कार्ड)/ },
  { w: 4, label: "wire transfer or crypto",
    re: /\b(wire (transfer|money)|western union|moneygram|bitcoin|crypto|zelle (him|her|them)|giro|transferencia a)\b/i,
    intl: /(比特币|汇款给|वायर ट्रांसफ़र|वायर ट्रांसफर|वेस्टर्न यूनियन|बिटकॉइन|क्रिप्टो)/ },
  { w: 4, label: "remote access to the computer",
    re: /\b(anydesk|teamviewer|remote access|let them (control|into) my computer|acceso remoto)\b/i,
    intl: /(远程控制|रिमोट एक्सेस|एनीडेस्क|टीमव्यूअर)/ },
  { w: 3, label: "'tech support' phone number",
    re: /\b(call (microsoft|apple|amazon|norton|windows)|microsoft (support|certified)|llam(ar|e) a microsoft)\b/i,
    intl: /(打电话给微软|技术支持电话|माइक्रोसॉफ्ट को (फ़ोन|फोन|कॉल)|माइक्रोसॉफ़्ट को (फ़ोन|फोन|कॉल)|टेक सपोर्ट)/ },
  { w: 3, label: "virus / infection threat",
    re: /\b(computer (is|has)( been)? (infected|hacked|a virus)|virus(es)? (detected|found)|infected with|tiene virus|security alert)\b/i,
    intl: /(电脑中毒|病毒|वायरस|हैक हो गया)/ },
  { w: 3, label: "government threat",
    re: /\b(irs|social security (number )?(is )?suspended|arrest warrant|medicare (card )?(is )?(cancell?ed|suspended)|orden de arresto|seguro social suspendido)\b/i,
    intl: /(逮捕令|社保(被)?停|गिरफ़्तारी|गिरफ्तारी|आधार (बंद|ब्लॉक))/ },
  { w: 3, label: "unexpected prize",
    re: /\b(you('ve| have)? (won|been selected)|i won|congratulations.*(gift|prize|reward)|claim (my|your) (reward|prize)|gan[ée] (un|una)|premio)\b/i,
    intl: /(中奖|中了|领取奖品|इनाम|जीत गया|जीत गई|जीता|लॉटरी)/ },
  { w: 2, label: "urgency pressure",
    re: /\b(within \d+ ?(minutes?|hours?)|right now|immediately|tonight|before it'?s too late|do not (shut down|turn off|close)|ahora mismo|inmediatamente|esta noche)\b/i,
    intl: /(马上|立刻|今晚|तुरंत|आज रात)/ },
  { w: 2, label: "secrecy requested",
    re: /\b(don'?t tell (mom|dad|anyone|your (son|daughter))|keep (this|it) (secret|between us)|no le digas)\b/i,
    intl: /(别告诉|किसी को (मत|न) बताना|मम्मी को (मत|न) बताना)/ },
  { w: 3, label: "relative in trouble asking for money",
    re: /\b((grandson|granddaughter|nephew|niece|grandchild|son|daughter|nieto|nieta|hijo|hija).{0,40}(trouble|jail|arrested|accident|bail|hospital|money|cash|cards?|problemas|cárcel|dinero))\b/i,
    intl: /((孙子|孙女|儿子|女儿).{0,20}(出事|坐牢|要钱|礼品卡)|(पोता|पोते|पोती|नाती|नातिन|बेटा|बेटे|बेटी).{0,30}(मुसीबत|जेल|पैसे|कार्ड|गिफ्ट))/ },
  { w: 2, label: "pay a small fee to receive money",
    re: /\b(pay (only|just)? ?\$?\d|shipping fee|processing fee|activation fee|small fee|pague solo)\b/i,
    intl: /(运费|手续费|शिपिंग|डिलीवरी शुल्क|छोटी सी फ़ीस)/ },
  { w: 2, label: "asked to read out a code",
    re: /\b(read (me|them) the (code|numbers)|give (them|him|her) the code|send the codes?|enviar los códigos)\b/i,
    intl: /(把验证码|कोड (बता|भेज|दे))/ },
  { w: 2, label: "account suspension threat",
    re: /\b(account (will be|has been|is) (suspended|closed|locked)|verify your account|unusual activity|cuenta (será )?suspendida)\b/i,
    intl: /(账户(被)?冻结|异常活动|खाता (बंद|ब्लॉक)|अकाउंट (बंद|ब्लॉक))/ },
];

const SAFE_CONTEXT = /\b(is this a scam|is it a scam|es una estafa|should i ignore|should i trust)\b/i;
const SAFE_CONTEXT_INTL = /(是不是骗|是骗局吗|क्या यह धोखा|धोखाधड़ी है क्या|ठगी तो नहीं)/;

export function scoreText(text) {
  const reasons = [];
  let score = 0;
  for (const s of SIGNALS) {
    if (s.re.test(text) || s.intl.test(text)) { score += s.w; reasons.push(s.label); }
  }
  return { score, reasons };
}

export function detectScam({ query, screen }) {
  const q = query || "";
  const { score: base, reasons } = scoreText(q);
  let score = base;

  // The person asking "is this a scam?" is being careful — still warn, but
  // they are not about to act, so don't count their words as intent.
  const asking = SAFE_CONTEXT.test(q) || SAFE_CONTEXT_INTL.test(q);

  if (screen?.risk?.scam) {
    const gate = screen.risk.onlyWhenQueryMentions;
    const engaged = !gate || gate.some((k) => q.toLowerCase().includes(k.toLowerCase()));
    if (engaged) {
      score += 5;
      for (const cue of screen.risk.cues) reasons.push(`on screen: ${cue}`);
    } else {
      // Risky content is visible but the person is doing something unrelated;
      // keep a gentle flag so the reply can mention it.
      score += 1;
      reasons.push("on screen: a suspicious message is visible");
    }
  }

  const scam = score >= 5 || (score >= 4 && !asking);
  return {
    scam,
    score,
    reasons: [...new Set(reasons)],
    category: screen?.risk?.category || (reasons[0] ? reasons[0].replace(/\s+/g, "_") : null),
    asking,
  };
}

// Messages the circle speaks when it locks down.
export function refusalText(lang, category) {
  const T = {
    en: {
      fake_tech_support: "Stop. This is a fake warning, not Microsoft. Do not call that number and do not let anyone into your computer. I'm telling your family now.",
      fake_prize: "Stop. Nobody is giving away a thousand dollars for a shipping fee. Do not type your card number. Close the window. I'm telling your family now.",
      family_emergency: "Stop. Real family never asks for gift card codes, and a real Tommy would call you. Do not buy anything. Call Tommy on his usual number first.",
      default: "Stop. This has the signs of a scam. Do not pay, do not share codes, and do not call that number. Please call someone you trust first.",
    },
    es: {
      fake_tech_support: "Alto. Este aviso es falso, no es de Microsoft. No llame a ese número ni deje que nadie entre en su computadora. Ya le estoy avisando a su familia.",
      fake_prize: "Alto. Nadie regala mil dólares a cambio de un envío. No escriba su tarjeta. Cierre la ventana. Ya le estoy avisando a su familia.",
      family_emergency: "Alto. La familia de verdad nunca pide códigos de tarjetas, y el verdadero Tommy la llamaría. No compre nada. Llame primero a Tommy a su número de siempre.",
      default: "Alto. Esto tiene señales de estafa. No pague, no comparta códigos y no llame a ese número. Llame primero a alguien de confianza.",
    },
    zh: {
      fake_tech_support: "停下。这是假警告，不是微软。不要打那个电话，也不要让任何人控制您的电脑。我现在就通知您的家人。",
      fake_prize: "停下。没有人会为了运费送您一千美元。不要输入银行卡号，关掉这个窗口。我现在就通知您的家人。",
      family_emergency: "停下。真正的家人不会要礼品卡的验证码，真正的汤米会给您打电话。什么都不要买。先用他平时的号码打给汤米。",
      default: "停下。这有诈骗的迹象。不要付钱，不要说出验证码，也不要打那个电话。请先打电话给您信任的人。",
    },
    hi: {
      fake_tech_support: "रुकिए। यह नकली चेतावनी है, माइक्रोसॉफ्ट की नहीं। उस नंबर पर फ़ोन मत कीजिए और किसी को अपने कंप्यूटर में घुसने मत दीजिए। मैं अभी आपके परिवार को बता रही हूँ।",
      fake_prize: "रुकिए। शिपिंग के पैसों के बदले कोई एक हज़ार डॉलर नहीं देता। अपना कार्ड नंबर मत लिखिए। यह खिड़की बंद कर दीजिए। मैं अभी आपके परिवार को बता रही हूँ।",
      family_emergency: "रुकिए। असली परिवार कभी गिफ्ट कार्ड के कोड नहीं माँगता, और असली टॉमी आपको फ़ोन करता। कुछ मत खरीदिए। पहले टॉमी को उसके पुराने नंबर पर फ़ोन कीजिए।",
      default: "रुकिए। इसमें धोखाधड़ी के निशान हैं। पैसे मत दीजिए, कोड मत बताइए, और उस नंबर पर फ़ोन मत कीजिए। पहले किसी भरोसेमंद व्यक्ति को फ़ोन कीजिए।",
    },
  };
  const table = T[lang] || T.en;
  return table[category] || table.default;
}

// Pages where OpenPath never sends a picture of the screen (the desktop main
// process checks the same list before capturing).
const SENSITIVE_TITLE = /(bank|credit union|chase|wells fargo|citi|capital one|paypal|venmo|zelle|mychart|patient|health|medicare|medicaid|pharmacy|insurance|password|passcode|1password|keychain|sign ?in|log ?in|login|tax|irs|social security)/i;
export function isSensitiveTitle(title) { return SENSITIVE_TITLE.test(title || ""); }

// All fixed scam warnings, for the pre-recorded voice pack.
export function allRefusalSentences() {
  const out = {};
  for (const lang of ["en", "es", "zh", "hi"]) out[lang] = ["fake_tech_support", "fake_prize", "family_emergency", "default"].map((c) => refusalText(lang, c));
  return out;
}

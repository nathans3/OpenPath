// Page-aware guides for real websites.
//
// A scripted list of steps breaks on real sites, because pages come and go
// (Google sometimes asks for a phone number, sometimes not). A page-aware
// guide instead describes each page the site can show: words that identify
// it, what to say, and what to point at. After every page change OpenPath
// reads the screen (on this computer), finds which page is showing, and
// gives that page's instructions.
//
// target.labels  words on the page to point at
// target.steps   several boxes in order: the pointer moves to the next one once
//                the box shows what was typed or picked ("after": move on after
//                that many ms instead, for passwords); "cue" is said at each move.
//                Everything is one step at a time: a page's "text" covers only
//                its first box, and each later box has its own "cue".
//                "pick": the box is a list (Month, Gender); it counts as done
//                when exactly one choice shows, i.e. the list closed on a pick.
// textIf         a different first line when the first box found is that label
// The guide moves on when the page changes, not when Next is clicked, so a
// Google error ("That username is taken") keeps the person on the same step.

export const GUIDES = {
  google_signup: {
    match: {
      en: ["google account", "gmail account", "sign up for google", "sign up for gmail", "make a gmail", "create a gmail", "get a gmail", "new gmail", "email account", "make an email", "create an email"],
      es: ["cuenta de google", "cuenta de gmail", "crear un gmail", "correo nuevo", "crear un correo", "cuenta de correo"],
      zh: ["谷歌账号", "谷歌帐号", "谷歌账户", "google账号", "gmail账号", "gmail 账号", "注册gmail", "注册谷歌", "邮箱账号", "注册邮箱"],
      hi: ["गूगल अकाउंट", "गूगल खाता", "जीमेल अकाउंट", "जीमेल खाता", "ईमेल अकाउंट", "ईमेल खाता"],
    },
    // OpenPath never opens or clicks anything; it tells and points.
    start: {
      en: "Let's make your Google account together. First, open your web browser. Click the address bar at the very top, type google.com, and press Return. I'll watch and help from there.",
      es: "Vamos a crear su cuenta de Google juntos. Primero, abra su navegador de internet. Haga clic en la barra de direcciones de arriba, escriba google.com y pulse Intro. Yo la acompaño desde ahí.",
      zh: "我们一起来注册谷歌账号。先打开您的网页浏览器。点最上面的地址栏，输入 google.com，然后按回车。之后我会一直帮您。",
      hi: "चलिए साथ मिलकर आपका Google अकाउंट बनाते हैं। पहले अपना वेब ब्राउज़र खोलिए। सबसे ऊपर पते वाली पट्टी पर क्लिक कीजिए, google.com लिखिए और Return दबाइए। उसके बाद मैं साथ-साथ मदद करूँगी।",
    },
    wrongPage: {
      en: "That doesn't look like a Google sign-up page. Click the back arrow at the top left of your browser to go back. Or click the address bar, type google.com, and press Return.",
      es: "Esa no parece una página de registro de Google. Haga clic en la flecha hacia atrás, arriba a la izquierda del navegador, para regresar. O haga clic en la barra de direcciones, escriba google.com y pulse Intro.",
      zh: "这看起来不是谷歌的注册页面。点浏览器左上角的返回箭头回去。或者点地址栏，输入 google.com，然后按回车。",
      hi: "यह Google का साइन-अप पेज नहीं लग रहा। वापस जाने के लिए ब्राउज़र के ऊपर बाएँ कोने में पीछे वाले तीर पर क्लिक कीजिए। या पते वाली पट्टी पर क्लिक करके google.com लिखिए और Return दबाइए।",
    },
    // Pages in the order of the flow. When several are visible (a menu over
    // a page), the one furthest along wins.
    pages: [
      {
        id: "google_home",
        detect: ["Google Search", "I'm Feeling Lucky"],
        target: { labels: ["Sign in"] },
        text: {
          en: "This is Google. Click the blue Sign in button at the top right corner. If you see a small round picture there instead, click the picture, then click Add another account.",
          es: "Esto es Google. Haga clic en el botón azul Sign in, en la esquina superior derecha. Si en su lugar ve una foto redonda, haga clic en ella y luego en Add another account.",
          zh: "这是谷歌首页。点右上角蓝色的 Sign in 按钮。如果那里是一个圆形小头像，就点头像，再点 Add another account。",
          hi: "यह Google है। ऊपर दाएँ कोने में नीले Sign in बटन पर क्लिक कीजिए। अगर वहाँ एक छोटी गोल तस्वीर दिखे, तो उस पर क्लिक करके Add another account पर क्लिक कीजिए।",
        },
      },
      {
        id: "account_menu",
        detect: ["Add another account", "Sign out of all accounts"],
        target: { labels: ["Add another account"] },
        text: {
          en: "Click Add another account in this list.",
          es: "Haga clic en Add another account en esta lista.",
          zh: "在这个列表里点 Add another account。",
          hi: "इस सूची में Add another account पर क्लिक कीजिए।",
        },
      },
      {
        id: "signin",
        detect: ["Use your Google Account", "Forgot email?"],
        target: { labels: ["Create account"] },
        watch: "change",
        text: {
          en: "This is Google's sign-in page. You don't have an account yet, so click Create account near the bottom.",
          es: "Esta es la página para entrar a Google. Como todavía no tiene cuenta, haga clic en Create account, cerca de abajo.",
          zh: "这是谷歌的登录页面。您还没有账号，所以点下面的 Create account。",
          hi: "यह Google का साइन-इन पेज है। आपका अभी अकाउंट नहीं है, इसलिए नीचे की तरफ़ Create account पर क्लिक कीजिए।",
        },
      },
      {
        id: "account_type",
        detect: ["For my personal use", "For my child", "For work or my business"],
        target: { labels: ["For my personal use", "For personal use"] },
        text: {
          en: "A small list opened. Click For my personal use.",
          es: "Se abrió una lista pequeña. Haga clic en For my personal use.",
          zh: "弹出了一个小列表。点 For my personal use。",
          hi: "एक छोटी सूची खुली है। For my personal use पर क्लिक कीजिए।",
        },
      },
      {
        id: "name",
        detect: ["Enter your name", "Create a Google Account"],
        // Box by box: the pointer moves on when the box shows what was typed.
        target: { steps: [
          { labels: ["First name"] },
          { labels: ["Last name (optional)", "Last name"], cue: {
            en: "Good. Now click the Last name box and type your last name. If you'd rather not, just click Next.",
            es: "Bien. Ahora haga clic en el cuadro Last name y escriba su apellido. Si prefiere no hacerlo, haga clic en Next.",
            zh: "很好。现在点 Last name 框，输入您的姓。如果不想填，直接点 Next。",
            hi: "बहुत अच्छे। अब Last name वाले खाने पर क्लिक करके अपना उपनाम लिखिए। अगर नहीं लिखना चाहते, तो सीधे Next पर क्लिक कीजिए।" } },
          { labels: ["Next"], cue: "next" },
        ] },
        text: {
          en: "This is Google's sign-up page. Click the First name box and type your first name.",
          es: "Esta es la página de registro de Google. Haga clic en el cuadro First name y escriba su nombre.",
          zh: "这是谷歌的注册页面。点 First name 框，输入您的名字。",
          hi: "यह Google का साइन-अप पेज है। First name वाले खाने पर क्लिक करके अपना पहला नाम लिखिए।",
        },
      },
      {
        id: "birthday",
        detect: ["Enter your birthday and gender", "Basic information"],
        target: { steps: [
          { labels: ["Month"], pick: "month" },
          { labels: ["Day"], cue: {
            en: "Good. Now click the Day box and type the day you were born.",
            es: "Bien. Ahora haga clic en el cuadro Day y escriba el día en que nació.",
            zh: "很好。现在点 Day 框，输入您出生的日期。",
            hi: "बहुत अच्छे। अब Day वाले खाने पर क्लिक करके अपने जन्म की तारीख लिखिए।" } },
          { labels: ["Year"], cue: {
            en: "Good. Now click the Year box and type the year you were born, all four numbers.",
            es: "Bien. Ahora haga clic en el cuadro Year y escriba el año en que nació, los cuatro números.",
            zh: "很好。现在点 Year 框，输入您出生的年份，四位数字。",
            hi: "बहुत अच्छे। अब Year वाले खाने पर क्लिक करके अपने जन्म का साल लिखिए, चारों अंक।" } },
          { labels: ["Gender"], pick: "gender", cue: {
            en: "Good. Now click the Gender box and pick one. You can choose Rather not say.",
            es: "Bien. Ahora haga clic en el cuadro Gender y elija una opción. Puede elegir Rather not say.",
            zh: "很好。现在点 Gender 框，选一个。也可以选 Rather not say。",
            hi: "बहुत अच्छे। अब Gender वाले खाने पर क्लिक करके एक चुनिए। आप Rather not say भी चुन सकते हैं।" } },
          { labels: ["Next"], cue: "next" },
        ] },
        text: {
          en: "Now your birthday. Click the Month box and pick the month you were born.",
          es: "Ahora su fecha de nacimiento. Haga clic en el cuadro Month y elija el mes en que nació.",
          zh: "现在填生日。点 Month 框，选您出生的月份。",
          hi: "अब आपका जन्मदिन। Month वाले खाने पर क्लिक करके अपने जन्म का महीना चुनिए।",
        },
      },
      {
        id: "username",
        detect: ["Choose your Gmail address", "Pick a Gmail address", "How you'll sign in", "Create a Gmail address"],
        // Box by box. Never the heading "Create a Gmail address for signing
        // in…": that is Google's instruction line, not something to click.
        // Some sign-ups list suggestions with a "Create your own Gmail address"
        // choice; others show the Username box straight away (then the second
        // step is skipped).
        target: { steps: [
          { labels: ["Create your own Gmail address", "Create your own", "Username"], skipNextIf: "Username" },
          { labels: ["Username"], cue: {
            en: "Good. Now type the name you want in the Username box. Use letters and numbers, no spaces.",
            es: "Bien. Ahora escriba el nombre que quiera en el cuadro Username. Use letras y números, sin espacios.",
            zh: "很好。现在在 Username 框里输入您想要的名字。用字母和数字，不要空格。",
            hi: "बहुत अच्छे। अब Username वाले खाने में अपनी पसंद का नाम लिखिए। अक्षर और अंक इस्तेमाल कीजिए, बीच में जगह मत छोड़िए।" } },
          { labels: ["Next"], cue: {
            en: "Good. Now click Next. If Google says that name is taken, add a few numbers to the end.",
            es: "Bien. Ahora haga clic en Next. Si Google dice que ese nombre ya existe, agregue unos números al final.",
            zh: "很好。现在点 Next。如果谷歌说这个名字已经被用了，就在后面加几个数字。",
            hi: "बहुत अच्छे। अब Next पर क्लिक कीजिए। अगर Google कहे कि यह नाम पहले से लिया हुआ है, तो आखिर में कुछ अंक जोड़ दीजिए।" } },
        ] },
        textIf: {
          Username: {
            en: "Now pick your new email address. Click the Username box and type the name you want. Use letters and numbers, no spaces.",
            es: "Ahora elija su nueva dirección de correo. Haga clic en el cuadro Username y escriba el nombre que quiera. Use letras y números, sin espacios.",
            zh: "现在选择您的新邮箱地址。点 Username 框，输入您想要的名字。用字母和数字，不要空格。",
            hi: "अब अपना नया ईमेल पता चुनिए। Username वाले खाने पर क्लिक करके अपनी पसंद का नाम लिखिए। अक्षर और अंक इस्तेमाल कीजिए, बीच में जगह मत छोड़िए।",
          },
        },
        text: {
          en: "Now pick your new email address. Click one of Google's suggestions if you like it, or click Create your own Gmail address.",
          es: "Ahora elija su nueva dirección de correo. Haga clic en una de las sugerencias de Google si le gusta, o en Create your own Gmail address.",
          zh: "现在选择您的新邮箱地址。如果喜欢谷歌的某个建议就点它，或者点 Create your own Gmail address。",
          hi: "अब अपना नया ईमेल पता चुनिए। Google के सुझावों में से कोई पसंद हो तो उस पर क्लिक कीजिए, या Create your own Gmail address पर क्लिक कीजिए।",
        },
      },
      {
        id: "password",
        detect: ["Create a strong password"],
        // Typed passwords show as dots, which cannot be read, so the pointer
        // moves on after a pause instead (the spoken step covers everything).
        target: { steps: [
          { labels: ["Password"], after: 14000 },
          { labels: ["Confirm"], after: 12000, cue: {
            en: "Now click the Confirm box and type the same password again.",
            es: "Ahora haga clic en el cuadro Confirm y escriba la misma contraseña otra vez.",
            zh: "现在点 Confirm 框，再输入一遍同样的密码。",
            hi: "अब Confirm वाले खाने पर क्लिक करके वही पासवर्ड दोबारा लिखिए।" } },
          { labels: ["Next"], cue: "next" },
        ] },
        text: {
          en: "Now make up a password, at least 8 letters, numbers and symbols. Write it on paper and keep it somewhere safe. I won't read it. Click the Password box and type it.",
          es: "Ahora invente una contraseña de al menos 8 letras, números y símbolos. Anótela en un papel y guárdela en un lugar seguro. Yo no la leeré. Haga clic en el cuadro Password y escríbala.",
          zh: "现在设一个密码，至少 8 个字母、数字和符号。把它写在纸上，放在安全的地方。我不会看它。点 Password 框，输入密码。",
          hi: "अब एक पासवर्ड बनाइए, कम से कम 8 अक्षर, अंक और चिह्न। उसे कागज़ पर लिखकर किसी सुरक्षित जगह रखिए। मैं उसे नहीं पढ़ूँगी। Password वाले खाने पर क्लिक करके उसे लिखिए।",
        },
      },
      {
        id: "qr",
        detect: ["Scan the QR code", "Verify some info"],
        target: null,
        text: {
          en: "Google wants to check that you're a real person. Open the camera on your phone and point it at the square pattern on the screen. Then follow the steps on your phone. I'll wait here.",
          es: "Google quiere comprobar que usted es una persona real. Abra la cámara de su teléfono y apúntela al cuadro de puntos de la pantalla. Luego siga los pasos en su teléfono. Yo espero aquí.",
          zh: "谷歌想确认您是真人。打开手机的相机，对准屏幕上那个方形图案。然后按手机上的步骤做。我在这里等您。",
          hi: "Google जाँचना चाहता है कि आप असली इंसान हैं। अपने फ़ोन का कैमरा खोलिए और स्क्रीन पर बने चौकोर निशान की तरफ़ कीजिए। फिर फ़ोन पर दिखने वाले कदम पूरे कीजिए। मैं यहीं इंतज़ार कर रही हूँ।",
        },
      },
      {
        id: "phone",
        detect: ["Confirm you're not a robot", "Get a verification code", "Verify your phone number", "Add phone number"],
        target: { steps: [{ labels: ["Phone number"] }, { labels: ["Next", "Yes, I'm in"], cue: {
          en: "Good. Now click Next. Google will text you a short code.",
          es: "Bien. Ahora haga clic en Next. Google le enviará un código corto por mensaje.",
          zh: "很好。现在点 Next。谷歌会给您发一条短信验证码。",
          hi: "बहुत अच्छे। अब Next पर क्लिक कीजिए। Google आपको एक छोटा कोड मैसेज करेगा।" } }] },
        text: {
          en: "Google wants your mobile phone number to keep your account safe. Click the Phone number box and type your number.",
          es: "Google pide su número de celular para proteger su cuenta. Haga clic en el cuadro Phone number y escriba su número.",
          zh: "谷歌需要您的手机号码来保护账号安全。点 Phone number 框，输入您的手机号码。",
          hi: "आपके अकाउंट को सुरक्षित रखने के लिए Google आपका मोबाइल नंबर माँगता है। Phone number वाले खाने पर क्लिक करके अपना नंबर लिखिए।",
        },
      },
      {
        id: "code",
        detect: ["Enter the code", "Enter code", "verification code"],
        target: { steps: [{ labels: ["Enter code", "Code"] }, { labels: ["Next", "Verify"], cue: "next" }] },
        text: {
          en: "Look at your phone for a text message from Google with a code, like G dash and 6 numbers. Click the box and type just the 6 numbers. Never tell this code to anyone who calls you.",
          es: "Busque en su teléfono un mensaje de Google con un código, como G guion y 6 números. Haga clic en el cuadro y escriba solo los 6 números. Nunca le dé este código a nadie que la llame.",
          zh: "看看手机上谷歌发来的短信，里面有一个验证码，比如 G 加 6 个数字。点那个框，只输入这 6 个数字。不要把这个验证码告诉打电话给您的任何人。",
          hi: "अपने फ़ोन पर Google का मैसेज देखिए, उसमें एक कोड होगा, जैसे G के बाद 6 अंक। खाने पर क्लिक करके सिर्फ़ 6 अंक लिखिए। यह कोड फ़ोन करने वाले किसी को भी कभी मत बताइए।",
        },
      },
      {
        id: "recovery",
        detect: ["Add recovery email"],
        target: { labels: ["Skip"] },
        text: {
          en: "This page asks for a backup email address. It's optional. You can type the email of a family member you trust and click Next, or just click Skip.",
          es: "Esta página pide un correo de respaldo. Es opcional. Puede escribir el correo de un familiar de confianza y hacer clic en Next, o simplemente hacer clic en Skip.",
          zh: "这一页要一个备用邮箱，可以不填。您可以输入一位信任的家人的邮箱再点 Next，或者直接点 Skip。",
          hi: "यह पेज एक बैकअप ईमेल माँगता है। यह ज़रूरी नहीं है। आप परिवार के किसी भरोसेमंद सदस्य का ईमेल लिखकर Next दबा सकते हैं, या बस Skip पर क्लिक कीजिए।",
        },
      },
      {
        id: "review",
        detect: ["Review your account info"],
        target: { labels: ["Next"] },
        text: {
          en: "Google shows your name and new email address. Check that they look right, then click Next.",
          es: "Google muestra su nombre y su nueva dirección de correo. Revise que estén bien y haga clic en Next.",
          zh: "谷歌会显示您的名字和新邮箱地址。确认没问题后，点 Next。",
          hi: "Google आपका नाम और नया ईमेल पता दिखाता है। देख लीजिए कि सब सही है, फिर Next पर क्लिक कीजिए।",
        },
      },
      {
        id: "terms",
        detect: ["Privacy and Terms"],
        target: { labels: ["I agree"] },
        text: {
          en: "Last step. Google shows its privacy rules. Scroll down to the bottom with your mouse wheel, then click the blue I agree button.",
          es: "Último paso. Google muestra sus reglas de privacidad. Baje hasta el final con la rueda del ratón y haga clic en el botón azul I agree.",
          zh: "最后一步。谷歌会显示它的隐私条款。用鼠标滚轮往下滚到最底下，然后点蓝色的 I agree 按钮。",
          hi: "आखिरी कदम। Google अपने निजता के नियम दिखाता है। माउस के पहिये से नीचे तक जाइए, फिर नीले I agree बटन पर क्लिक कीजिए।",
        },
      },
      {
        id: "done",
        detect: ["Welcome,", "Manage your info, privacy, and security"],
        target: null,
        done: true,
        text: {
          en: "Your Google account is ready. Your new Gmail address is how you sign in from now on. Keep your password written down somewhere safe.",
          es: "Su cuenta de Google está lista. Su nueva dirección de Gmail es con la que entrará de ahora en adelante. Guarde su contraseña anotada en un lugar seguro.",
          zh: "您的谷歌账号建好了。以后就用您的新 Gmail 地址登录。把密码写下来，放在安全的地方。",
          hi: "आपका Google अकाउंट तैयार है। अब से आप अपने नए Gmail पते से साइन इन करेंगे। अपना पासवर्ड लिखकर किसी सुरक्षित जगह रखिए।",
        },
      },
    ],
  },
};

export function findGuide(query, lang) {
  const q = query.toLowerCase();
  for (const [id, g] of Object.entries(GUIDES)) {
    const keys = [...(g.match[lang] || []), ...(lang !== "en" ? g.match.en : [])];
    if (keys.some((k) => q.includes(k))) return { id, guide: g };
  }
  return null;
}

export const say = (dict, lang) => dict[lang] || dict.en;

export function detectWords(guide) {
  return [...new Set(guide.pages.flatMap((p) => p.detect))];
}

// Of the words found on screen, the page furthest along the flow.
export function bestPage(guide, foundWords) {
  const found = new Set(foundWords.map((w) => w.toLowerCase()));
  let best = null;
  guide.pages.forEach((p, i) => { if (p.detect.some((d) => found.has(d.toLowerCase()))) best = { page: p, index: i }; });
  return best?.page || null;
}

export function pageForWord(guide, word) {
  const w = (word || "").toLowerCase();
  return guide.pages.find((p) => p.detect.some((d) => d.toLowerCase() === w)) || null;
}

// Every fixed sentence, for the pre-recorded voice pack.
export function allGuideLines(lang) {
  const out = [];
  for (const g of Object.values(GUIDES)) {
    for (const d of [g.start, g.wrongPage]) out.push(say(d, lang));
    for (const p of g.pages) {
      out.push(say(p.text, lang));
      for (const v of Object.values(p.textIf || {})) out.push(say(v, lang));
      for (const st of p.target?.steps || []) if (st.cue && st.cue !== "next") out.push(say(st.cue, lang));
    }
  }
  return out;
}

// The boxes of a page in order, whichever way the page describes them.
export function stepsOf(page) {
  if (!page.target) return [];
  if (page.target.steps) return page.target.steps;
  return [{ labels: page.target.labels }];
}

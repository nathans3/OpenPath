// Built-in instruction library. This is what OpenPath says when there is no
// Claude key, no internet, or the request matches a common workflow (which
// also means no tokens are spent). Each workflow is a short list of single
// steps; the engine hands out one step at a time and advances when the person
// says "done", "next" or "ready".
//
// Demo languages: English, Spanish, Chinese and Hindi, all fully written.
// Workflows tied to a practice screen (`screens`) only run on that Test Lab
// screen. On the person's real screen OpenPath uses the general workflows
// and Claude, because scripted directions for a practice page would be wrong
// on a real website.

const W = {
  // ---------- Medical portal ----------
  portal_login: {
    match: {
      en: ["log in", "login", "sign in", "test results", "results", "portal", "doctor", "mychart", "appointment", "username", "password"],
      es: ["entrar", "iniciar", "resultados", "portal", "doctor", "cita", "usuario", "contraseña"],
      zh: ["登录", "登入", "结果", "化验", "医生", "预约", "用户名", "密码"],
      hi: ["लॉग इन", "लॉगिन", "साइन इन", "रिपोर्ट", "नतीजे", "रिज़ल्ट", "डॉक्टर", "पोर्टल", "पासवर्ड", "यूज़रनेम", "अपॉइंटमेंट"],
    },
    screens: ["portal"],
    steps: {
      en: [
        "Look at the white box in the middle of the screen. Click inside the first empty field, the one labeled Username. Tell me when you're ready.",
        "Now type your username. It's usually your email address. Take your time, I'll wait.",
        "Good. Click the next field, labeled Password, and type your password yourself. I won't read it or say it out loud.",
        "Now click the big blue button that says Sign In, right under the fields.",
        "You're in. Look for a tab or button that says Test Results, usually near the top. Click it when you see it.",
      ],
      es: [
        "Mire el cuadro blanco en el centro de la pantalla. Haga clic dentro del primer campo vacío, el que dice Username, o usuario. Dígame cuando esté lista.",
        "Ahora escriba su nombre de usuario. Suele ser su correo electrónico. Tómese su tiempo, yo espero.",
        "Bien. Haga clic en el siguiente campo, el que dice Password, y escriba su contraseña usted misma. Yo no la leeré ni la diré en voz alta.",
        "Ahora haga clic en el botón azul grande que dice Sign In, justo debajo de los campos.",
        "Ya entró. Busque una pestaña o botón que diga Test Results, resultados, normalmente arriba. Haga clic cuando lo vea.",
      ],
      zh: [
        "看屏幕中间的白色方框。点一下第一个空格，就是写着 Username（用户名）的那个。准备好了告诉我。",
        "现在输入您的用户名，通常是您的电子邮箱。慢慢来，我等您。",
        "很好。点下一个格子，写着 Password（密码）的，然后自己输入密码。我不会读它，也不会念出来。",
        "现在点那个大的蓝色按钮，写着 Sign In（登录），就在格子下面。",
        "您已经进去了。找一个写着 Test Results（化验结果）的标签或按钮，通常在上面。看到了就点它。",
      ],
      hi: [
        "स्क्रीन के बीच में सफ़ेद डिब्बा देखिए। पहले खाली खाने में क्लिक कीजिए, जिस पर Username लिखा है। तैयार हों तो बताइए।",
        "अब अपना यूज़रनेम लिखिए। यह आमतौर पर आपका ईमेल पता होता है। आराम से लिखिए, मैं इंतज़ार कर रही हूँ।",
        "बहुत अच्छे। अगले खाने में क्लिक कीजिए, जिस पर Password लिखा है, और अपना पासवर्ड खुद लिखिए। मैं उसे न पढ़ूँगी, न बोलूँगी।",
        "अब खानों के ठीक नीचे वाला बड़ा नीला बटन दबाइए, जिस पर Sign In लिखा है।",
        "आप अंदर आ गए। ऊपर की तरफ़ Test Results लिखा बटन या टैब ढूँढिए। दिखे तो उस पर क्लिक कीजिए।",
      ],
    },
  },
  portal_forgot: {
    match: {
      en: ["forgot", "don't remember", "dont remember", "reset", "can't remember"],
      es: ["olvidé", "no recuerdo", "no me acuerdo", "restablecer"],
      zh: ["忘了", "忘记", "不记得", "重置"],
      hi: ["भूल गया", "भूल गई", "याद नहीं", "रीसेट"],
    },
    screens: ["portal"],
    steps: {
      en: [
        "That's okay, it happens to everyone. Under the blue Sign In button there is a small blue link that says Forgot username or password. Click that.",
        "It will ask for your email. Type it in and click the button below it. Then check your email for a message from Riverside Health.",
      ],
      es: [
        "No pasa nada, le pasa a todo el mundo. Debajo del botón azul Sign In hay un enlace azul pequeño que dice Forgot username or password. Haga clic ahí.",
        "Le pedirá su correo electrónico. Escríbalo y haga clic en el botón de abajo. Luego revise su correo; le llegará un mensaje de Riverside Health.",
      ],
      zh: [
        "没关系，每个人都会忘。在蓝色 Sign In 按钮下面，有一行小的蓝色字：Forgot username or password（忘记用户名或密码）。点它。",
        "它会让您输入电子邮箱。输入后点下面的按钮，然后去查看您的邮箱，会有一封 Riverside Health 发来的邮件。",
      ],
      hi: [
        "कोई बात नहीं, ऐसा सबके साथ होता है। नीले Sign In बटन के नीचे एक छोटा नीला लिंक है: Forgot username or password. उस पर क्लिक कीजिए।",
        "वह आपका ईमेल पूछेगा। ईमेल लिखकर नीचे वाला बटन दबाइए। फिर अपने ईमेल में Riverside Health का संदेश देखिए।",
      ],
    },
  },

  // ---------- Bank ----------
  bank_balance: {
    match: {
      en: ["how much", "balance", "money do i have", "checking", "savings", "in my account"],
      es: ["cuánto", "saldo", "dinero tengo", "cheques", "ahorros", "en mi cuenta"],
      zh: ["多少钱", "余额", "支票", "储蓄", "账户里"],
      hi: ["कितने पैसे", "बैलेंस", "चेकिंग", "बचत", "सेविंग्स", "खाते में"],
    },
    screens: ["bank"],
    steps: {
      en: [
        "You can see it right here. Look at the first card under the green bar. It says Everyday Checking, and the big number is your balance: two thousand three hundred eighteen dollars and forty cents.",
        "Below it, the Savings card shows eleven thousand five hundred two dollars. Nothing to click. You're all set.",
      ],
      es: [
        "Lo puede ver aquí mismo. Mire la primera tarjeta debajo de la barra verde. Dice Everyday Checking, cuenta de cheques, y el número grande es su saldo: dos mil trescientos dieciocho dólares con cuarenta centavos.",
        "Debajo, la tarjeta Savings, ahorros, muestra once mil quinientos dos dólares. No hay que hacer clic en nada. Listo.",
      ],
      zh: [
        "您在这里就能看到。看绿色横条下面的第一张卡片，写着 Everyday Checking（日常支票账户），大的数字就是您的余额：两千三百一十八美元四十美分。",
        "下面那张 Savings（储蓄）卡片显示一万一千五百零二美元。不用点任何东西，这样就可以了。",
      ],
      hi: [
        "यह यहीं दिख रहा है। हरी पट्टी के नीचे पहला कार्ड देखिए, जिस पर Everyday Checking लिखा है। बड़ा अंक आपका बैलेंस है: दो हज़ार तीन सौ अठारह डॉलर और चालीस सेंट।",
        "उसके नीचे Savings कार्ड में ग्यारह हज़ार पाँच सौ दो डॉलर हैं। कुछ क्लिक करने की ज़रूरत नहीं। बस इतना ही।",
      ],
    },
  },
  bank_paybill: {
    match: {
      en: ["pay", "bill", "electric", "electricity", "water bill", "phone bill"],
      es: ["pagar", "factura", "recibo", "luz", "electricidad", "agua"],
      zh: ["付", "交费", "账单", "电费", "水费", "电话费"],
      hi: ["बिल", "भुगतान", "बिजली", "पानी का बिल", "फ़ोन का बिल", "चुकाना"],
    },
    screens: ["bank"],
    steps: {
      en: [
        "Look at the row of buttons under your account cards. Click the one that says Pay bills, the second button from the left.",
        "You'll see a list of companies you've paid before. Click City Electric.",
        "Type the amount from your paper bill into the Amount box, then click the green Pay button. Check the amount twice before you click.",
      ],
      es: [
        "Mire la fila de botones debajo de las tarjetas de sus cuentas. Haga clic en el que dice Pay bills, pagar facturas, el segundo desde la izquierda.",
        "Verá una lista de compañías a las que ya ha pagado. Haga clic en City Electric.",
        "Escriba la cantidad de su factura de papel en el cuadro Amount, cantidad, y luego haga clic en el botón verde Pay. Revise la cantidad dos veces antes de hacer clic.",
      ],
      zh: [
        "看账户卡片下面那一排按钮。点写着 Pay bills（付账单）的那个，从左边数第二个。",
        "您会看到以前付过款的公司列表。点 City Electric（市电力公司）。",
        "把纸质账单上的金额输入 Amount（金额）框，然后点绿色的 Pay（付款）按钮。点之前请再核对一遍金额。",
      ],
      hi: [
        "खातों के कार्ड के नीचे बटनों की कतार देखिए। Pay bills वाला बटन दबाइए, बाईं ओर से दूसरा।",
        "आपको उन कंपनियों की सूची दिखेगी जिन्हें आप पहले पैसे दे चुके हैं। City Electric पर क्लिक कीजिए।",
        "कागज़ के बिल से रकम Amount वाले खाने में लिखिए, फिर हरा Pay बटन दबाइए। दबाने से पहले रकम दो बार जाँच लीजिए।",
      ],
    },
  },
  bank_signout: {
    match: {
      en: ["sign out", "log out", "logout", "finished", "leave the bank"],
      es: ["salir", "cerrar sesión", "terminé"],
      zh: ["退出", "登出", "完成了"],
      hi: ["साइन आउट", "लॉग आउट", "बाहर निकलना"],
    },
    screens: ["bank"],
    steps: {
      en: ["Good habit. Look at the very top right corner for the words Sign out, and click them. That keeps your money safe."],
      es: ["Buena costumbre. Mire la esquina superior derecha, busque las palabras Sign out, salir, y haga clic. Así su dinero queda protegido."],
      zh: ["好习惯。看屏幕右上角，找到 Sign out（退出）两个字，点一下。这样您的钱更安全。"],
      hi: ["अच्छी आदत है। स्क्रीन के बिल्कुल ऊपर दाएँ कोने में Sign out लिखा है, उस पर क्लिक कीजिए। इससे आपका पैसा सुरक्षित रहता है।"],
    },
  },

  // ---------- Video call ----------
  video_camera: {
    match: {
      en: ["can't see me", "cant see me", "camera", "video", "see my face", "turn on"],
      es: ["no me ve", "cámara", "video", "mi cara", "encender"],
      zh: ["看不到我", "摄像头", "视频", "我的脸", "打开"],
      hi: ["देख नहीं", "मुझे नहीं देख", "कैमरा", "वीडियो", "मेरा चेहरा"],
    },
    screens: ["videocall"],
    steps: {
      en: [
        "Look at the row of round buttons at the bottom of the call. Find the camera icon with a line through it. It says Start video underneath. Click it once.",
        "Your face should appear in the small box in the corner. If it's dark, look for a little sticker or cover over the camera at the top of your screen and slide it open.",
      ],
      es: [
        "Mire la fila de botones redondos en la parte de abajo de la llamada. Busque el icono de cámara con una línea cruzada. Debajo dice Start video. Haga clic una vez.",
        "Su cara debería aparecer en el cuadrito de la esquina. Si está oscuro, busque una pegatina o tapa sobre la cámara, arriba de la pantalla, y deslícela.",
      ],
      zh: [
        "看通话画面下面那一排圆形按钮。找到那个画着一条斜线的摄像头图标，下面写着 Start video（开启视频）。点一下。",
        "您的脸应该会出现在角落的小框里。如果是黑的，看看屏幕顶部的摄像头上有没有贴纸或挡板，把它推开。",
      ],
      hi: [
        "कॉल के नीचे गोल बटनों की कतार देखिए। कटी हुई लकीर वाले कैमरे का बटन ढूँढिए, उसके नीचे Start video लिखा है। उसे एक बार दबाइए।",
        "कोने के छोटे डिब्बे में आपका चेहरा दिखना चाहिए। अगर वह काला है, तो स्क्रीन के ऊपर कैमरे पर कोई स्टिकर या ढक्कन तो नहीं, उसे हटा दीजिए।",
      ],
    },
  },
  video_mute: {
    match: {
      en: ["can't hear me", "cant hear me", "mute", "microphone", "sound"],
      es: ["no me oye", "silencio", "micrófono", "sonido"],
      zh: ["听不到我", "静音", "麦克风", "声音"],
      hi: ["मुझे सुन नहीं", "म्यूट", "माइक", "मेरी आवाज़ नहीं"],
    },
    screens: ["videocall"],
    steps: {
      en: ["At the bottom, the first round button is the microphone. If it has a line through it, you're muted. Click it once and the line goes away."],
      es: ["Abajo, el primer botón redondo es el micrófono. Si tiene una línea cruzada, está en silencio. Haga clic una vez y la línea desaparece."],
      zh: ["最下面第一个圆按钮是麦克风。如果上面有一条斜线，说明您被静音了。点一下，斜线就没了。"],
      hi: ["नीचे पहला गोल बटन माइक्रोफ़ोन का है। अगर उस पर तिरछी लकीर है, तो आप म्यूट हैं। उसे एक बार दबाइए, लकीर हट जाएगी।"],
    },
  },
  video_leave: {
    match: {
      en: ["hang up", "end the call", "leave", "goodbye"],
      es: ["colgar", "terminar la llamada", "salir"],
      zh: ["挂断", "结束通话", "离开"],
      hi: ["फ़ोन रखना", "कॉल खत्म", "कॉल बंद", "अलविदा"],
    },
    screens: ["videocall"],
    steps: {
      en: ["Say goodbye first, then click the red button on the right that says Leave. That ends the call."],
      es: ["Despídase primero y luego haga clic en el botón rojo de la derecha que dice Leave, salir. Eso termina la llamada."],
      zh: ["先说再见，然后点右边红色的 Leave（离开）按钮，通话就结束了。"],
      hi: ["पहले अलविदा कहिए, फिर दाईं ओर लाल Leave बटन दबाइए। कॉल खत्म हो जाएगी।"],
    },
  },

  // ---------- Email ----------
  email_pharmacy: {
    match: {
      en: ["pharmacy", "prescription", "pickup", "medicine"],
      es: ["farmacia", "receta", "medicina", "recoger"],
      zh: ["药房", "处方", "取药", "药"],
      hi: ["दवा", "दवाई", "फ़ार्मेसी", "प्रिस्क्रिप्शन"],
    },
    screens: ["email"],
    steps: {
      en: ["Click the first message in the list, from Riverside Pharmacy. It opens on the right. It says your prescription is ready to pick up."],
      es: ["Haga clic en el primer mensaje de la lista, de Riverside Pharmacy. Se abre a la derecha. Dice que su receta está lista para recoger."],
      zh: ["点列表里第一封邮件，来自 Riverside Pharmacy（药房）。它会在右边打开。上面说您的药已经可以去取了。"],
      hi: ["सूची में पहला संदेश, Riverside Pharmacy वाला, क्लिक कीजिए। वह दाईं ओर खुलेगा। उसमें लिखा है कि आपकी दवा लेने के लिए तैयार है।"],
    },
  },
  email_statement: {
    match: {
      en: ["statement", "bank email", "harbor"],
      es: ["estado de cuenta", "banco"],
      zh: ["对账单", "银行邮件"],
      hi: ["स्टेटमेंट", "बैंक का ईमेल"],
    },
    screens: ["email"],
    steps: {
      en: ["Click the third message, from Harbor Community Bank. Don't click any links inside it. To see your statement safely, open the bank's own website instead."],
      es: ["Haga clic en el tercer mensaje, de Harbor Community Bank. No haga clic en ningún enlace dentro. Para ver su estado de cuenta con seguridad, mejor abra la página del banco directamente."],
      zh: ["点第三封邮件，来自 Harbor Community Bank（银行）。不要点里面的任何链接。想安全地看对账单，请直接打开银行自己的网站。"],
      hi: ["तीसरा संदेश, Harbor Community Bank वाला, क्लिक कीजिए। उसके अंदर किसी लिंक पर क्लिक मत कीजिए। स्टेटमेंट सुरक्षित तरीके से देखने के लिए बैंक की अपनी वेबसाइट खोलिए।"],
    },
  },

  // ---------- Real apps (work on the person's real screen) ----------
  // `apps` lists words that identify the app in a window title or in what the
  // person said. "{mod}" becomes Command on a Mac and Control on Windows.
  browser_new_tab: {
    match: {
      en: ["open a new tab", "new tab", "new browser tab", "browser tab"],
      es: ["nueva pestaña", "abrir una pestaña", "pestaña del navegador"],
      zh: ["新标签", "打开新标签", "浏览器标签"],
      hi: ["नया टैब", "टैब खोल", "ब्राउज़र का टैब"],
    },
    screens: null,
    steps: {
      en: ["Hold down {mod} and press T. A fresh, empty tab opens at the top of your browser. Type a website or what you're looking for, then press Return."],
      es: ["Mantenga apretada {mod} y pulse T. Se abre una pestaña nueva y vacía arriba del navegador. Escriba una página o lo que busca y pulse Intro."],
      zh: ["按住 {mod} 键，再按 T。浏览器上方会打开一个新的空白标签页。输入网址或您想找的东西，然后按回车。"],
      hi: ["{mod} दबाकर रखिए और T दबाइए। ब्राउज़र के ऊपर एक नया खाली टैब खुलेगा। कोई वेबसाइट या जो ढूँढना है वह लिखिए, फिर Return दबाइए।"],
    },
  },
  docs_new_tab: {
    apps: ["google docs", "docs", "document", "documento", "文档", "डॉक्यूमेंट", "डॉक"],
    match: {
      en: ["new tab", "add a tab", "another tab", "tab"],
      es: ["nueva pestaña", "pestaña"],
      zh: ["新标签", "标签页", "标签"],
      hi: ["नया टैब", "टैब"],
    },
    screens: null,
    steps: {
      en: [
        "In your Google Doc, look at the menu words along the top: File, Edit, View, Insert. Click Insert.",
        "A list drops down. Near the bottom, click Tab. A new tab appears in the panel on the left side of the page.",
        "To name it, double-click the new tab on the left, type a name, and press Return. If you meant a new browser tab instead, press {mod} and T together.",
      ],
      es: [
        "En su documento de Google, mire las palabras del menú de arriba: Archivo, Editar, Ver, Insertar. Haga clic en Insertar.",
        "Se abre una lista. Cerca del final, haga clic en Pestaña. Aparece una pestaña nueva en el panel del lado izquierdo.",
        "Para ponerle nombre, haga doble clic en la pestaña nueva a la izquierda, escriba el nombre y pulse Intro. Si quería una pestaña nueva del navegador, pulse {mod} y T a la vez.",
      ],
      zh: [
        "在您的谷歌文档里，看最上面的菜单：文件、修改、查看、插入。点「插入」。",
        "会弹出一个列表。在靠下的地方点「标签页」。左边的面板里就会出现一个新的标签页。",
        "想给它起名字，就双击左边的新标签页，输入名字，然后按回车。如果您想要的是浏览器的新标签页，同时按 {mod} 和 T。",
      ],
      hi: [
        "अपने Google Doc में सबसे ऊपर मेन्यू के शब्द देखिए: File, Edit, View, Insert. Insert पर क्लिक कीजिए।",
        "एक सूची खुलेगी। नीचे की तरफ़ Tab पर क्लिक कीजिए। पेज के बाईं ओर वाले पैनल में एक नया टैब दिखेगा।",
        "उसका नाम रखने के लिए बाईं ओर नए टैब पर दो बार क्लिक कीजिए, नाम लिखिए और Return दबाइए। अगर आपको ब्राउज़र का नया टैब चाहिए था, तो {mod} और T एक साथ दबाइए।",
      ],
    },
  },
  docs_new_doc: {
    apps: ["google docs", "docs", "document", "documento", "文档", "डॉक्यूमेंट", "डॉक"],
    match: {
      en: ["new document", "new doc", "blank document", "start a document"],
      es: ["documento nuevo", "nuevo documento"],
      zh: ["新文档", "新建文档"],
      hi: ["नया डॉक्यूमेंट", "नया दस्तावेज़"],
    },
    screens: null,
    steps: {
      en: ["Click File, the first word in the menu at the top of your document.", "Point to New, then click Document. A blank page opens in a new browser tab."],
      es: ["Haga clic en Archivo, la primera palabra del menú de arriba.", "Ponga el ratón sobre Nuevo y haga clic en Documento. Se abre una página en blanco en una pestaña nueva."],
      zh: ["点文档最上面菜单里的第一个词「文件」。", "把鼠标移到「新建」上，再点「文档」。一个空白页会在新的浏览器标签页里打开。"],
      hi: ["डॉक्यूमेंट के सबसे ऊपर मेन्यू में पहला शब्द File है, उस पर क्लिक कीजिए।", "माउस को New पर ले जाइए, फिर Document पर क्लिक कीजिए। नए ब्राउज़र टैब में एक खाली पेज खुलेगा।"],
    },
  },
  docs_share: {
    apps: ["google docs", "docs", "sheets", "slides", "drive", "document", "documento", "文档", "डॉक्यूमेंट"],
    match: {
      en: ["share", "send this document", "let someone see"],
      es: ["compartir"],
      zh: ["分享", "共享"],
      hi: ["शेयर", "साझा"],
    },
    screens: null,
    steps: {
      en: ["Look at the top right corner of the page for a blue button that says Share. Click it.", "Type the email address of the person you want to share with, then click the blue Send button. Only share with people you know."],
      es: ["Mire la esquina superior derecha: hay un botón azul que dice Compartir. Haga clic.", "Escriba el correo de la persona con quien quiere compartir y haga clic en el botón azul Enviar. Comparta solo con gente que conoce."],
      zh: ["看页面右上角，有一个蓝色按钮写着「共享」。点它。", "输入您想分享的人的电子邮箱，然后点蓝色的「发送」按钮。只分享给您认识的人。"],
      hi: ["पेज के ऊपर दाएँ कोने में नीला बटन देखिए, जिस पर Share लिखा है। उस पर क्लिक कीजिए।", "जिसके साथ शेयर करना है उसका ईमेल लिखिए, फिर नीला Send बटन दबाइए। सिर्फ़ जान-पहचान वालों के साथ शेयर कीजिए।"],
    },
  },
  gmail_compose: {
    apps: ["gmail", "mail", "inbox", "correo", "邮件", "ईमेल"],
    match: {
      en: ["write an email", "send an email", "new email", "compose"],
      es: ["escribir un correo", "enviar un correo", "correo nuevo"],
      zh: ["写邮件", "发邮件", "新邮件"],
      hi: ["ईमेल लिख", "ईमेल भेज", "नया ईमेल"],
    },
    screens: null,
    steps: {
      en: [
        "In Gmail, look at the top left for a button with a pencil that says Compose. Click it.",
        "A small window opens at the bottom right. In To, type the person's email address. In Subject, type a few words about the message.",
        "Click the big white space below and write your message. When you're done, click the blue Send button at the bottom.",
      ],
      es: [
        "En Gmail, mire arriba a la izquierda: hay un botón con un lápiz que dice Redactar. Haga clic.",
        "Se abre una ventanita abajo a la derecha. En Para, escriba el correo de la persona. En Asunto, unas palabras sobre el mensaje.",
        "Haga clic en el espacio blanco grande de abajo y escriba su mensaje. Cuando termine, haga clic en el botón azul Enviar.",
      ],
      zh: [
        "在 Gmail 里，看左上角有一个带铅笔的按钮，写着「写邮件」。点它。",
        "右下角会打开一个小窗口。在「收件人」里输入对方的邮箱，在「主题」里写几个字说明内容。",
        "点下面大的空白处，写您的信。写完后，点下面蓝色的「发送」按钮。",
      ],
      hi: [
        "Gmail में ऊपर बाईं ओर पेंसिल वाला बटन देखिए, जिस पर Compose लिखा है। उस पर क्लिक कीजिए।",
        "नीचे दाईं ओर एक छोटी खिड़की खुलेगी। To में उस व्यक्ति का ईमेल लिखिए। Subject में संदेश के बारे में कुछ शब्द लिखिए।",
        "नीचे की बड़ी खाली जगह पर क्लिक करके अपना संदेश लिखिए। हो जाए तो नीचे नीला Send बटन दबाइए।",
      ],
    },
  },
  browser_back: {
    match: {
      en: ["go back", "previous page", "back to the last page"],
      es: ["volver atrás", "página anterior"],
      zh: ["返回", "上一页"],
      hi: ["वापस जाना", "पिछला पेज", "पीछे जाना"],
    },
    screens: null,
    steps: {
      en: ["Look at the top left corner of your browser for an arrow pointing left. Click it once to go back one page."],
      es: ["Mire la esquina superior izquierda del navegador: hay una flecha que apunta a la izquierda. Haga clic una vez para volver a la página anterior."],
      zh: ["看浏览器左上角，有一个指向左边的箭头。点一下就回到上一页。"],
      hi: ["ब्राउज़र के ऊपर बाएँ कोने में बाईं ओर इशारा करता तीर देखिए। उस पर एक बार क्लिक कीजिए, आप पिछले पेज पर पहुँच जाएँगे।"],
    },
  },
  undo: {
    match: {
      en: ["undo", "made a mistake", "take that back", "deleted by accident"],
      es: ["deshacer", "me equivoqué", "borré sin querer"],
      zh: ["撤销", "弄错了", "不小心删"],
      hi: ["अनडू", "गलती हो गई", "गलती से मिटा"],
    },
    screens: null,
    steps: {
      en: ["No problem. Hold down {mod} and press Z. Each press takes back one change. Tell me when it looks right again."],
      es: ["No pasa nada. Mantenga apretada {mod} y pulse Z. Cada vez deshace un cambio. Dígame cuando vuelva a estar bien."],
      zh: ["没关系。按住 {mod} 键，再按 Z。每按一次就撤回一步。恢复好了就告诉我。"],
      hi: ["कोई बात नहीं। {mod} दबाकर रखिए और Z दबाइए। हर बार एक बदलाव वापस हो जाएगा। ठीक लगने लगे तो बताइए।"],
    },
  },
  copy_paste: {
    match: {
      en: ["copy", "paste"],
      es: ["copiar", "pegar"],
      zh: ["复制", "粘贴"],
      hi: ["कॉपी", "पेस्ट"],
    },
    screens: null,
    steps: {
      en: [
        "First, select the words: click just before the first word, hold the mouse button down, and drag to the end. The words turn blue.",
        "Now hold {mod} and press C to copy.",
        "Click where you want the words to go, then hold {mod} and press V to paste.",
      ],
      es: [
        "Primero seleccione las palabras: haga clic justo antes de la primera, mantenga apretado el botón del ratón y arrastre hasta el final. Las palabras se ponen azules.",
        "Ahora mantenga {mod} y pulse C para copiar.",
        "Haga clic donde quiere ponerlas, mantenga {mod} y pulse V para pegar.",
      ],
      zh: [
        "先选中文字：在第一个字前面点一下，按住鼠标左键，拖到最后。文字会变成蓝色。",
        "现在按住 {mod} 键，再按 C，就复制好了。",
        "在您想放文字的地方点一下，然后按住 {mod} 键，再按 V，就粘贴好了。",
      ],
      hi: [
        "पहले शब्द चुनिए: पहले शब्द के ठीक पहले क्लिक कीजिए, माउस का बटन दबाए रखिए और आखिर तक खींचिए। शब्द नीले हो जाएँगे।",
        "अब {mod} दबाकर रखिए और C दबाइए। शब्द कॉपी हो गए।",
        "जहाँ शब्द लगाने हैं वहाँ क्लिक कीजिए, फिर {mod} दबाकर रखिए और V दबाइए।",
      ],
    },
  },

  // ---------- Anywhere (also used on the real screen) ----------
  bigger_text: {
    match: {
      en: ["bigger", "larger", "too small", "can't read", "zoom", "words"],
      es: ["más grande", "muy pequeñ", "no puedo leer", "letras", "agrandar"],
      zh: ["变大", "太小", "看不清", "放大", "字"],
      hi: ["बड़ा", "बड़े", "बड़े अक्षर", "बहुत छोटा", "पढ़ नहीं", "ज़ूम", "अक्षर"],
    },
    screens: null,
    steps: {
      en: ["Hold down the {mod} key, the one next to the space bar, and tap the plus key. Each tap makes everything bigger. Tell me when it's easy to read."],
      es: ["Mantenga apretada la tecla {mod}, la que está junto a la barra espaciadora, y toque la tecla más. Cada toque agranda todo. Dígame cuando se lea bien."],
      zh: ["按住 {mod} 键，就是空格键旁边那个，然后按一下加号键。每按一次，所有东西都会变大。看得清楚了就告诉我。"],
      hi: ["{mod} बटन दबाकर रखिए, जो स्पेस बार के पास है, और प्लस बटन दबाइए। हर बार दबाने पर सब कुछ बड़ा हो जाएगा। आराम से पढ़ने लगें तो बताइए।"],
    },
  },
  volume: {
    match: {
      en: ["louder", "volume", "can't hear you", "quiet", "softer"],
      es: ["más fuerte", "volumen", "no le oigo", "más bajo"],
      zh: ["大声", "音量", "听不见你", "小声"],
      hi: ["आवाज़ तेज़", "वॉल्यूम", "सुनाई नहीं", "धीमी आवाज़"],
    },
    screens: null,
    steps: {
      en: ["Look at the top row of your keyboard for a little speaker picture. Tap the one with more sound waves to make me louder, or fewer waves for softer."],
      es: ["Mire la fila de arriba del teclado y busque un dibujito de altavoz. Toque el que tiene más ondas para subir mi voz, o menos ondas para bajarla."],
      zh: ["看键盘最上面一排，找一个小喇叭的图案。按那个声波多的键，我的声音就变大；声波少的键，声音就变小。"],
      hi: ["कीबोर्ड की सबसे ऊपर वाली कतार में छोटे स्पीकर का निशान ढूँढिए। ज़्यादा लहरों वाला बटन मेरी आवाज़ तेज़ करेगा, कम लहरों वाला धीमी।"],
    },
  },
  open_mail: {
    match: {
      en: ["open mail", "open my email", "check email", "my email"],
      es: ["abrir correo", "ver mi correo", "mis correos"],
      zh: ["打开邮件", "看邮件", "我的邮箱"],
      hi: ["ईमेल खोल", "मेल खोल", "मेरा ईमेल", "ईमेल देख"],
    },
    screens: ["desktop"],
    steps: {
      en: ["Look at the row of pictures along the bottom of the screen. Click the one that looks like a white envelope. That's Mail."],
      es: ["Mire la fila de dibujos en la parte de abajo de la pantalla. Haga clic en el que parece un sobre blanco. Ese es el correo."],
      zh: ["看屏幕最下面那一排图标。点那个像白色信封的，那就是邮件。"],
      hi: ["स्क्रीन के सबसे नीचे तस्वीरों की कतार देखिए। सफ़ेद लिफ़ाफ़े जैसी तस्वीर पर क्लिक कीजिए। वही Mail है।"],
    },
  },
  call_family: {
    match: {
      en: ["call maria", "video call", "call my daughter", "familycall", "see my family"],
      es: ["llamar a maría", "videollamada", "llamar a mi hija"],
      zh: ["打给玛丽亚", "视频通话", "打给女儿"],
      hi: ["मारिया को", "वीडियो कॉल", "बेटी को फ़ोन"],
    },
    screens: ["desktop"],
    steps: {
      en: ["At the bottom of the screen, click the green icon with two faces. That's FamilyCall. Then click Maria's picture, and the call starts."],
      es: ["En la parte de abajo de la pantalla, haga clic en el icono verde con dos caras. Es FamilyCall. Luego haga clic en la foto de María y empieza la llamada."],
      zh: ["在屏幕最下面，点那个绿色的、有两张脸的图标，那是 FamilyCall。然后点玛丽亚的照片，通话就开始了。"],
      hi: ["स्क्रीन के नीचे दो चेहरों वाला हरा निशान दबाइए। वह FamilyCall है। फिर मारिया की तस्वीर पर क्लिक कीजिए, कॉल शुरू हो जाएगी।"],
    },
  },
  time: {
    match: {
      en: ["what time", "the time", "what day", "date today"],
      es: ["qué hora", "la hora", "qué día", "fecha"],
      zh: ["几点", "时间", "星期几", "日期"],
      hi: ["कितने बजे", "समय", "क्या तारीख", "कौन सा दिन"],
    },
    screens: null,
    dynamic: (lang) => {
      const d = new Date();
      const loc = { en: "en-US", es: "es-ES", zh: "zh-CN", hi: "hi-IN" }[lang] || "en-US";
      const time = d.toLocaleTimeString(loc, { hour: "numeric", minute: "2-digit" });
      const day = d.toLocaleDateString(loc, { weekday: "long", month: "long", day: "numeric" });
      return {
        en: `It's ${time} on ${day}. You can always see the time in the top right corner.`,
        es: `Son las ${time}, ${day}. La hora siempre está en la esquina superior derecha.`,
        zh: `现在是${day}${time}。时间一直显示在屏幕右上角。`,
        hi: `अभी ${day}, ${time} हैं। समय हमेशा स्क्रीन के ऊपर दाएँ कोने में दिखता है।`,
      }[lang] || `It's ${time} on ${day}.`;
    },
  },
  thanks: {
    match: {
      en: ["thank you", "thanks", "that's all", "bye"],
      es: ["gracias", "eso es todo", "adiós"],
      zh: ["谢谢", "就这样", "再见"],
      hi: ["धन्यवाद", "शुक्रिया", "बस इतना ही"],
    },
    screens: null,
    steps: {
      en: ["You're very welcome. I'm right here whenever you need me."],
      es: ["De nada. Aquí estoy cuando me necesite."],
      zh: ["不客气。您随时需要，我都在这里。"],
      hi: ["आपका स्वागत है। जब भी ज़रूरत हो, मैं यहीं हूँ।"],
    },
  },
};

const FALLBACK = {
  en: {
    withScreen: (title) => `This is the practice screen "${title}". Tell me in a few words what you'd like to do, for example "log in" or "pay a bill", and I'll guide you one step at a time.`,
    noScreen: "Tell me in a few words what you'd like to do, and I'll guide you one step at a time.",
    live: (names) => `I can see you have ${names} open. Tell me in a few words what you'd like to do, and I'll guide you one step at a time.`,
    noPermission: "I can't see which windows you have open yet. Ask a family member to allow OpenPath under Screen Recording in System Settings, or just tell me what you're trying to do.",
    needKey: (front) => `${front ? `I can see you're in "${front}". ` : ""}I don't have a built-in answer for that yet. To answer any question like this, OpenPath needs a Claude key. A family member can add one in Settings, under Keys.`,
    offline: "I can't reach the internet right now, so I can only help with the built-in guides. Please try again in a moment.",
  },
  es: {
    withScreen: (title) => `Esta es la pantalla de práctica "${title}". Dígame en pocas palabras qué quiere hacer, por ejemplo "entrar" o "pagar una factura", y la guío paso a paso.`,
    noScreen: "Dígame en pocas palabras qué quiere hacer y la guío paso a paso.",
    live: (names) => `Veo que tiene abierto ${names}. Dígame en pocas palabras qué quiere hacer y la guío paso a paso.`,
    noPermission: "Todavía no puedo ver qué ventanas tiene abiertas. Pida a un familiar que permita OpenPath en Grabación de pantalla, en Ajustes del Sistema, o dígame qué quiere hacer.",
    needKey: (front) => `${front ? `Veo que está en "${front}". ` : ""}Todavía no tengo una respuesta incorporada para eso. Para responder cualquier pregunta así, OpenPath necesita una clave de Claude. Un familiar puede ponerla en Ajustes, en Claves.`,
    offline: "Ahora no tengo internet, así que solo puedo ayudar con las guías incorporadas. Inténtelo de nuevo en un momento.",
  },
  zh: {
    withScreen: (title) => `这是练习页面「${title}」。用几个字告诉我您想做什么，比如「登录」或「交电费」，我会一步一步带您做。`,
    noScreen: "用几个字告诉我您想做什么，我会一步一步带您做。",
    live: (names) => `我看到您打开了${names}。用几个字告诉我您想做什么，我会一步一步带您做。`,
    noPermission: "我暂时看不到您打开了哪些窗口。请家人在系统设置的「屏幕录制」里允许 OpenPath，或者直接告诉我您想做什么。",
    needKey: (front) => `${front ? `我看到您正在用「${front}」。` : ""}这个问题我还没有现成的答案。要回答这类问题，OpenPath 需要一个 Claude 密钥，家人可以在「设置」的「密钥」里添加。`,
    offline: "现在连不上网，我只能用内置的指南帮您。请稍后再试。",
  },
  hi: {
    withScreen: (title) => `यह अभ्यास वाली स्क्रीन "${title}" है। कुछ शब्दों में बताइए कि आप क्या करना चाहते हैं, जैसे "लॉग इन" या "बिल भरना", और मैं एक-एक कदम करके बताऊँगी।`,
    noScreen: "कुछ शब्दों में बताइए कि आप क्या करना चाहते हैं, और मैं एक-एक कदम करके बताऊँगी।",
    live: (names) => `मुझे दिख रहा है कि आपने ${names} खोला हुआ है। कुछ शब्दों में बताइए कि आप क्या करना चाहते हैं, मैं एक-एक कदम करके बताऊँगी।`,
    noPermission: "मुझे अभी यह नहीं दिख रहा कि आपने कौन-सी खिड़कियाँ खोली हैं। परिवार के किसी सदस्य से System Settings में Screen Recording के अंदर OpenPath को अनुमति दिलवाइए, या मुझे सीधे बताइए कि आप क्या करना चाहते हैं।",
    needKey: (front) => `${front ? `मुझे दिख रहा है कि आप "${front}" में हैं। ` : ""}इसका तैयार जवाब अभी मेरे पास नहीं है। ऐसे किसी भी सवाल का जवाब देने के लिए OpenPath को Claude की कुंजी चाहिए। परिवार का कोई सदस्य इसे सेटिंग्स में, कुंजियाँ वाले हिस्से में जोड़ सकता है।`,
    offline: "अभी इंटरनेट नहीं मिल रहा, इसलिए मैं सिर्फ़ पहले से तैयार गाइड से मदद कर सकती हूँ। थोड़ी देर में फिर कोशिश कीजिए।",
  },
};

// "What can you see?" style questions get a description of the open windows.
const SEE_QUESTION = /(what (can|do) you see|what'?s on my screen|what is on my screen|what('s| is) open|qué ve|qué hay en mi pantalla|看到|屏幕上有什么|क्या दिख|स्क्रीन पर क्या)/i;

const ADVANCE = {
  en: ["done", "did it", "next", "ready", "okay", "ok", "yes", "finished", "i'm ready", "what now", "then what"],
  es: ["listo", "lista", "ya", "siguiente", "hecho", "sí", "ok", "y ahora"],
  zh: ["好了", "做好了", "下一步", "准备好了", "然后呢", "可以了", "嗯"],
  hi: ["हो गया", "हो गई", "अगला", "आगे", "तैयार", "ठीक है", "हाँ", "अब क्या"],
};
const REPEAT = {
  en: ["again", "repeat", "say that again", "what", "pardon", "didn't hear"],
  es: ["otra vez", "repite", "repita", "cómo", "no oí"],
  zh: ["再说一遍", "重复", "什么", "没听清"],
  hi: ["फिर से", "दोबारा", "क्या कहा", "सुनाई नहीं दिया"],
};

// Chinese is written without spaces, so match anywhere in the sentence.
export function isAdvance(q, lang) {
  const s = q.trim().toLowerCase().replace(/[.!?。！？]+$/, "");
  const list = ADVANCE[lang] || ADVANCE.en;
  if (lang === "zh") return list.some((k) => s.includes(k));
  return list.some((k) => s === k || s.startsWith(k + " ") || s.endsWith(" " + k)) || ADVANCE.en.includes(s);
}
export function isRepeat(q, lang) {
  const s = q.trim().toLowerCase();
  return (REPEAT[lang] || REPEAT.en).some((k) => s.includes(k));
}

function langOf(lang) { return W.portal_login.steps[lang] ? lang : "en"; }

function appSignal(wf, q, screen) {
  if (!wf.apps) return 0;
  if (wf.apps.some((a) => q.includes(a))) return 3;                         // named in the question
  const front = (screen?.windows?.[0] || "").toLowerCase();
  if (front && wf.apps.some((a) => front.includes(a))) return 1;            // the window in front
  return -1;                                                                 // app not involved
}

export function findWorkflow(query, lang, screen) {
  const L = langOf(lang);
  const q = query.toLowerCase();
  let best = null, bestScore = 0;
  for (const [id, wf] of Object.entries(W)) {
    if (screen?.live && wf.screens) continue;     // practice-screen scripts never run on the real screen
    const onScreen = !wf.screens || (screen && wf.screens.includes(screen.id));
    const keys = [...(wf.match[L] || []), ...(L !== "en" ? wf.match.en : [])];
    let score = 0;
    for (const k of keys) if (q.includes(k)) score += k.length > 4 ? 2 : 1;
    if (score === 0) continue;
    if (onScreen && wf.screens) score += 3;      // prefers workflows for the visible screen
    if (!onScreen && wf.screens) score -= 2;     // workflow for a different screen
    const app = appSignal(wf, q, screen);
    if (app < 0) continue;
    score += app;
    if (score > bestScore) { bestScore = score; best = { id, wf }; }
  }
  return bestScore >= 2 ? best : null;
}

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || "");
const MOD = IS_MAC ? "Command" : "Control";

export function workflowStep(found, index, lang) {
  const L = langOf(lang);
  if (found.wf.dynamic) return { text: found.wf.dynamic(L), index: 0, total: 1, last: true };
  const steps = found.wf.steps[L];
  const i = Math.min(index, steps.length - 1);
  return { text: steps[i].replaceAll("{mod}", MOD), index: i, total: steps.length, last: i === steps.length - 1 };
}

// reason: why no answer was found ("no_key", "offline", or null).
export function fallbackText(lang, screen, { reason = null, query = "" } = {}) {
  const L = langOf(lang);
  const f = FALLBACK[L];
  const quote = (n) => (L === "zh" ? `「${n}」` : `"${n}"`);
  if (screen?.live) {
    if (!screen.windows?.length) return f.noPermission;
    if (SEE_QUESTION.test(query)) return f.live(screen.windows.slice(0, 3).map(quote).join(L === "zh" ? "、" : ", "));
    if (reason === "offline") return f.offline;
    return f.needKey(screen.windows[0]);
  }
  if (reason === "offline") return f.offline;
  if (!screen && reason === "no_key") return f.needKey(null);
  return screen ? f.withScreen(screen.title) : f.noScreen;
}

export function hasOfflineLanguage(lang) { return !!W.portal_login.steps[lang]; }

import type { Dictionary } from '../types'

/**
 * Urdu (Pakistan) - written in Urdu script, in the register Pakistani sports
 * pages use: English football terms that fans actually say are transliterated
 * (لائن اپ، کارنر، آف سائیڈ، پوائنٹس ٹیبل) rather than replaced with literary
 * coinages nobody uses on a match day.
 *
 * Choices worth knowing before editing:
 * - "کل" means both yesterday and tomorrow in Urdu, so the date chips say
 *   "گزشتہ کل" / "آنے والا کل" instead of a bare کل.
 * - "Own goal" is "سیلف گول", the term used across South Asian commentary.
 * - Short status badges (FT/HT/LIVE) sit in a narrow column, so they use the
 *   shortest natural word: ختم، وقفہ، لائیو.
 * - Urdu punctuation: ۔ (full stop) and ، (comma). Placeholders such as
 *   {count} are filled with Latin digits, as Pakistani sports media print
 *   scores and times.
 *
 * Typed as `Dictionary`, so a key missing from this file - or one that no
 * longer exists in English - fails `tsc`.
 */
export const ur: Dictionary = {
  // ── App shell ──────────────────────────────────────────────────────────
  'app.name': '90 Min Tactics',
  'app.tagline': 'فٹبال کے لائیو اسکورز',
  'app.description': 'فٹبال کے لائیو اسکورز، لائن اپ، پوائنٹس ٹیبل اور اعداد و شمار۔',
  'app.logoAlt': '90 Min Tactics',

  // ── Navigation ─────────────────────────────────────────────────────────
  'nav.scores': 'اسکورز',
  'nav.leagues': 'لیگز',
  'nav.watch': 'دیکھیں',
  'nav.following': 'پسندیدہ',
  'nav.more': 'مزید',
  'nav.news': 'خبریں',
  'nav.transfers': 'ٹرانسفرز',
  'nav.about': 'تعارف',
  'nav.settings': 'ترتیبات',
  'nav.search': 'تلاش کریں',
  'nav.primary': 'مرکزی نیویگیشن',
  'nav.topLeagues': 'نمایاں لیگز',
  'nav.allLeagues': 'تمام لیگز',

  // ── Shared words ──────────────────────────────────────────────────────
  'common.loading': 'لوڈ ہو رہا ہے…',
  'common.error': 'کچھ غلط ہو گیا',
  'common.retry': 'دوبارہ کوشش کریں',
  'common.backToScores': 'اسکورز پر واپس جائیں',
  'common.close': 'بند کریں',
  'common.save': 'محفوظ کریں',
  'common.saved': 'محفوظ ہو گیا',
  'common.remove': 'ہٹائیں',
  'common.add': 'شامل کریں',
  'common.on': 'آن',
  'common.off': 'آف',
  'common.networkError': 'نیٹ ورک کا مسئلہ',
  'common.comingSoon': 'جلد آ رہا ہے',
  'common.vs': '{home} بمقابلہ {away}',
  'common.matchCount': { one: '{count} میچ', other: '{count} میچز' },

  // ── Dates ──────────────────────────────────────────────────────────────
  'date.today': 'آج',
  'date.yesterday': 'گزشتہ کل',
  'date.tomorrow': 'آنے والا کل',
  'date.previousDay': 'پچھلا دن',
  'date.nextDay': 'اگلا دن',
  'date.pickDate': 'تاریخ منتخب کریں',

  // ── Match status badges ───────────────────────────────────────────────
  'status.live': 'لائیو',
  'status.ftShort': 'ختم',
  'status.htShort': 'وقفہ',
  'status.cancelledShort': 'منسوخ',
  'status.postponedShort': 'ملتوی',
  'status.fullTime': 'میچ ختم',
  'status.halfTime': 'ہاف ٹائم',
  'status.postponed': 'ملتوی',
  'status.cancelled': 'منسوخ',
  'status.minuteLabel': '{minute}واں منٹ',

  // ── Home feed ─────────────────────────────────────────────────────────
  'home.filter.ongoing': 'جاری',
  'home.filter.finished': 'ختم شدہ',
  'home.filter.byTime': 'وقت کے لحاظ سے',
  'home.filter.button': 'فلٹر',
  'home.filter.label': 'میچز فلٹر کریں',
  'home.liveCount': { one: '{count} لائیو میچ', other: '{count} لائیو میچز' },
  'home.loadError': 'میچز لوڈ نہیں ہو سکے',
  'home.empty.title': 'اس تاریخ کو کوئی میچ نہیں',
  'home.empty.body':
    'انٹرنیشنل بریک کے دوران ملکی لیگز رک جاتی ہیں، اور قومی ٹیموں کے میچز یہاں شامل نہیں۔ ویک اینڈ پر عموماً کافی میچز ہوتے ہیں۔',
  'home.empty.filtered.ongoing': 'کوئی میچ جاری نہیں',
  'home.empty.filtered.finished': 'کوئی میچ ختم نہیں ہوا',
  'home.empty.filtered.byTime': 'کوئی آنے والا میچ نہیں',
  'home.empty.filteredHint': 'اس تاریخ کو میچز موجود ہیں — انہیں دیکھنے کے لیے فلٹر ہٹا دیں۔',
  'home.group.toggle': '{competition} دکھائیں یا چھپائیں',

  // ── Match centre ──────────────────────────────────────────────────────
  'match.tab.summary': 'خلاصہ',
  'match.tab.lineups': 'لائن اپ',
  'match.tab.stats': 'اعداد و شمار',
  'match.tab.h2h': 'آمنے سامنے',
  'match.tabs': 'میچ کے حصے',
  'match.matchday': 'میچ ڈے {matchday}',
  'match.halfTimeScore': 'ہاف ٹائم {score}',
  'match.loadError': 'یہ میچ لوڈ نہیں ہو سکا',
  'match.notFound': 'میچ نہیں ملا',
  'match.noH2H': 'دونوں ٹیموں کے پچھلے مقابلوں کا ریکارڈ دستیاب نہیں۔',
  'match.venue': 'اسٹیڈیم',
  'match.attendance': 'تماشائی',
  'match.referee': 'ریفری',

  // ── Match events ──────────────────────────────────────────────────────
  'events.empty.played': 'میچ کی تفصیلات دستیاب نہیں',
  'events.empty.notStarted': 'میچ ابھی شروع نہیں ہوا',
  'events.empty.playedHint':
    'موجودہ ڈیٹا پلان میں گول، کارڈز اور کھلاڑیوں کی تبدیلیاں شامل نہیں۔ اوپر دیا گیا اسکور لائیو ہے۔',
  'events.empty.notStartedHint': 'میچ شروع ہوتے ہی گول، کارڈز اور کھلاڑیوں کی تبدیلیاں یہاں نظر آئیں گی۔',
  'events.assist': 'اسسٹ: {name}',
  'events.subOut': 'باہر: {name}',
  'events.goal': 'گول',
  'events.penalty': 'پنالٹی',
  'events.ownGoal': 'سیلف گول',
  'events.yellowCard': 'پیلا کارڈ',
  'events.redCard': 'سرخ کارڈ',
  'events.secondYellow': 'دوسرا پیلا کارڈ',
  'events.substitution': 'کھلاڑی کی تبدیلی',

  // ── Lineups ───────────────────────────────────────────────────────────
  'lineups.startingXI': 'ابتدائی الیون',
  'lineups.bench': 'متبادل کھلاڑی',
  'lineups.coach': 'کوچ',
  'lineups.notPublished': 'لائن اپ ابھی جاری نہیں ہوئی۔',
  'lineups.unavailable': 'لائن اپ دستیاب نہیں',
  'lineups.unavailableHint':
    'لائن اپ عموماً میچ شروع ہونے سے تقریباً ایک گھنٹہ پہلے آتی ہے، اور اس پلان پر ہر مقابلے کی لائن اپ جاری نہیں ہوتی۔',

  // ── Match statistics ──────────────────────────────────────────────────
  'stats.possession': 'گیند پر قبضہ',
  'stats.shots': 'شاٹس',
  'stats.shotsOnTarget': 'ہدف پر شاٹس',
  'stats.shotsOffTarget': 'ہدف سے باہر شاٹس',
  'stats.corners': 'کارنرز',
  'stats.offsides': 'آف سائیڈ',
  'stats.fouls': 'فاؤلز',
  'stats.saves': 'گول بچائے',
  'stats.yellowCards': 'پیلے کارڈ',
  'stats.redCards': 'سرخ کارڈ',
  'stats.empty': 'اعداد و شمار دستیاب نہیں',
  'stats.emptyHint': 'اس پلان پر ہر مقابلے کے میچ کے اعداد و شمار جاری نہیں ہوتے۔',

  // ── Leagues ───────────────────────────────────────────────────────────
  'leagues.title': 'لیگز',
  'leagues.subtitle': 'پوائنٹس ٹیبل، شیڈول اور ٹاپ اسکوررز',
  'leagues.metaDescription': 'لیگز کے پوائنٹس ٹیبل، شیڈول اور ٹاپ اسکوررز۔',
  'league.fallbackTitle': 'لیگ',
  'league.tab.table': 'پوائنٹس ٹیبل',
  'league.tab.scorers': 'ٹاپ اسکوررز',
  'league.table.loadError': 'پوائنٹس ٹیبل لوڈ نہیں ہو سکا',
  'league.table.empty': 'پوائنٹس ٹیبل دستیاب نہیں',
  'league.table.emptyHint': 'ناک آؤٹ مرحلوں اور کچھ کپ مقابلوں کا لیگ ٹیبل نہیں ہوتا۔',
  'league.scorers.loadError': 'ٹاپ اسکوررز لوڈ نہیں ہو سکے',
  'league.scorers.empty': 'اسکوررز کا ڈیٹا موجود نہیں',
  'league.scorers.emptyHint': 'اس پلان پر ہر مقابلے کے ٹاپ اسکوررز جاری نہیں ہوتے۔',

  // ── Standings table columns ───────────────────────────────────────────
  'table.col.position': '#',
  'table.col.team': 'ٹیم',
  'table.col.player': 'کھلاڑی',
  'table.col.played': 'میچ',
  'table.col.won': 'جیت',
  'table.col.drawn': 'برابر',
  'table.col.lost': 'ہار',
  'table.col.goalDifference': 'فرق',
  'table.col.points': 'پوائنٹس',
  'table.col.form': 'فارم',
  'table.col.goals': 'گول',
  'table.col.assists': 'اسسٹ',
  'table.col.playedFull': 'کھیلے گئے میچ',
  'table.col.wonFull': 'جیتے',
  'table.col.drawnFull': 'برابر رہے',
  'table.col.lostFull': 'ہارے',
  'table.col.goalDifferenceFull': 'گول کا فرق',
  'table.col.pointsFull': 'پوائنٹس',
  'table.col.goalsFull': 'گول',
  'table.col.assistsFull': 'اسسٹ',
  'table.form.win': 'ج',
  'table.form.draw': 'ب',
  'table.form.loss': 'ہ',

  // ── Right sidebar widgets ─────────────────────────────────────────────
  'sidebar.competition': 'مقابلہ',
  'sidebar.table': 'پوائنٹس ٹیبل',
  'sidebar.fullTable': 'مکمل ٹیبل',
  'sidebar.topScorers': 'ٹاپ اسکوررز',
  'sidebar.tableUnavailable': 'پوائنٹس ٹیبل اس وقت دستیاب نہیں۔',
  'sidebar.noTable': 'اس مقابلے کا کوئی ٹیبل نہیں۔',
  'sidebar.noScorers': 'اسکوررز کا ڈیٹا دستیاب نہیں۔',

  // ── Team page ─────────────────────────────────────────────────────────
  'team.fallbackTitle': 'ٹیم',
  'team.tab.matches': 'میچز',
  'team.tab.squad': 'اسکواڈ',
  'team.fixtures': 'آنے والے میچز',
  'team.results': 'نتائج',
  'team.founded': 'قیام {year}',
  'team.homeShort': 'ہوم',
  'team.awayShort': 'اوے',
  'team.home': 'ہوم گراؤنڈ',
  'team.away': 'مخالف گراؤنڈ',
  'team.loadError': 'یہ ٹیم لوڈ نہیں ہو سکی',
  'team.notFound': 'ٹیم نہیں ملی',
  'team.noMatches': 'کوئی میچ نہیں ملا',
  'team.noMatchesHint': 'ہو سکتا ہے یہ ٹیم کسی ایسے مقابلے میں کھیلتی ہو جو مفت پلان میں شامل نہیں۔',
  'team.squadUnavailable': 'اسکواڈ دستیاب نہیں',
  'team.squadUnavailableHint': 'اس پلان پر ہر ٹیم کا اسکواڈ جاری نہیں ہوتا۔',

  // ── Watch page ────────────────────────────────────────────────────────
  'watch.whereToWatch': 'میچ کہاں دیکھیں',
  'watch.liveTv': 'لائیو ٹی وی',
  'watch.watchButton': 'دیکھیں',
  'watch.checkListings': 'مقامی ٹی وی شیڈول دیکھیں',
  'watch.selectCountry': 'ملک منتخب کریں',
  'watch.playerLabel': '{title} دیکھیں',
  'watch.closePlayer': 'پلیئر بند کریں',
  'watch.streamUnavailable': 'اسٹریم دستیاب نہیں',
  'watch.streamUnavailableHint': 'یہ فیڈ نہیں چل سکی۔ نیچے دیے گئے کسی براڈکاسٹر پر دیکھیں۔',
  'watch.opensInNewTab': '{name} (نئے ٹیب میں کھلے گا)',

  // ── Countries ─────────────────────────────────────────────────────────
  'country.GB': 'برطانیہ',
  'country.US': 'امریکا',
  'country.IN': 'بھارت',
  'country.PK': 'پاکستان',

  // ── Competition regions ───────────────────────────────────────────────
  'region.World': 'دنیا',
  'region.Europe': 'یورپ',
  'region.England': 'انگلینڈ',
  'region.Spain': 'اسپین',
  'region.Germany': 'جرمنی',
  'region.Italy': 'اٹلی',
  'region.France': 'فرانس',
  'region.Netherlands': 'نیدرلینڈز',
  'region.Portugal': 'پرتگال',
  'region.Brazil': 'برازیل',

  // ── Competition names ─────────────────────────────────────────────────
  'competition.WC': 'فیفا ورلڈ کپ',
  'competition.EC': 'یورپی چیمپئن شپ',
  'competition.CL': 'یوئیفا چیمپئنز لیگ',
  'competition.EL': 'یوئیفا یوروپا لیگ',
  'competition.PL': 'پریمیئر لیگ',
  'competition.ELC': 'چیمپئن شپ',
  'competition.PD': 'لا لیگا',
  'competition.BL1': 'بنڈس لیگا',
  'competition.SA': 'سیری اے',
  'competition.FL1': 'لیگ ون',
  'competition.DED': 'ایریڈیویزی',
  'competition.PPL': 'پریمیرا لیگا',
  'competition.BSA': 'برازیلین سیری اے',
  'competitionShort.WC': 'ورلڈ کپ',
  'competitionShort.EC': 'یورو',
  'competitionShort.CL': 'چیمپئنز لیگ',
  'competitionShort.BSA': 'برازیلین لیگ',

  // ── Placeholder pages ─────────────────────────────────────────────────
  'following.title': 'پسندیدہ',
  'following.body': 'اپنی پسندیدہ ٹیموں اور لیگز کو فالو کریں — جلد آ رہا ہے۔',
  'news.title': 'خبریں',
  'news.body': 'فٹبال کی دنیا کی خبریں — جلد آ رہی ہیں۔',
  'transfers.title': 'ٹرانسفرز',
  'transfers.body': 'ٹرانسفر کی خبریں — جلد آ رہی ہیں۔',

  // ── Page titles ───────────────────────────────────────────────────────
  'meta.matchCentre': 'میچ سینٹر',
  'meta.titleTemplate': '{page} | 90 Min Tactics',

  // ── Login ─────────────────────────────────────────────────────────────
  'login.title': 'ایڈمن سائن اِن',
  'login.username': 'یوزر نیم',
  'login.password': 'پاس ورڈ',
  'login.submit': 'سائن اِن کریں',
  'login.submitting': 'سائن اِن ہو رہا ہے…',
  'login.failed': 'سائن اِن نہیں ہو سکا',

  // ── Admin ─────────────────────────────────────────────────────────────
  'admin.title': 'اسٹریم مینیجر',
  'admin.signedInAs':
    'آپ {username} کے طور پر سائن اِن ہیں۔ ہر میچ یا ہر مقابلے کے لیے سرکاری/قانونی اسٹریمز شامل کریں۔',
  'admin.signOut': 'سائن آؤٹ',
  'admin.competitionDefaults': 'مقابلوں کی ڈیفالٹ اسٹریمز',
  'admin.competitionDefaultsHint': 'اس لیگ کے ہر میچ پر لاگو ہوگی (جب تک نیچے کسی میچ کی اپنی اسٹریم نہ ہو)۔',
  'admin.perMatch': 'ہر میچ کی الگ اسٹریم',
  'admin.loadingMatches': 'میچز لوڈ ہو رہے ہیں…',
  'admin.noMatches':
    'اس تاریخ کو کوئی میچ نہیں — اوپر کے تیروں سے کوئی اور دن چنیں، یا مقابلے کی ڈیفالٹ اسٹریم مقرر کریں۔',
  'admin.channels.title': 'لائیو ٹی وی چینلز',
  'admin.channels.hint': 'الگ اسٹریمز جو واچ صفحے پر براہِ راست چلتی ہیں — کسی میچ کی ضرورت نہیں۔',
  'admin.channels.empty': 'ابھی کوئی چینل نہیں — نیچے سے شامل کریں۔',
  'admin.channels.namePlaceholder': 'چینل کا نام',
  'admin.channels.required': 'نام اور لنک دونوں ضروری ہیں',
  'admin.channels.remove': '{name} ہٹائیں',
  'admin.channels.failed': 'ناکام',
  'admin.stream.idPlaceholder': 'یوٹیوب ویڈیو آئی ڈی',
  'admin.stream.labelPlaceholder': 'لیبل (اختیاری)',
  'admin.stream.required': 'اسٹریم کا یو آر ایل / آئی ڈی ضروری ہے',
  'admin.stream.saveFailed': 'محفوظ نہیں ہو سکا',
  'admin.stream.defaultTitleYoutube': 'لائیو اسٹریم',
  'admin.stream.defaultTitle': 'اسٹریم',

  // ── Settings ──────────────────────────────────────────────────────────
  'settings.title': 'ترتیبات',
  'settings.subtitle': 'زبان، وقت اور ڈیٹا کی ترجیحات',
  'settings.loading': 'آپ کی ترتیبات لوڈ ہو رہی ہیں…',

  'settings.language.title': 'زبان',
  'settings.language.hint': 'صفحہ دوبارہ لوڈ ہوگا تاکہ پوری ایپ کی زبان اور تحریر کی سمت بدل جائے۔',
  'settings.language.applying': 'زبان تبدیل ہو رہی ہے…',
  'settings.language.error':
    'آپ کی زبان محفوظ نہیں ہو سکی۔ براہِ کرم دیکھیں کہ اس سائٹ کے لیے کوکیز کی اجازت ہے۔',

  'settings.timeZone.title': 'ٹائم زون',
  'settings.timeZone.hint': 'میچ شروع ہونے کے اوقات اور “آج” اسی ٹائم زون کے مطابق ہوں گے۔',
  'settings.timeZone.label': 'ٹائم زون منتخب کریں',
  'settings.timeZone.automatic': 'خودکار ({zone})',
  'settings.timeZone.detected': 'آپ کے ڈیوائس کے مطابق: {zone}',
  'settings.timeZone.now': 'وہاں اس وقت: {time}',
  'settings.storageError': 'محفوظ نہیں ہو سکا — آپ کا براؤزر سائٹ اسٹوریج کی اجازت نہیں دے رہا۔',

  'settings.timeFormat.title': 'وقت کا انداز',
  'settings.timeFormat.h24': '24 گھنٹے',
  'settings.timeFormat.h12': '12 گھنٹے',
  'settings.timeFormat.example': 'مثال: {time}',

  'settings.lite.title': 'لائٹ موڈ',
  'settings.lite.hint': 'سست نیٹ ورک پر ڈیٹا بچانے کے لیے کلبوں کے نشان اور تصاویر چھپا دیتا ہے۔',
  'settings.lite.auto': 'آپ کا کنکشن سست ہے یا ڈیٹا سیور آن ہے، اس لیے یہ خود بخود آن ہے۔',
  'settings.lite.useAutomatic': 'خودکار پر واپس جائیں',

  'settings.notifications.title': 'نوٹیفکیشنز',
  'settings.notifications.placeholder': 'گول اور میچ شروع ہونے کے الرٹس جلد آ رہے ہیں۔',

  'settings.about.title': 'تعارف',
  'settings.about.dataSources': 'ڈیٹا کے ذرائع',
  'settings.about.footballData': 'شیڈول، نتائج، پوائنٹس ٹیبل اور ٹاپ اسکوررز',
  'settings.about.openLigaDb': 'جرمن لیگز کا ڈیٹا، ODbL 1.0 لائسنس کے تحت',
  'settings.about.theSportsDb': 'ٹیموں کے نشان اور تصاویر',
  'settings.about.wikidata': 'نام اور معلومات، پبلک ڈومین (CC0)',
  'settings.about.disclaimer':
    'اسکورز میں تاخیر ہو سکتی ہے۔ 90 Min Tactics کا کسی لیگ، کلب یا براڈکاسٹر سے کوئی تعلق نہیں۔',
  'settings.about.externalLink': '{name} (نئے ٹیب میں کھلے گا)',
}

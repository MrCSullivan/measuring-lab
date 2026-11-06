/**
 * Measuring Lab - class leaderboard store.
 *
 * Paste this into Extensions > Apps Script on a Google Sheet you own, then
 * Deploy > New deployment > Web app, with "Execute as: Me" and
 * "Who has access: Anyone". Copy the /exec address it gives you into the
 * game's SHARED_URL setting.
 *
 * The sheet keeps one row per player per class: their best total, how that
 * total split across capacity, mass, length and number, the level reached in
 * each measure, and all sixteen game levels in Detail,
 * sorted and colour-coded so it reads as a leaderboard on its own. Reopen
 * the sheet and you also get a "Measuring Lab" menu for clearing scores.
 *
 * CLASS CODES. Every class is its own tab in this spreadsheet, and the tab's
 * name is the class code. A child types the code before their name; if no tab
 * has that name the game says it is not a valid class code and goes no
 * further. To add a class, add a tab named for it (or use Measuring Lab >
 * Add a class), then give the children that name. Tabs called Scores, Duels,
 * Class goal, Class tables and anything starting "Stats - " are the game's
 * own and are never a class.
 */

var SHEET_NAME = 'Scores';
var HEADERS = ['Place', 'Class', 'Name', 'Total',
               'Capacity', 'Mass', 'Length',
               'Best streak', 'Right',
               'Cap level', 'Mass level', 'Length level', 'Detail', 'Updated',
               'Tally', 'Badges', 'Days', 'Challenges',
               'Character', 'Table', 'Week score', 'Week',
               'Day score', 'Day',
               /* Number arrived after the other three measures, so its two
                  columns go on the end rather than beside theirs. An existing
                  sheet then gains two blank cells instead of having every row
                  shuffled sideways underneath its headings. */
               'Number', 'Number level',
               'Duels won', 'Duels lost',
               /* Draws arrived later than the other two, so the same rule
                  applies: on the end, and an existing board gains one blank
                  cell rather than having every row shifted sideways. */
               'Duels drawn',
               /* Temperature is the newest measure and goes last for the same
                  reason, which it did not the first time: its two columns were
                  put beside the other measures' and pushed the three duel
                  columns two places to the right. The headings moved but the
                  numbers underneath them did not, so every child's duel record
                  was read out of the wrong cells and their wins turned up as a
                  temperature score. Nothing may ever be inserted in the middle
                  of this list while a sheet exists that was written by an
                  older copy of it. */
               'Temperature', 'Temperature level'];

var COL = { place: 1, room: 2, name: 3, best: 4,
            sCap: 5, sMass: 6, sLen: 7,
            streak: 8, right: 9,
            cap: 10, mass: 11, len: 12, detail: 13, updated: 14, tally: 15,
            badges: 16, days: 17, challenges: 18,
            avatar: 19, team: 20, weekScore: 21, weekOf: 22,
            dayScore: 23, dayOf: 24,
            sNum: 25, num: 26,
            wins: 27, losses: 28, draws: 29,
            sTemp: 30, temp: 31 };

/* How many columns one player's row occupies, counting from Name. Written
   down once because the row is read and written as a single block, and a
   number typed twice is a number that will eventually disagree with itself. */
var ROW_WIDTH = COL.temp - COL.name + 1;

/* Wire order, not reading order. Temperature goes on the end because the
   detail cell is positional and every board already written has number in the
   fourth slot. The game shows them in a friendlier order; this list is only
   ever about where the numbers sit. */
var MEASURES = ['capacity', 'mass', 'length', 'number', 'temperature'];
var GAMES = ['step', 'read', 'add', 'about', 'set'];

var INK   = '#0F2430';
var NAVY  = '#0B6E92';
var PALE  = '#EEF6FA';
var WHITE = '#FFFFFF';
var GOLD   = '#FBE7B2';
var SILVER = '#E4E9EC';
var BRONZE = '#F3DCC6';

/* ------------------------------------------------------------------ web app */

/**
 * Two jobs on the same address.
 *
 * With an action on the end (?action=list...) this is the leaderboard, answering
 * in JSON, which is what every copy of the game talks to.
 *
 * With no action it serves the game itself, if you have pasted it into an HTML
 * file in this project called "Page". That turns this one deployment into the
 * whole thing: no web host, no file to put on twenty-four laptops, one address
 * for the class. See PAGE_FILE below.
 */
function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  /* ?check=1 says what this script can actually see, instead of leaving you to
     work it out from a page that looks nearly right. */
  if (p.check) return checkPage(p);
  /* A hosted copy of the game asks this as the page opens, so that by the time a
     child has typed the class code the script has already been started. It reads
     nothing and writes nothing, so it costs almost nothing, and it works for a
     class that does not exist. */
  if (p.action === 'ping') return json({ ok: true, ping: true });
  if (!p.action) return servePage(p);
  /* Reading the board over a plain web address is fine. Changing anything is
     not. Once this address is also the game, it is sitting in the address bar
     of every child in the room, and typing ?action=clear on the end of it
     should not empty the board. Every write the game makes is a POST, so
     nothing legitimate is turned away here. */
  if (p.action === 'list' || p.action === 'join') return handle(p);
  return json({ ok: false, error: 'that has to be a post' });
}

/* The name of the HTML file in this project holding the game. To use it:
   in the Apps Script editor press + next to Files, choose HTML, name it
   exactly "Page" (Apps Script adds the .html itself), delete the sample
   content, and paste in measuring-lab-page.html. Then redeploy. */
var PAGE_FILE = 'Page';

/* Bumped whenever this file changes, so ?check=1 can say which copy is running
   and nobody has to guess whether a paste took. */
var VERSION = '4 November, more unlocks';

/* The line in the game that this script fills in. A copy of the game without it
   is too old to be served from here. Split so that this file can hold the text
   without the text matching itself. */
var MARK = '/*__' + 'LAB__*/';

function notice(heading, body) {
  return HtmlService.createHtmlOutput(
    '<div style="font:16px/1.6 system-ui,sans-serif;max-width:34em;margin:11vh auto;' +
    'padding:0 22px;color:#0F2430"><h1 style="font:700 23px/1.25 system-ui;margin:0 0 12px">' +
    heading + '</h1>' + body + '</div>')
    .setTitle('Measuring Lab')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function oldPageNotice() {
  return notice('This page cannot be served from here',
    '<p>The address is working and the leaderboard is fine, but the HTML file named <b>' +
    PAGE_FILE + '</b> in this project has nowhere for the script to put the class name ' +
    'and the teacher pin. It has no <b>&lt;head&gt;</b> of its own, which every copy of ' +
    'the game normally has, so it is probably not the game at all.</p>' +
    '<p><b>The fix:</b> open <b>measuring-lab-page.html</b>, select all, and paste it ' +
    'over the contents of the <b>' + PAGE_FILE + '</b> file, replacing what is there.</p>');
}

/**
 * Hands the class, the pin and this deployment's address to the page.
 *
 * Two ways, because one of them has to work whatever copy of the game is in the
 * project. The newer game reads window.__LAB__. Every older one reads the
 * browser address bar, which inside the frame Apps Script uses does not carry
 * the settings at all, so the address bar is rewritten to carry them: same
 * page, no navigation, and from then on ?class= and ?teacher= are simply there
 * to be read. Doing both means a page that was pasted in months ago works.
 *
 * Returns the filled-in page, or null if there was nowhere at all to put it.
 */
function fillIn(html, lab) {
  var bits = [];
  if (lab['class']) bits.push('class=' + encodeURIComponent(lab['class']));
  if (lab.teacher) bits.push('teacher=' + encodeURIComponent(lab.teacher));
  if (lab.display) bits.push('display=' + encodeURIComponent(lab.display));
  var bar = bits.length ? '?' + bits.join('&') : '?';

  var self = safeJson(String(lab.self || ''));

  var line =
    'window.__LAB__=' + safeJson(lab) + ';' +
    /* For every older copy: give the page an address bar to read. Same page,
       no navigation, and from here on ?class= and ?teacher= are simply there. */
    'try{history.replaceState(null,"",' + safeJson(bar) + ');}catch(e){}' +
    /* And an older copy builds its whiteboard link from its own address, which
       in here is one of Google's and leads nowhere. Send any link carrying
       display=1 to this deployment instead. */
    '(function(){var S=' + self + ';if(!S)return;var open=window.open;' +
    'window.open=function(u,n,f){if(typeof u==="string"&&u.indexOf("display=1")>-1){' +
    'var q=u.split("?")[1]||"";u=S+(S.indexOf("?")>-1?"&":"?")+q;}' +
    'return open.call(window,u,n,f||"");};})();' +
    /* Tables are the teacher's to hand out, so no copy of the game asks the
       children to pick one. Done in CSS because it then works on whatever copy
       of the game is in the project, including ones that predate the setting. */
    (lab.pick ? '' :
      '(function(){var s=document.createElement("style");' +
      's.textContent="#teampick{display:none!important}";' +
      '(document.head||document.documentElement).appendChild(s);})();');
  var tag = '<script>' + line + '</scr' + 'ipt>';

  /* In order of preference. The marker is the tidy way. <head> is there in
     every build this game has ever had, and </head> is not: the page leaves it
     to the browser to close. */
  if (html.indexOf(MARK) > -1) return html.replace(MARK, function () { return line; });
  if (html.indexOf('<head>') > -1) return html.replace('<head>', '<head>' + tag);
  if (html.indexOf('</head>') > -1) return html.replace('</head>', tag + '</head>');
  if (html.indexOf('<style>') > -1) return html.replace('<style>', tag + '<style>');
  return null;
}

/**
 * Fills in an empty SHARED_URL with this deployment's own address, so a copy of
 * the game that was never wired to a sheet still lands on the class board.
 * Anything already set is left alone: the teacher may be pointing a class at a
 * different sheet on purpose.
 */
function pointAtSelf(html, url) {
  if (!url) return html;
  var at = html.indexOf('var CONFIG = {');
  if (at < 0) return html;
  var head = html.slice(0, at), tail = html.slice(at);
  var swapped = tail.replace(/SHARED_URL:\s*""/, function () {
    return 'SHARED_URL: ' + safeJson(url);
  });
  return head + swapped;
}

/** Which of those places was used, for the ?check page to report. */
function fillPoint(html) {
  if (html.indexOf(MARK) > -1) return 'the __LAB__ line (the newest page)';
  if (html.indexOf('<head>') > -1) return 'after <head>, by rewriting the address bar';
  if (html.indexOf('</head>') > -1) return 'before </head>, by rewriting the address bar';
  if (html.indexOf('<style>') > -1) return 'before <style>, by rewriting the address bar';
  return 'nowhere: this page cannot be told anything';
}

/**
 * What this script can see. Add ?check=1 to the address.
 *
 * Built because a page that is nearly right is worse than one that is plainly
 * wrong: the game plays while quietly ignoring the class, the teacher pin and
 * the whiteboard, and nothing on screen says why.
 */
function checkPage(p) {
  var rows = [];
  var add = function (label, value, ok) {
    rows.push('<tr><td style="padding:7px 14px 7px 0;color:#5A7383;white-space:nowrap">' +
      label + '</td><td style="padding:7px 0;font-weight:600;color:' +
      (ok === false ? '#B32D28' : ok === true ? '#1F7A4C' : '#0F2430') + '">' +
      String(value).replace(/[&<>]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
      }) + '</td></tr>');
  };

  var html = null, why = '';
  try { html = HtmlService.createHtmlOutputFromFile(PAGE_FILE).getContent(); }
  catch (err) { why = String(err).slice(0, 160); }

  add('Script version', 'the one with ?check, ' + VERSION, true);

  if (html === null) {
    add('The "' + PAGE_FILE + '" file', 'not found', false);
    add('Apps Script said', why);
    return notice('What this script can see', '<table>' + rows.join('') + '</table>' +
      '<p style="margin-top:18px">Add an HTML file named exactly <b>' + PAGE_FILE +
      '</b> and paste <b>measuring-lab-page.html</b> into it.</p>');
  }

  var hasMark = html.indexOf(MARK) > -1;
  var haveCode = false;
  try { haveCode = String(PropertiesService.getScriptProperties().getProperty('teacherCode') || '').length >= 4; } catch (e0) { haveCode = false; }

  add('The "' + PAGE_FILE + '" file', 'found, ' + Math.round(html.length / 1024) + ' KB', true);
  add('How it is told the class and pin', fillPoint(html), fillIn(html, {}) !== null);
  add('Is it the newest copy of the game', hasMark ? 'yes' : 'no, an older one (still works)', hasMark);
  add('Has the new Start playing button', html.indexOf('gate-go') > -1 ? 'yes' : 'no, older copy',
      html.indexOf('gate-go') > -1);
  /* Whether a teacher code is set, and nothing about what it is: this page is
     open to anyone with the address, so it must never confirm a guess. */
  add('Teacher password set on the sheet', haveCode ? 'yes' : 'no. Use Measuring Lab > Set teacher name and password, or clearing and the goal box are refused', haveCode);

  var url = '';
  try { url = ScriptApp.getService().getUrl(); } catch (e2) { url = '(getUrl failed: ' + e2 + ')'; }
  add('This deployment\'s address', url || '(empty)', !!url);
  add('What would be handed to the page',
      'class=' + (p['class'] || '(none)') + ', teacher=' + (p.teacher ? 'passed' : '(none)') +
      ', display=' + (p.display || '(none)'));

  return notice('What this script can see',
    '<table style="border-collapse:collapse;font-size:15px">' + rows.join('') + '</table>' +
    '<p style="margin-top:20px;color:#5A7383;font-size:14.5px">Every line green means the ' +
    'script and the page agree. A red line is the thing to fix.</p>');
}

function servePage(p) {
  var html;
  try {
    html = HtmlService.createHtmlOutputFromFile(PAGE_FILE).getContent();
  } catch (err) {
    return notice('The game is not in this project yet',
      '<p>This address is answering, so the leaderboard half is working. To serve ' +
      'the game from here as well, add an HTML file named <b>' + PAGE_FILE +
      '</b> to this Apps Script project, paste <b>measuring-lab-page.html</b> into ' +
      'it, and deploy a new version.</p>' +
      '<p style="color:#5A7383;font-size:14.5px">Apps Script said: ' +
      String(err).slice(0, 200) + '</p>');
  }

  /* The page is served inside a frame with an address of Google's, so it can
     never read ?class= or ?teacher= off the bar itself. Hand them over, with
     this deployment's own address so the game knows where to post scores and
     where to point the whiteboard link. */
  var self = '';
  try { self = ScriptApp.getService().getUrl(); } catch (err2) { self = ''; }

  var lab = {
    "class": String(p["class"] || ''),
    teacher: String(p.teacher || ''),
    display: String(p.display || ''),
    self: self,
    /* Children do not choose their own table. ?pick=1 on the address puts the
       choice back, for a class where you would rather let them. */
    pick: String(p.pick || '') === '1'
  };

  var filled = fillIn(html, lab);
  if (filled === null) return oldPageNotice();

  /* An older copy has its own SHARED_URL setting, and if it was never filled in
     the board would sit there saying "this device only" with the sheet one line
     away. Point it here. Only inside the settings block: the instructions
     further up the page mention the same setting by name. */
  filled = pointAtSelf(filled, self);

  return HtmlService.createHtmlOutput(filled)
    .setTitle('Measuring Lab')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ------------------------------------------------------------ safety helpers
 * Everything a laptop sends is whatever its owner typed, or something worse
 * than that: anyone who has the address can post to it without using the game
 * at all. These are the places that stop that doing harm.
 */

/** JSON that is safe to put inside a <script> tag: a closing script tag, an
 *  ampersand or a line separator in a value cannot end the script early. */
function safeJson(o) {
  return JSON.stringify(o)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/**
 * Text that is going into a cell. Control characters and runs of spaces go, and
 * so does anything at the front that would make Sheets treat the cell as a
 * formula (= + - @), which is how a name can be made to run =IMPORTXML() or a
 * =HYPERLINK() on the teacher's screen. No name or reward starts with those.
 */
function cleanText(v, max) {
  var s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ')
                                    .replace(/\s+/g, ' ').trim();
  s = s.replace(/^[=+\-@]+/, '').trim();
  return s.slice(0, max);
}

/**
 * Whether this request carries the teacher's password. The password lives in
 * the script's own settings (Measuring Lab > Set teacher name and password) and
 * never in the page, because the page goes to every child. With no password set
 * nothing is allowed, so a freshly deployed script is closed rather than open.
 *
 * Guessing is slowed, not just checked: ten wrong tries in a row and the
 * teacher login is shut for three minutes, for everyone. That also shuts the
 * teacher out if a class takes turns guessing, which is the price of not having
 * a login that can be tried a thousand times; setting the password again from
 * the sheet opens it at once.
 *
 * Returns 'ok', 'bad' (wrong or missing) or 'locked'.
 */
var TEACHER_TRIES = 10;
var TEACHER_LOCK_S = 180;

function teacherCheck(p) {
  var code = '';
  try { code = String(PropertiesService.getScriptProperties().getProperty('teacherCode') || ''); }
  catch (err) { code = ''; }
  var given = String((p && p.teacher) || '');
  if (code.length < 4) return 'bad';
  var cache = null, fails = 0;
  try {
    cache = CacheService.getScriptCache();
    fails = Number(cache.get('tfail')) || 0;
  } catch (e1) { cache = null; }
  if (fails >= TEACHER_TRIES) return 'locked';
  if (!given) return 'bad';                 // nothing tried, so nothing counted
  var same = given.length === code.length, diff = 0;
  for (var i = 0; i < code.length && same; i++) diff |= code.charCodeAt(i) ^ given.charCodeAt(i);
  if (same && diff === 0) {
    try { if (cache) cache.remove('tfail'); } catch (e2) { /* it expires */ }
    return 'ok';
  }
  try { if (cache) cache.put('tfail', String(fails + 1), TEACHER_LOCK_S); } catch (e3) { /* uncounted */ }
  return 'bad';
}

function teacherOk(p) { return teacherCheck(p) === 'ok'; }

/** Letters and digits only, in lower case, so "Mr. Sullivan", "mr.sullivan" and
 *  "MR SULLIVAN" are one name. */
function nameKey(n) {
  return String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** The name only the teacher can play under, as its key; '' when there is none. */
function teacherNameKey() {
  try {
    var all = PropertiesService.getScriptProperties().getProperties();
    if (String(all.teacherCode || '').length < 4) return '';
    return nameKey(all.teacherName);
  } catch (err) { return ''; }
}

// Limits that no real child comes near, and a script that has been told lies does.
var MAX_KIDS = 150;            // children in one class
var ABS_BEST = 5000000;        // points
var ABS_RIGHT = 500000;        // right answers
var ABS_COUNT = 100000;        // days, challenges, wins, losses, draws
var SCORE_SLACK = 2000;        // points a child may gain in one go with no time elapsed
var SCORE_PER_S = 300;         // and per second since the row last changed (a top level answer at a long streak is worth up to 375)
var RIGHT_SLACK = 100;
var RIGHT_PER_S = 2;

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { body = {}; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
  return handle(body);
}

/* How long a write will stand in the queue for the sheet's one lock. Every
   request standing there is also one of the thirty an account is allowed to
   have running at once, so a long wait is not free: a long enough queue uses
   them all and the board reads, which take no lock, are turned away too. A
   write that gives up sooner frees its place, and the game already retries it
   after a short, growing pause. */
var LOCK_WAIT_MS = 25000;

function handle(p) {
  if (!p || typeof p !== 'object') p = {};
  /* A fresh request means a fresh view of the Duels tab. Apps Script starts
     each execution with the globals as written, so this is belt and braces
     rather than a fix, but a stale duel list would be a real bug and the cost
     of ruling it out is one assignment. */
  duelsChanged();
  /* Nothing is read or written for a class that has no tab. The code is
     matched without regard to capitals, and from here on the room is the
     tab's own spelling, so every row, duel and goal agrees about it. */
  var found = classSheet(p.room);
  if (!found) {
    return json({ ok: false, badClass: true,
                  error: 'That is not a valid class code.' });
  }
  var room = found.name;
  var classTabSheet = found.sheet;
  var writing = (p.action === 'submit' && p.name) ||
                p.action === 'clear' || p.action === 'goal' ||
                p.action === 'duel';

  // Checking a code touches nothing: no board, no cache, no sheet.
  if (p.action === 'join') {
    var tn = '';
    try { tn = String(PropertiesService.getScriptProperties().getProperty('teacherName') || ''); } catch (e0) { tn = ''; }
    return json({ ok: true, joined: true, room: room, teacherName: tn });
  }

  /* Signing in as the teacher: the game asks, the sheet answers yes or no, and
     nothing else happens. The password travels in the body of a POST, not in an
     address, so it is not left in a log or a history. */
  if (p.action === 'teacherlogin') {
    var tc = teacherCheck(p);
    if (tc === 'ok') {
      var tname = '';
      try { tname = String(PropertiesService.getScriptProperties().getProperty('teacherName') || ''); } catch (e1) { tname = ''; }
      return json({ ok: true, teacher: true, name: tname });
    }
    return json({ ok: false, error: tc === 'locked' ? 'locked' : 'teacher' });
  }

  /* Clearing a class and changing its goal are the teacher's. The page hides
     the buttons from children, but hiding a button stops nobody who can send a
     request, so the sheet asks for the teacher code itself. */
  if (p.action === 'clear' || p.action === 'goal') {
    var gate = teacherCheck(p);
    if (gate !== 'ok') return json({ ok: false, error: gate === 'locked' ? 'locked' : 'teacher' });
  }

  // Reading is by far the common case - thirty devices checking the board -
  // so it takes no lock and never writes to the sheet.
  if (!writing) {
    try {
      /* Twenty-four devices asking every half minute is a read every second or
         so, and each one was opening the sheet, reading every row and then
         opening the goal tab as well. They are all asking the same question, so
         the answer is kept for a few seconds and handed out from memory. The
         board is never more than that stale, nobody sees their own score late
         (the game always draws that from what is in front of them), and a
         clear still lands at once because writing throws the answer away. */
      var key = boardKey(room);
      var hit = cacheGet(key);
      if (hit) return jsonText(hit);

      var mark = resetMark(room);
      var seen = list(readySheet(classTabSheet), room);
      var body = JSON.stringify({ ok: true, rows: seen,
                                  cleared: mark.n, clearedDeep: mark.deep,
                                  jar: jarReply(findGoal(room), seen),
                                  duels: openDuels(room),
                                  settled: settledDuels(room),
                                  inboxMax: DUEL_INBOX_MAX });
      cachePut(key, body);
      return jsonText(body);
    } catch (err) {
      return json({ ok: false, error: String(err) });
    }
  }

  var lock = LockService.getScriptLock();
  var queuedAt = Date.now();
  try {
    lock.waitLock(LOCK_WAIT_MS);
  } catch (err) {
    return json({ ok: false, error: 'busy' });
  }
  /* How long this request stood in the queue is the best measure there is of
     how crowded the sheet is, and it costs nothing to read. Every class shares
     the one lock, so six classes posting at once can ask for more than the
     sheet can write. The reply carries a spacing factor, 1 when it is quiet and
     up to 4 when the queue is long, and each laptop stretches its own gap by it.
     The game already backed off after a refusal; this makes it back off before
     anybody is refused. */
  var queued = Date.now() - queuedAt;
  var ease = queued < 1500 ? 1 : Math.min(4, Math.round((1 + queued / 3000) * 10) / 10);
  try {
    var sheet = readySheet(classTabSheet);
    /* A laptop that posts in the seconds between the teacher clearing and that
       laptop hearing about it would put its old row straight back, and nothing
       would ever take it away again. Every post carries the reset number the
       device last saw; one that is behind is simply not written. The reply
       still carries the new number, so that device wipes itself and its next
       post counts. */
    var mark = resetMark(room);
    if (p.action === 'submit') {
      if (count(p.cleared) >= mark.n) submit(sheet, room, p);
    }
    if (p.action === 'clear') {
      clearRoom(sheet, room);
      bumpReset(room, p.deep);
      /* Every right answer just went, so what the jar had banked has to go with
         it or the next answer would put the class back where they were. The
         trophies already on the shelf are earned and stay, unless this is the
         deep clear that takes the levels and badges too. */
      var cleared = goalRow(room);
      cleared.banked = 0;
      if (p.deep === 'all') cleared.jars = 0;
      writeGoal(cleared, room);
    }
    if (p.action === 'goal') setGoal(sheet, room, p);
    /* A challenge left for somebody, or the minute that answers one. Both
       write, so both take the lock the same as a score does. */
    var duelError = '';
    if (p.action === 'duel') {
      if (p.duel === 'send') duelError = sendDuel(sheet, room, p) || '';
      else if (p.duel === 'answer') answerDuel(sheet, room, p);
      else if (p.duel === 'decline') declineDuel(room, p);
    }

    /* Writes have to be quick. A whole class answering questions is a steady
       stream of them, they all queue behind this one lock, and re-sorting and
       re-colouring the entire sheet on every single one is what turns a queue
       into a jam: past a certain class size every write sits out the lock and
       is thrown away, so scores stop moving. The colouring is only cosmetic,
       so it now happens at most once a minute. The score itself is written
       every time, and a failed tidy must never cost us the write it came
       with. */
    if (p.action === 'clear' || dueForTidy(room)) {
      try { tidy(sheet); } catch (err2) { /* the score is saved regardless */ }
      try { rebuildStats(sheet); } catch (err3) { /* likewise */ }
    }
    /* An ordinary score post does not need the whole board sent back. Every
       post used to re-read the class, the duels and the goal and hand all of
       it back, with the one lock held throughout, and that was most of what a
       write cost. A post from the current game asks for the short answer (just
       the reset number and the spacing) and the board arrives the way it
       always did for everyone else, on the next read, which the post below
       makes fresh by throwing the held copy away. The jar still rolls over, at
       most every few seconds, and that one does send the full reply. A post
       from an older page does not ask, and gets what it always got. */
    if (p.action === 'submit' && String(p.light) === '1' && !jarDue(room)) {
      cacheDrop(boardKey(room));
      return json({ ok: true, light: true, cleared: mark.n, clearedDeep: mark.deep, ease: ease });
    }
    var m = resetMark(room);
    var now = list(sheet, room);
    /* The jar only ever rolls over in here, with the lock held. Reads happen
       many times a minute from every device at once and take no lock, so
       rolling on a read would let two laptops bank the same jar twice and hand
       out two trophies for it. A score is posted every few seconds by somebody,
       so nobody waits long to see it turn over. */
    var jar = goalRow(room);
    rollJar(jar, room, rightIn(now));

    /* This reply is the freshest the board can be, so it becomes the one every
       read gets for the next few seconds. Putting it there also throws away
       whatever was held before, which is what makes a clear land at once
       rather than lingering for the life of the old answer. */
    var body = JSON.stringify({ ok: true, rows: now, cleared: m.n,
                                clearedDeep: m.deep, jar: jarReply(jar, now),
                                duels: openDuels(room),
                                settled: settledDuels(room),
                                inboxMax: DUEL_INBOX_MAX, ease: ease });
    /* A refusal belongs to the one laptop that asked, not to the class, so it
       is added after the copy that everybody else's read will be served. */
    cachePut(boardKey(room), body);
    if (duelError) {
      var mine = JSON.parse(body);
      mine.duelError = duelError;
      return jsonText(JSON.stringify(mine));
    }
    return jsonText(body);
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

var TIDY_EVERY_MS = 60 * 1000;

/**
 * Clearing the board is not just a matter of emptying the sheet. Twenty-four
 * laptops are still holding their scores, and each one posts again within
 * half a minute - which is why a clear used to look as though it had not
 * worked. So every class carries a reset marker that only ever goes up. It
 * rides along with every reply; a device that sees a number higher than the
 * one it remembers wipes itself and stores the new one. Nobody has to walk
 * round the room.
 *
 * The depth says how far to wipe: "scores" leaves each child's levels and
 * badges alone, "all" takes those too.
 */
function resetMark(room) {
  try {
    var raw = PropertiesService.getScriptProperties()
                .getProperty('reset:' + String(room).toLowerCase());
    var bits = String(raw || '0|scores').split('|');
    return { n: count(bits[0]), deep: bits[1] === 'all' ? 'all' : 'scores' };
  } catch (err) {
    return { n: 0, deep: 'scores' };
  }
}

function bumpReset(room, deep) {
  try {
    var was = resetMark(room);
    var next = was.n + 1;
    PropertiesService.getScriptProperties()
      .setProperty('reset:' + String(room).toLowerCase(),
                   next + '|' + (deep === 'all' ? 'all' : 'scores'));
    return { n: next, deep: deep === 'all' ? 'all' : 'scores' };
  } catch (err) {
    return resetMark(room);
  }
}

function dueForTidy(room) {
  try {
    /* One timer per class. With a single shared timer one busy class would
       keep taking the turn and the others would never be tidied. */
    var tidyKey = 'lastTidy:' + String(room).toLowerCase();
    var props = PropertiesService.getScriptProperties();
    var last = Number(props.getProperty(tidyKey)) || 0;
    var now = new Date().getTime();
    if (now - last < TIDY_EVERY_MS) return false;
    props.setProperty(tidyKey, String(now));
    return true;
  } catch (err) {
    return false;   // never let housekeeping stand between a child and a score
  }
}

function json(obj) {
  return jsonText(JSON.stringify(obj));
}

function jsonText(text) {
  return ContentService.createTextOutput(text)
    .setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------- the cache
 * How long one answer about the board is handed out for. Short enough that
 * nobody notices, long enough that a class of twenty-four turns a read a
 * second into a read every few seconds. Every write replaces it, so a score
 * you have just posted, a cleared board and a changed reward all appear at
 * once rather than waiting this out.
 */
var BOARD_CACHE_S = 6;

function boardKey(room) { return 'board:' + String(room).toLowerCase(); }

function cacheGet(key) {
  try {
    if (typeof CacheService === 'undefined') return null;
    return CacheService.getScriptCache().get(key);
  } catch (err) { return null; }        // never let the cache cost anyone a read
}

function cacheDrop(key) {
  try {
    if (typeof CacheService === 'undefined') return;
    CacheService.getScriptCache().remove(key);
  } catch (err) { /* it expires on its own in a few seconds */ }
}

/* True at most once every JAR_EVERY_S for a class. The jar only has to notice
   it is full, and a class does not fill one in ten seconds, so the whole board
   does not need to be read and totted up after every single score. If the cache
   cannot be reached this says yes, which is the old behaviour. */
var JAR_EVERY_S = 10;
function jarDue(room) {
  try {
    if (typeof CacheService === 'undefined') return true;
    var key = 'jar:' + String(room).toLowerCase();
    var c = CacheService.getScriptCache();
    if (c.get(key)) return false;
    c.put(key, '1', JAR_EVERY_S);
    return true;
  } catch (err) { return true; }
}

function cachePut(key, text) {
  try {
    if (typeof CacheService === 'undefined') return;
    // the service refuses anything over 100KB, and a refusal throws
    if (text.length > 90000) { CacheService.getScriptCache().remove(key); return; }
    CacheService.getScriptCache().put(key, text, BOARD_CACHE_S);
  } catch (err) { /* the answer is already on its way out */ }
}

/* ------------------------------------------------------------------- sheet */

/* ---------------------------------------------------------- class tabs
 * A class is a tab, and its name is the class code. These are the tabs the
 * game keeps for itself, which can therefore never be a class.
 */
var NOT_CLASS_TABS = ['scores', 'duels', 'class goal', 'class tables'];
var CODE_CACHE_S = 60;

function isClassTabName(name) {
  var n = String(name || '').trim().toLowerCase();
  if (!n) return false;
  if (NOT_CLASS_TABS.indexOf(n) > -1) return false;
  if (n.indexOf('stats - ') === 0 || n === 'stats') return false;
  return true;
}

/**
 * The tab for a class code, or null when there is no such class. Matching
 * ignores capitals and spaces at either end. A tab that was just added is
 * found at once, because a miss is never remembered; only a hit is, for a
 * minute, so thirty laptops polling do not each list every tab in the sheet.
 */
function classSheet(code) {
  var want = String(code || '').trim().slice(0, 40).toLowerCase();
  if (!want || !isClassTabName(want)) return null;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ckey = 'code:' + want;
  var known = cacheGet(ckey);
  if (known) {
    var tab = ss.getSheetByName(known);
    if (tab) return { name: tab.getName(), sheet: tab };
  }
  var all = ss.getSheets();
  for (var i = 0; i < all.length; i++) {
    var nm = all[i].getName();
    if (isClassTabName(nm) && nm.trim().toLowerCase() === want) {
      try {
        if (typeof CacheService !== 'undefined') {
          CacheService.getScriptCache().put(ckey, nm, CODE_CACHE_S);
        }
      } catch (err) { /* only a speed-up */ }
      return { name: nm, sheet: all[i] };
    }
  }
  return null;
}

/** Every class tab, in the order they sit in the spreadsheet. */
function classTabs() {
  var all = SpreadsheetApp.getActiveSpreadsheet().getSheets(), out = [];
  for (var i = 0; i < all.length; i++) {
    if (isClassTabName(all[i].getName())) out.push(all[i]);
  }
  return out;
}

/** Makes a tab ready to hold scores: headings on an empty one, and any columns
 *  a tab written by an older copy of this script is missing. */
function readySheet(sheet) {
  if (sheet.getLastRow() === 0) { sheet.appendRow(HEADERS); dressHeader(sheet); }
  /* A sheet set up before the stats existed has one column fewer. The new
     column goes on the end, so an older board just gains a blank cell rather
     than having anything shuffled underneath it. */
  if (sheet.getLastColumn() < HEADERS.length) {
    if (sheet.getMaxColumns() < HEADERS.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(),
                               HEADERS.length - sheet.getMaxColumns());
    }
    dressHeader(sheet);
  }
  return sheet;
}

function readAll(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
}

function submit(sheet, room, p) {
  var name = cleanText(p.name, 24);
  if (!name) return;
  /* The teacher's name is the teacher's. A child who types it gets nowhere; the
     game asks them for the password instead, and a post that carries the right
     one is the only kind that is written under it. */
  var reserved = teacherNameKey();
  if (reserved && nameKey(name) === reserved && !teacherOk(p)) return;
  var best = Math.min(ABS_BEST, count(p.best));
  var streak = Math.min(ABS_RIGHT, count(p.bestStreak));
  var right = Math.min(ABS_RIGHT, count(p.right));
  var packed = packLevels(p.levels);
  var scores = packScores(p.scores);
  var tally = p.tally || {};
  var badges = mergeBadges('', p.badges);
  var days = Math.min(ABS_COUNT, count(p.days));
  var challenges = Math.min(ABS_COUNT, count(p.challenges));
  /* A character, and after a dot the frame round it ("owl.goldring"). Letters
     and the one dot only, so nothing a laptop sends can become anything else. */
  var avatar = String(p.avatar || 'jug').toLowerCase().replace(/[^a-z.]/g, '').slice(0, 40);
  /* The teacher's assignment wins over whatever the laptop says, so a child
     cannot move themselves onto the table that is winning. With no assignment
     for that name, whatever they arrived with stands. */
  var team = teamFor(room, name) || cleanText(p.team, 24);
  var weekScore = Math.min(ABS_BEST, count(p.weekScore));
  /* These two are compared as text and written to a cell, so only the shapes a
     week or a day really has (2026-W45, 2026-11-02) are accepted. */
  var weekOf = /^[0-9]{4}-W[0-9]{2}$/.test(String(p.weekOf || '')) ? String(p.weekOf) : '';
  var dayScore = Math.min(ABS_BEST, count(p.dayScore));
  var dayOf = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(p.dayOf || '')) ? String(p.dayOf) : '';
  var wins = Math.min(ABS_COUNT, count(p.wins));
  var losses = Math.min(ABS_COUNT, count(p.losses));
  var draws = Math.min(ABS_COUNT, count(p.draws));

  /* Locate this player by reading the two name columns only. Pulling all
     fourteen columns of the whole sheet just to find one row is the sort of
     cost that does not matter with three players and matters a great deal
     with thirty. */
  var last = sheet.getLastRow();
  var line = 0;
  if (last > 1) {
    var keys = sheet.getRange(2, COL.room, last - 1, 2).getValues();
    var key = room.toLowerCase() + ' ' + name.toLowerCase();
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i][0]).toLowerCase() + ' ' +
          String(keys[i][1]).toLowerCase() === key) { line = i + 2; break; }
    }
  }

  if (!line && last - 1 >= MAX_KIDS) return;   // a class this size is a flood, not a class

  if (line) {
    var was = sheet.getRange(line, COL.name, 1, ROW_WIDTH).getValues()[0];
    var wasBest = Number(was[1]) || 0;
    /* How far a score can plausibly have moved since this row last changed. A
       child cannot earn 99,999,999 points in two seconds, but a laptop that has
       been playing offline all lesson really can post a big jump after an hour,
       so the allowance grows with the time since the last post. This stops a
       typo, a stray console command and a casual cheat; it does not stop
       somebody patient, and nothing short of checking the answers on the sheet
       itself could. */
    var wasAt = was[11] instanceof Date ? was[11].getTime() : new Date(String(was[11])).getTime();
    var secs = isFinite(wasAt) ? Math.max(0, (Date.now() - wasAt) / 1000) : 3600;
    best = Math.min(best, wasBest + SCORE_SLACK + SCORE_PER_S * secs);
    right = Math.min(right, (Number(was[6]) || 0) + RIGHT_SLACK + RIGHT_PER_S * secs);
    streak = Math.min(streak, right);
    weekScore = Math.min(weekScore, best);
    dayScore = Math.min(dayScore, best);
    // the three parts must always add up to the total on the same row, so the
    // breakdown only moves when a better total arrives with it
    var keepScores = best >= wasBest
      ? scores
      : [Number(was[2]) || 0, Number(was[3]) || 0, Number(was[4]) || 0,
         Number(was[22]) || 0, Number(was[24]) || 0];

    var week = keepDated(weekOf, weekScore, was[19], was[18]);
    var day = keepDated(dayOf, dayScore, was[21], was[20]);

    // one write for the whole row, timestamp and stats included
    sheet.getRange(line, COL.name, 1, ROW_WIDTH).setValues([[
      // the spelling already on the board wins, so "sam" never renames "Sam"
      String(was[0] || name),
      Math.max(wasBest, best),
      keepScores[0], keepScores[1], keepScores[2],
      Math.max(Number(was[5]) || 0, streak),
      Math.max(Number(was[6]) || 0, right),
      packed.tops[0], packed.tops[1], packed.tops[2], packed.detail,
      new Date(),
      packTally(growTally(unpackTally(was[12]), tally)),
      // badges are never taken away, and neither counter ever goes backwards
      mergeBadges(was[13], badges),
      Math.max(count(was[14]), days),
      Math.max(count(was[15]), challenges),
      avatar || String(was[16] || 'jug'),
      team || String(was[17] || ''),
      week.score, week.of,
      day.score, day.of,
      keepScores[3], packed.tops[3],
      /* Duel records only ever grow. A laptop posting an older count must not
         take a win off somebody, which is the same rule every other counter
         on this row follows. */
      Math.max(count(was[24]), wins), Math.max(count(was[25]), losses),
      Math.max(count(was[26]), draws),
      keepScores[4], packed.tops[4]
    ]]);
    return;
  }
  sheet.appendRow(['', room, name, best,
                   scores[0], scores[1], scores[2],
                   streak, right,
                   packed.tops[0], packed.tops[1], packed.tops[2],
                   packed.detail, new Date(), packTally(tally),
                   badges, days, challenges,
                   avatar, team, weekScore, weekOf,
                   dayScore, dayOf,
                   scores[3], packed.tops[3],
                   wins, losses, draws,
                   scores[4], packed.tops[4]]);
}

/**
 * A score that belongs to a period, merged with the one already on the row.
 *
 * A new week, or a new day, starts that score again rather than carrying the
 * old one across, which is the whole point of having a shorter board. Within
 * the same period it only ever grows, because two devices may each hold half
 * of one child's afternoon.
 *
 * The stamps are compared as text, which is why the game sends weeks as
 * "2026-W38" and days zero-padded as "2026-09-14". An unpadded "2026-9-5"
 * would sort as later than "2026-10-1" and a child would carry September's
 * score into October.
 *
 * An arriving stamp that is older than the row's is ignored outright: that is
 * a laptop posting a score it earned before midnight, and it must not be
 * allowed to overwrite what today's play has already put there.
 */
function keepDated(arrivedOf, arrivedScore, hadOfCell, hadScoreCell) {
  var hadOf = String(hadOfCell || '');
  var hadScore = count(hadScoreCell);
  if (arrivedOf > hadOf) return { of: arrivedOf, score: arrivedScore };
  if (arrivedOf === hadOf) return { of: hadOf, score: Math.max(hadScore, arrivedScore) };
  return { of: hadOf, score: hadScore };
}

/** Badges are a set: the union of what two devices have seen, in order. */
function mergeBadges(a, b) {
  var out = [], seen = {};
  /* Room for every badge the game has, and then some: the game has about eighty
     and a limit of sixty quietly dropped the last twenty from the sheet of any
     child who earned them. The ids are short, so this is still a few hundred
     characters. */
  var all = String(a || '').split(',').concat(String(b || '').slice(0, 6000).split(','));
  for (var i = 0; i < all.length && out.length < 250; i++) {
    var id = all[i].replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
    if (!id || seen[id]) continue;
    seen[id] = true;
    out.push(id);
  }
  return out.join(',');
}

/**
 * Counts only ever go up. A device that has been offline for a while can post
 * an older, smaller count, and that must not undo what is already recorded.
 */
function growTally(was, now) {
  now = now || {};
  var out = {};
  for (var m = 0; m < MEASURES.length; m++) {
    var k = MEASURES[m], a = was[k] || {}, b = now[k] || {};
    out[k] = { right: Math.max(count(a.right), count(b.right)),
               wrong: Math.max(count(a.wrong), count(b.wrong)),
               skipped: Math.max(count(a.skipped), count(b.skipped)) };
  }
  return out;
}

/**
 * Right, wrong and skipped for each measure, as one compact cell:
 * "12-3-1 8-2-0 5-1-2" is capacity, then mass, then length.
 */
function packTally(tally) {
  tally = tally || {};
  var out = [];
  for (var m = 0; m < MEASURES.length; m++) {
    var t = tally[MEASURES[m]] || {};
    out.push([count(t.right), count(t.wrong), count(t.skipped)].join('-'));
  }
  return out.join(' ');
}

function unpackTally(cell) {
  var out = {};
  var groups = String(cell || '').trim().split(/\s+/);
  for (var m = 0; m < MEASURES.length; m++) {
    var trio = String(groups[m] || '').split('-');
    out[MEASURES[m]] = { right: count(trio[0]), wrong: count(trio[1]),
                         skipped: count(trio[2]) };
  }
  return out;
}

function count(v) {
  var n = Math.round(Number(v) || 0);
  return n > 0 ? n : 0;
}

function packScores(scores) {
  scores = scores || {};
  var out = [];
  for (var m = 0; m < MEASURES.length; m++) {
    out.push(Math.max(0, Math.round(Number(scores[MEASURES[m]]) || 0)));
  }
  return out;
}

/**
 * Turns the nine levels the game sends into three headline numbers - the
 * best level reached in each measure, so the sheet sorts and reads well -
 * plus one compact cell holding all nine for the teacher's progress view.
 */
function packLevels(levels) {
  levels = levels || {};
  var tops = [], groups = [];
  for (var m = 0; m < MEASURES.length; m++) {
    var src = levels[MEASURES[m]] || {};
    var trio = [], top = 1;
    for (var g = 0; g < GAMES.length; g++) {
      var v = num(src[GAMES[g]]);
      trio.push(v);
      if (v > top) top = v;
    }
    tops.push(top);
    groups.push(trio.join('-'));
  }
  return { tops: tops, detail: groups.join(' ') };
}

function unpackLevels(cell) {
  var out = {};
  var groups = String(cell || '').trim().split(/\s+/);
  for (var m = 0; m < MEASURES.length; m++) {
    var trio = String(groups[m] || '').split('-');
    /* Read by index off both lists, so adding a measure or a game is a line in
       the list above rather than a change here. An older board's cell has four
       groups of four; the fifth group and the fifth number come back missing,
       and num() turns missing into level one, which is exactly right for a
       ladder nobody has played yet. */
    var row = {};
    for (var g = 0; g < GAMES.length; g++) row[GAMES[g]] = num(trio[g]);
    out[MEASURES[m]] = row;
  }
  return out;
}

/* Eight is the top of a ladder; nine and ten are the stretch tier above it for
   children working past their year level. The clamp has to allow them through
   or a child who reaches one is quietly put back to eight by their own board. */
var TOP_LEVEL = 14;

function num(v) {
  var n = Math.round(Number(v) || 1);
  return Math.min(TOP_LEVEL, Math.max(1, n));
}

/**
 * Deleting twenty-four rows one at a time is twenty-four round trips, inside
 * the lock, while a class waits. Keep the rows that belong to other classes,
 * write them back in a single call, and drop whatever is left over in one go.
 */
function clearRoom(sheet, room) {
  var rows = readAll(sheet);
  if (!rows.length) { clearStatsTab(sheet, room); return; }

  var keep = [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][COL.room - 1]).toLowerCase() !== String(room).toLowerCase()) {
      keep.push(rows[i]);
    }
  }
  if (keep.length === rows.length) { clearStatsTab(sheet, room); return; }

  if (keep.length) sheet.getRange(2, 1, keep.length, HEADERS.length).setValues(keep);
  var spare = rows.length - keep.length;
  if (spare > 0) sheet.deleteRows(keep.length + 2, spare);

  clearStatsTab(sheet, room);
  closeRoomDuels(room);
}

/**
 * Duels left open when a class is cleared.
 *
 * Without this they survive the reset, and a child answering one the next
 * morning writes a win onto a row that is supposed to be starting from
 * nothing. The rows are marked rather than deleted, so the tab stays a record
 * of the term, and the whole block is written in two calls rather than two per
 * row, because this runs with the lock held.
 */
function closeRoomDuels(room) {
  var held = duelRows(), rows = held.rows;
  if (!rows.length) return;
  var answered = [], winner = [], any = false, stamp = new Date();
  for (var i = 0; i < rows.length; i++) {
    var mine = String(rows[i][DUEL_COL.room - 1]).toLowerCase() === String(room).toLowerCase();
    var open = !rows[i][DUEL_COL.answered - 1];
    if (mine && open) { any = true; answered.push([stamp]); winner.push(['cleared']); }
    else {
      answered.push([rows[i][DUEL_COL.answered - 1]]);
      winner.push([rows[i][DUEL_COL.winner - 1]]);
    }
  }
  markDuelsCleared(room);
  if (!any) return;
  held.tab.getRange(held.top, DUEL_COL.answered, answered.length, 1).setValues(answered);
  held.tab.getRange(held.top, DUEL_COL.winner, winner.length, 1).setValues(winner);
  duelsChanged();
}

/* When this class last had its duels closed.
   Results that were settled before that moment belong to the term that was
   just cleared, so nobody is told about them afterwards: a child starting again
   from nothing does not want a run of "you beat Kai" from last half term. The
   rows themselves are untouched and still say who won. */
function markDuelsCleared(room) {
  try {
    PropertiesService.getScriptProperties()
      .setProperty('duelclear:' + String(room).toLowerCase(), String(Date.now()));
  } catch (err) { /* the worst case is one stale result on a screen */ }
}

function duelsClearedAt(room) {
  try {
    return count(PropertiesService.getScriptProperties()
                   .getProperty('duelclear:' + String(room).toLowerCase()));
  } catch (err) { return 0; }
}

/** A cleared class must not leave last term's figures sitting in its stats tab. */
function clearStatsTab(sheet, room) {
  try {
    var tab = sheet.getParent().getSheetByName(statsTabName(room));
    if (!tab) return;
    tab.clear();
    tab.setConditionalFormatRules([]);
    tab.getRange(1, 1, 1, STAT_HEAD.length).setValues([STAT_HEAD])
       .setBackground(NAVY).setFontColor(WHITE).setFontWeight('bold')
       .setFontSize(11).setVerticalAlignment('middle').setWrap(true);
    tab.setFrozenRows(1);
    tab.getRange(2, 1).setValue('Cleared - nobody in this class has played since.');
  } catch (err) { /* the scores are what matter */ }
}

/* ----------------------------------------------------------- table teams
 * Who sits at which table, decided by the teacher rather than by the children.
 * Left to themselves a class picks by friendship and you get nine on Red and
 * two on Green, which makes the table totals meaningless.
 *
 * One tab, one row per child: Class, Name, Table. Type the colour next to the
 * name. The script then writes that table onto their row whatever their laptop
 * says, so a child cannot put themselves on the winning table.
 */
var TEAM_TAB  = 'Class tables';
var TEAM_HEAD = ['Class', 'Name', 'Table'];

function teamTab() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tab = ss.getSheetByName(TEAM_TAB);
  var fresh = !tab;
  if (fresh) tab = ss.insertSheet(TEAM_TAB);
  if (fresh || tab.getLastRow() < 1) {
    tab.getRange(1, 1, 1, TEAM_HEAD.length).setValues([TEAM_HEAD])
       .setBackground(NAVY).setFontColor(WHITE).setFontWeight('bold')
       .setFontSize(11).setVerticalAlignment('middle');
    tab.setFrozenRows(1);
    var widths = [190, 190, 140];
    for (var w = 0; w < widths.length; w++) tab.setColumnWidth(w + 1, widths[w]);
  }
  return tab;
}

/** Every assignment for one class, as {lower-case name: table}. */
function teamsFor(room) {
  var out = {};
  try {
    var tab = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TEAM_TAB);
    if (!tab) return out;
    var last = tab.getLastRow();
    if (last < 2) return out;
    var rows = tab.getRange(2, 1, last - 1, TEAM_HEAD.length).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).toLowerCase() !== String(room).toLowerCase()) continue;
      var name = String(rows[i][1]).trim();
      var team = String(rows[i][2]).trim();
      if (name && team) out[name.toLowerCase()] = team;
    }
  } catch (err) { /* no tab, no assignments, no harm */ }
  return out;
}

/** The table this child has been put on, or '' if nobody has said. */
function teamFor(room, name) {
  var all = teamsFor(room);
  return all[String(name).trim().toLowerCase()] || '';
}

/* ------------------------------------------------------------- class goal
 * The jar the whole class fills together, and what filling it is worth.
 *
 * Both of these used to live inside the game file, which meant that changing
 * the reward meant changing it on every laptop in the room. They live in a tab
 * of this sheet instead: type in the cell, and every device picks the new one
 * up on its next refresh.
 *
 * Banked is the number of right answers already spent on jars that are full.
 * Keeping it, rather than dividing the running total by the goal, is what lets
 * the goal be changed halfway through a jar without a class suddenly losing
 * trophies they have already earned.
 */
/* ------------------------------------------------------------- challenges
 * A challenge is one child's minute left on the sheet for another child to
 * answer. It is not a live duel and it deliberately does not try to be: the
 * board already talks to this script every half minute, Apps Script allows
 * thirty requests at once for one account, and a dozen live duels polling
 * every two seconds would be several times that. Nothing here has to agree
 * with anything until both minutes are over, so half a minute of lag costs
 * nobody anything.
 *
 * One row per challenge. A row with nothing in Answered is still open; filling
 * that in settles it, and the winner is written down so neither laptop has to
 * work it out and disagree.
 *
 * Rows are never deleted. A term of duels is a few hundred rows, which is
 * nothing to a sheet, and a teacher who wants to see who has been duelling
 * whom has it all there.
 */
var DUEL_TAB  = 'Duels';
var DUEL_HEAD = ['Class', 'From', 'To', 'From right', 'To right',
                 'Sent', 'Answered', 'Winner'];
var DUEL_COL  = { room: 1, from: 2, to: 3, fromRight: 4, toRight: 5,
                  sent: 6, answered: 7, winner: 8 };
/* An unanswered challenge stops being interesting long before it stops being
   in the sheet. A child should not come back on Thursday to a duel somebody
   left them on Monday and has forgotten. */
var DUEL_OPEN_MS = 24 * 60 * 60 * 1000;

/* How many duels one child may have waiting at once.
   Every duel in the list is a minute of somebody's lesson, so a list of ten is
   ten minutes of a child doing nothing but clearing their inbox, and the
   popular children in a class of thirty would never do anything else. Five is
   enough that nobody is turned away often and few enough that the list can
   always be cleared in one sitting. One number, one place: change it here. */
var DUEL_INBOX_MAX = 5;

function duelTab() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tab = ss.getSheetByName(DUEL_TAB);
  var fresh = !tab;
  if (fresh) tab = ss.insertSheet(DUEL_TAB);
  if (fresh || tab.getLastRow() < 1) {
    tab.getRange(1, 1, 1, DUEL_HEAD.length).setValues([DUEL_HEAD])
       .setBackground(NAVY).setFontColor(WHITE).setFontWeight('bold')
       .setFontSize(11).setVerticalAlignment('middle');
    tab.setFrozenRows(1);
    var widths = [150, 140, 140, 96, 90, 150, 150, 130];
    for (var w = 0; w < widths.length; w++) tab.setColumnWidth(w + 1, widths[w]);
    tab.getRange(1, DUEL_COL.sent, 400, 2).setNumberFormat('d mmm, h:mm am/pm');
  }
  return tab;
}

/**
 * The recent end of the Duels tab, read once per request.
 *
 * Both the open list and the settled list want the same rows, and reading the
 * tab twice for one reply is a whole extra round trip on every single request
 * a class makes. Only the tail is read: a duel expires in a day, so nothing
 * older than the last couple of hundred rows can still be interesting, and a
 * term of duels is a few hundred rows in total.
 */
var DUEL_TAIL = 250;
var DUEL_READ_MAX = 4000;
var duelCache = null;

/* The Duels tab is shared by every class, so "the last 250 rows" is not the
   last 250 of one class. Eight classes sending duels all lesson can fill 250
   rows in well under a day, and a duel left for somebody that morning would
   fall off the end of the window and never be offered to them. So the window is
   measured in time, not rows: it reaches back until the oldest row read is
   already past the day a duel stays open, doubling the read only while it has
   to. A quiet sheet still costs one small read. */
function duelRows() {
  if (duelCache) return duelCache;
  var tab = duelTab();
  var last = tab.getLastRow();
  if (last < 2) { duelCache = { tab: tab, top: 2, rows: [] }; return duelCache; }
  var want = DUEL_TAIL, top, rows, cutoff = Date.now() - DUEL_OPEN_MS;
  for (;;) {
    top = Math.max(2, last - want + 1);
    rows = tab.getRange(top, 1, last - top + 1, DUEL_HEAD.length).getValues();
    var oldest = rows[0][DUEL_COL.sent - 1];
    var oldMs = oldest instanceof Date ? oldest.getTime() : 0;
    if (top <= 2 || !oldMs || oldMs < cutoff || want >= DUEL_READ_MAX) break;
    want = Math.min(DUEL_READ_MAX, want * 2);
  }
  duelCache = { tab: tab, top: top, rows: rows };
  return duelCache;
}

/* One request, one read. Anything that writes to the tab drops it, so the next
   caller in the same request sees what was just written rather than the copy
   taken before it. */
function duelsChanged() { duelCache = null; }

/** Challenges for one class that nobody has answered yet and are still fresh. */
function openDuels(room) {
  var held = duelRows(), rows = held.rows;
  if (!rows.length) return [];
  var out = [], now = Date.now();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][DUEL_COL.room - 1]).toLowerCase() !== room.toLowerCase()) continue;
    if (rows[i][DUEL_COL.answered - 1]) continue;
    var sent = rows[i][DUEL_COL.sent - 1];
    var when = sent instanceof Date ? sent.getTime() : 0;
    if (when && now - when > DUEL_OPEN_MS) continue;
    out.push({
      line: held.top + i,
      from: String(rows[i][DUEL_COL.from - 1] || ''),
      to: String(rows[i][DUEL_COL.to - 1] || ''),
      right: count(rows[i][DUEL_COL.fromRight - 1]),
      sent: when
    });
  }
  return out.slice(-200);
}

/** How many duels are already waiting for one child in this class. */
function inboxCount(room, name) {
  var open = openDuels(room), n = 0, who = String(name || '').toLowerCase();
  for (var i = 0; i < open.length; i++) {
    if (String(open[i].to).toLowerCase() === who) n++;
  }
  return n;
}

/**
 * Duels that have been settled in the last few hours.
 *
 * This is for the child who sent one. They are not sitting there when it is
 * answered, and without this the only sign anything happened is their win
 * count quietly going up in a later lesson, which nobody connects to the duel
 * they sent on Tuesday. The result itself is decided in answerDuel and written
 * to the row; this only reads it back out.
 *
 * Six hours covers a morning sent and an afternoon answered, and stops short
 * of telling a child on Friday about a duel from Wednesday. Only the tail of
 * the tab is read, because a term of duels is a few hundred rows and none of
 * the old ones can possibly be recent.
 */
var DUEL_TOLD_MS = 6 * 60 * 60 * 1000;

function settledDuels(room) {
  var rows = duelRows().rows;
  if (!rows.length) return [];
  var out = [], now = Date.now(), since = duelsClearedAt(room);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][DUEL_COL.room - 1]).toLowerCase() !== room.toLowerCase()) continue;
    var done = rows[i][DUEL_COL.answered - 1];
    var when = done instanceof Date ? done.getTime() : 0;
    if (!when || now - when > DUEL_TOLD_MS) continue;
    // a duel closed by the board being cleared is not news for anybody
    if (String(rows[i][DUEL_COL.winner - 1]) === 'cleared') continue;
    if (since && when <= since) continue;
    out.push({
      from: String(rows[i][DUEL_COL.from - 1] || ''),
      to: String(rows[i][DUEL_COL.to - 1] || ''),
      fromRight: count(rows[i][DUEL_COL.fromRight - 1]),
      toRight: count(rows[i][DUEL_COL.toRight - 1]),
      winner: String(rows[i][DUEL_COL.winner - 1] || ''),
      answered: when
    });
  }
  return out.slice(-30);
}

/**
 * One child leaves a minute for another.
 *
 * Returns '' when it went, or a short reason when it did not, so the laptop
 * that sent it can say something better than nothing. The laptop checks the
 * same rule before the minute starts; this is the check that actually counts,
 * because two children can send to the same person in the same second and only
 * one of them can be right about how full the list was.
 */
function sendDuel(sheet, room, p) {
  var from = cleanText(p.from, 18);
  var to = cleanText(p.to, 18);
  if (!from || !to) return 'names';
  if (from.toLowerCase() === to.toLowerCase()) return 'self';
  /* The person it is for has to be on this class's board. The game only offers
     names off the board, but a board can be cleared or a class switched between
     the list appearing and the send, and a duel left for nobody would sit in
     the Duels tab for a day doing nothing. The spelling on the board is the
     one that is kept, so the two ends always agree on it. */
  var last = sheet.getLastRow(), onBoard = '';
  if (last > 1) {
    var keys = sheet.getRange(2, COL.room, last - 1, 2).getValues();
    for (var k = 0; k < keys.length; k++) {
      if (String(keys[k][0]).toLowerCase() === room.toLowerCase() &&
          String(keys[k][1]).toLowerCase() === to.toLowerCase()) { onBoard = String(keys[k][1]); break; }
    }
  }
  if (!onBoard) return 'nobody';
  to = onBoard.slice(0, 18);
  var tab = duelRows().tab;
  /* One open challenge per pair at a time. Without this a child who presses
     the button four times leaves four identical duels for the same person,
     who then has to answer all four. */
  var open = openDuels(room);
  for (var i = 0; i < open.length; i++) {
    if (open[i].from.toLowerCase() === from.toLowerCase() &&
        open[i].to.toLowerCase() === to.toLowerCase()) {
      tab.getRange(open[i].line, DUEL_COL.fromRight).setValue(count(p.right));
      tab.getRange(open[i].line, DUEL_COL.sent).setValue(new Date());
      duelsChanged();
      return '';
    }
  }
  /* Replacing an existing duel is always allowed - it takes no new room in the
     list - so the count is only checked once we know this is a new one. */
  if (inboxCount(room, to) >= DUEL_INBOX_MAX) return 'full';

  tab.appendRow([room, from, to, count(p.right), '', new Date(), '', '']);
  duelsChanged();
  return '';
}

/**
 * A duel turned down.
 *
 * The row is closed rather than deleted, so the Duels tab stays a record of
 * what happened, and neither child's win or loss count moves: a duel nobody
 * played is not a duel anybody lost. Closing it is also what gives the child
 * their place in the list back, which is the whole reason the button exists.
 */
function declineDuel(room, p) {
  var to = cleanText(p.to, 18);
  var from = cleanText(p.from, 18);
  if (!to || !from) return;
  var open = openDuels(room);
  for (var i = 0; i < open.length; i++) {
    if (open[i].from.toLowerCase() !== from.toLowerCase()) continue;
    if (open[i].to.toLowerCase() !== to.toLowerCase()) continue;
    var tab = duelRows().tab;
    tab.getRange(open[i].line, DUEL_COL.answered).setValue(new Date());
    tab.getRange(open[i].line, DUEL_COL.winner).setValue('declined');
    duelsChanged();
    return;
  }
}

/**
 * The second child's minute, which settles it.
 *
 * The winner is decided here rather than on either laptop, so the two ends
 * cannot disagree about who won, and the duel record on each child's row is
 * written from the same decision.
 */
function answerDuel(sheet, room, p) {
  var to = cleanText(p.to, 18);
  var from = cleanText(p.from, 18);
  if (!to || !from) return;
  var open = openDuels(room), found = null;
  for (var i = 0; i < open.length; i++) {
    if (open[i].from.toLowerCase() === from.toLowerCase() &&
        open[i].to.toLowerCase() === to.toLowerCase()) { found = open[i]; break; }
  }
  if (!found) return;                       // already answered, or expired

  var mine = count(p.right);
  var theirs = found.right;
  var winner = mine > theirs ? to : (theirs > mine ? from : '');

  var tab = duelRows().tab;
  tab.getRange(found.line, DUEL_COL.toRight).setValue(mine);
  tab.getRange(found.line, DUEL_COL.answered).setValue(new Date());
  tab.getRange(found.line, DUEL_COL.winner).setValue(winner || 'draw');
  duelsChanged();

  if (winner) {
    bumpDuel(sheet, room, winner, 'wins');
    bumpDuel(sheet, room, winner.toLowerCase() === to.toLowerCase() ? from : to, 'losses');
  } else {
    /* A draw is a result, not the absence of one, and it used to be written
       into the Duels tab and then dropped on the floor: neither child's row
       moved, so two children who had tied came away with nothing to show for
       the minute. Both of them get one. */
    bumpDuel(sheet, room, from, 'draws');
    bumpDuel(sheet, room, to, 'draws');
  }
}

/** Add one to a child's win or loss count on the Scores tab. */
function bumpDuel(sheet, room, name, which) {
  var last = sheet.getLastRow();
  if (last < 2) return;
  var keys = sheet.getRange(2, COL.room, last - 1, 2).getValues();
  var key = room.toLowerCase() + ' ' + name.toLowerCase();
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0]).toLowerCase() + ' ' +
        String(keys[i][1]).toLowerCase() !== key) continue;
    var col = which === 'wins' ? COL.wins
            : which === 'draws' ? COL.draws : COL.losses;
    var cell = sheet.getRange(i + 2, col);
    cell.setValue(count(cell.getValue()) + 1);
    return;
  }
}

var GOAL_TAB  = 'Class goal';
var GOAL_HEAD = ['Class', 'Goal', 'Reward', 'Jars filled', 'Banked', 'Updated'];
var GOAL_COL  = { room: 1, goal: 2, reward: 3, jars: 4, banked: 5, updated: 6 };
var DEFAULT_GOAL = 1000;

function goalTab() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tab = ss.getSheetByName(GOAL_TAB);
  var fresh = !tab;
  if (fresh) tab = ss.insertSheet(GOAL_TAB);
  if (fresh || tab.getLastRow() < 1) {
    tab.getRange(1, 1, 1, GOAL_HEAD.length).setValues([GOAL_HEAD])
       .setBackground(NAVY).setFontColor(WHITE).setFontWeight('bold')
       .setFontSize(11).setVerticalAlignment('middle');
    tab.setFrozenRows(1);
    var widths = [190, 88, 340, 96, 92, 150];
    for (var w = 0; w < widths.length; w++) tab.setColumnWidth(w + 1, widths[w]);
    tab.getRange(1, GOAL_COL.updated, 200, 1).setNumberFormat('d mmm, h:mm am/pm');
  }
  return tab;
}

function goalOf(v) {
  var n = Math.round(Number(v) || 0);
  return n >= 10 ? n : DEFAULT_GOAL;      // a goal of nothing is not a goal
}

/** The row as it stands, or null. Never writes, so a read is safe to call it. */
function findGoal(room) {
  try {
    var tab = goalTab();
    var last = tab.getLastRow();
    if (last < 2) return null;
    var rows = tab.getRange(2, 1, last - 1, GOAL_HEAD.length).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][GOAL_COL.room - 1]).toLowerCase() === String(room).toLowerCase()) {
        return { tab: tab, line: i + 2,
                 goal: goalOf(rows[i][GOAL_COL.goal - 1]),
                 reward: String(rows[i][GOAL_COL.reward - 1] || ''),
                 jars: count(rows[i][GOAL_COL.jars - 1]),
                 banked: count(rows[i][GOAL_COL.banked - 1]) };
      }
    }
    return null;
  } catch (err) {
    return null;            // a missing tab must never cost anyone a score
  }
}

/** The row, made if this class has never had one. Only call it under the lock. */
function goalRow(room) {
  var found = findGoal(room);
  if (found) return found;
  var tab = goalTab();
  var made = { tab: tab, line: Math.max(2, tab.getLastRow() + 1),
               goal: DEFAULT_GOAL, reward: '', jars: 0, banked: 0 };
  writeGoal(made, room);
  return made;
}

function writeGoal(g, room) {
  g.tab.getRange(g.line, 1, 1, GOAL_HEAD.length)
       .setValues([[String(room), g.goal, g.reward, g.jars, g.banked, new Date()]]);
}

/** How many right answers this class has between them. */
function rightIn(rows) {
  var sum = 0;
  for (var i = 0; i < rows.length; i++) sum += count(rows[i].right);
  return sum;
}

/** A full jar empties and the next one starts. A while loop, not an if, so a
    goal lowered below what the class has already done catches up at once. */
function rollJar(g, room, total) {
  var moved = false;
  var guard = 0;
  while (g.goal > 0 && total - g.banked >= g.goal && guard++ < 500) {
    g.banked += g.goal;
    g.jars += 1;
    moved = true;
  }
  if (moved) writeGoal(g, room);
  return moved;
}

function setGoal(sheet, room, p) {
  var g = goalRow(room);
  if (p.goal !== undefined && String(p.goal) !== '') g.goal = goalOf(p.goal);
  if (p.reward !== undefined) g.reward = cleanText(p.reward, 140);
  /* "We have had that reward, start the jar again." The scores stay exactly
     where they are; the jar just banks everything up to now. */
  if (String(p.empty) === '1') g.banked = rightIn(list(sheet, room));
  writeGoal(g, room);
  return g;
}

/** What every device is told about the jar. */
function jarReply(g, rows) {
  var goal = g ? g.goal : DEFAULT_GOAL;
  return { goal: goal,
           reward: g ? g.reward : '',
           jars: g ? g.jars : 0,
           banked: g ? g.banked : 0,
           into: Math.max(0, rightIn(rows) - (g ? g.banked : 0)) };
}

function list(sheet, room) {
  var out = [];
  var rows = readAll(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][COL.room - 1]).toLowerCase() !== String(room).toLowerCase()) continue;
    out.push({
      name: String(rows[i][COL.name - 1]),
      best: Number(rows[i][COL.best - 1]) || 0,
      bestStreak: Number(rows[i][COL.streak - 1]) || 0,
      right: Number(rows[i][COL.right - 1]) || 0,
      levels: unpackLevels(rows[i][COL.detail - 1]),
      scores: {
        capacity: Number(rows[i][COL.sCap - 1]) || 0,
        mass: Number(rows[i][COL.sMass - 1]) || 0,
        length: Number(rows[i][COL.sLen - 1]) || 0,
        number: Number(rows[i][COL.sNum - 1]) || 0,
        temperature: Number(rows[i][COL.sTemp - 1]) || 0
      },
      tally: unpackTally(rows[i][COL.tally - 1]),
      badges: String(rows[i][COL.badges - 1] || ''),
      days: count(rows[i][COL.days - 1]),
      challenges: count(rows[i][COL.challenges - 1]),
      avatar: String(rows[i][COL.avatar - 1] || 'jug'),
      team: String(rows[i][COL.team - 1] || ''),
      weekScore: count(rows[i][COL.weekScore - 1]),
      weekOf: String(rows[i][COL.weekOf - 1] || ''),
      dayScore: count(rows[i][COL.dayScore - 1]),
      dayOf: String(rows[i][COL.dayOf - 1] || ''),
      wins: count(rows[i][COL.wins - 1]),
      losses: count(rows[i][COL.losses - 1]),
      draws: count(rows[i][COL.draws - 1])
    });
  }
  out.sort(function (a, b) { return b.best - a.best; });
  return out.slice(0, 200);
}

/* -------------------------------------------------------------- the look */

function dressHeader(sheet) {
  var head = sheet.getRange(1, 1, 1, HEADERS.length);
  head.setValues([HEADERS])
      .setBackground(NAVY)
      .setFontColor(WHITE)
      .setFontWeight('bold')
      .setFontSize(11)
      .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 30);
  sheet.setFrozenRows(1);
}

/**
 * Sorts every class by score, numbers the places, and colours the sheet so
 * the leader of each class is obvious at a glance.
 */
function tidy(sheet) {
  var rows = readAll(sheet);
  if (!rows.length) return;

  // sort: class A-Z, then best score high to low, then name
  rows.sort(function (a, b) {
    var ra = String(a[COL.room - 1]).toLowerCase();
    var rb = String(b[COL.room - 1]).toLowerCase();
    if (ra !== rb) return ra < rb ? -1 : 1;
    var d = (Number(b[COL.best - 1]) || 0) - (Number(a[COL.best - 1]) || 0);
    if (d) return d;
    return String(a[COL.name - 1]).toLowerCase() < String(b[COL.name - 1]).toLowerCase() ? -1 : 1;
  });

  var place = 0, current = null, backgrounds = [], fontColours = [], weights = [];
  for (var i = 0; i < rows.length; i++) {
    var room = String(rows[i][COL.room - 1]).toLowerCase();
    if (room !== current) { current = room; place = 0; }
    place++;
    rows[i][COL.place - 1] = place;

    var fill = place === 1 ? GOLD : place === 2 ? SILVER : place === 3 ? BRONZE
             : (i % 2 ? PALE : WHITE);
    var line = [], colour = [], weight = [];
    for (var c = 0; c < HEADERS.length; c++) {
      line.push(fill);
      colour.push(INK);
      weight.push(c === COL.name - 1 || c === COL.best - 1 || c === COL.place - 1
                  ? 'bold' : 'normal');
    }
    backgrounds.push(line);
    fontColours.push(colour);
    weights.push(weight);
  }

  var body = sheet.getRange(2, 1, rows.length, HEADERS.length);
  body.setValues(rows)
      .setBackgrounds(backgrounds)
      .setFontColors(fontColours)
      .setFontWeights(weights)
      .setVerticalAlignment('middle');

  // clear anything left below the data from a previous, longer run
  var spare = sheet.getMaxRows() - (rows.length + 1);
  if (spare > 0) sheet.getRange(rows.length + 2, 1, spare, HEADERS.length).clear();

  sheet.getRange(2, COL.place, rows.length, 1).setHorizontalAlignment('center');
  sheet.getRange(2, COL.best, rows.length, 1)
       .setFontSize(12).setHorizontalAlignment('center');
  sheet.getRange(2, COL.sCap, rows.length, 3).setHorizontalAlignment('center');
  sheet.getRange(2, COL.streak, rows.length, 2).setHorizontalAlignment('center');
  sheet.getRange(2, COL.cap, rows.length, 3)
       .setFontColor('#5A7284').setHorizontalAlignment('center');
  sheet.getRange(2, COL.detail, rows.length, 1)
       .setFontColor('#7E97A6').setFontSize(10).setHorizontalAlignment('center');
  sheet.getRange(2, COL.updated, rows.length, 1)
       .setNumberFormat('d mmm, h:mm am/pm').setFontColor('#7E97A6');

  var widths = [56, 126, 140, 78, 86, 74, 80, 92, 62, 80, 84, 92, 140, 138,
                150, 190, 62, 84, 88, 78, 86, 84, 82, 96, 86, 96, 82, 82];
  /* Twenty-eight calls, once a minute, with the lock held, to set widths that
     were already set. One read says whether they need setting at all, and a
     teacher who has widened a column is no longer put back every minute. */
  if (sheet.getColumnWidth(1) !== widths[0]) {
    for (var w = 0; w < widths.length; w++) sheet.setColumnWidth(w + 1, widths[w]);
  }

  scoreBar(sheet, rows.length);
  dressHeader(sheet);
}

/** A green bar behind each score, so the spread is visible without reading. */
function scoreBar(sheet, count) {
  var range = sheet.getRange(2, COL.best, count, 1);
  var rule = SpreadsheetApp.newConditionalFormatRule()
    .setGradientMinpointWithValue(WHITE, SpreadsheetApp.InterpolationType.MIN, '')
    .setGradientMaxpointWithValue('#9AD3B0', SpreadsheetApp.InterpolationType.MAX, '')
    .setRanges([range])
    .build();
  sheet.setConditionalFormatRules([rule]);
}

/* ------------------------------------------------------- the class stats */

var STAT_HEAD = ['Name',
                 'Capacity right', 'Capacity wrong', 'Capacity %',
                 'Mass right', 'Mass wrong', 'Mass %',
                 'Length right', 'Length wrong', 'Length %',
                 'Number right', 'Number wrong', 'Number %',
                 'Total right', 'Total wrong', 'Overall %',
                 'Skipped', 'Best streak', 'Score', 'Badges', 'Days',
                 'Table', 'This week', 'Today', 'Updated'];

/** Sheet names cannot hold every character a class name might. */
function statsTabName(room) {
  var clean = String(room).replace(/[\[\]\*\/\\\?:]/g, ' ')
                          .replace(/\s+/g, ' ').trim().slice(0, 80);
  return 'Stats - ' + (clean || 'class');
}

/**
 * One tab per class, one row per child: how many they got right, how many
 * they got wrong and how often they skipped, in each of the three measures.
 * It is rebuilt whole rather than patched, which is exactly why it belongs in
 * the once-a-minute tidy and nowhere near the write path.
 */
function rebuildStats(sheet) {
  var ss = sheet.getParent();
  var rows = readAll(sheet);
  var byRoom = {}, order = [];
  for (var i = 0; i < rows.length; i++) {
    var room = String(rows[i][COL.room - 1]);
    if (!room) continue;
    if (!byRoom[room]) { byRoom[room] = []; order.push(room); }
    byRoom[room].push(rows[i]);
  }
  for (var r = 0; r < order.length; r++) {
    try { writeStatsTab(ss, order[r], byRoom[order[r]]); } catch (err) { /* skip it */ }
  }
}

function pct(right, wrong) {
  var total = right + wrong;
  return total ? Math.round((right / total) * 100) : '';
}

function writeStatsTab(ss, room, rows) {
  var tab = ss.getSheetByName(statsTabName(room));
  var isNew = !tab;
  if (!tab) {
    tab = ss.insertSheet(statsTabName(room));
  } else {
    tab.clear();
    tab.setConditionalFormatRules([]);
  }

  var body = [];
  for (var i = 0; i < rows.length; i++) {
    var t = unpackTally(rows[i][COL.tally - 1]);
    var c = t.capacity, m = t.mass, l = t.length;
    var n = t.number || { right: 0, wrong: 0, skipped: 0 };
    var allRight = c.right + m.right + l.right + n.right;
    var allWrong = c.wrong + m.wrong + l.wrong + n.wrong;
    body.push([
      String(rows[i][COL.name - 1]),
      c.right, c.wrong, pct(c.right, c.wrong),
      m.right, m.wrong, pct(m.right, m.wrong),
      l.right, l.wrong, pct(l.right, l.wrong),
      n.right, n.wrong, pct(n.right, n.wrong),
      allRight, allWrong, pct(allRight, allWrong),
      c.skipped + m.skipped + l.skipped + n.skipped,
      Number(rows[i][COL.streak - 1]) || 0,
      Number(rows[i][COL.best - 1]) || 0,
      String(rows[i][COL.badges - 1] || '').split(',').filter(String).length,
      count(rows[i][COL.days - 1]),
      String(rows[i][COL.team - 1] || ''),
      count(rows[i][COL.weekScore - 1]),
      count(rows[i][COL.dayScore - 1]),
      rows[i][COL.updated - 1]
    ]);
  }
  // by name, because this is a list to look a child up in, not a race
  body.sort(function (a, b) {
    return String(a[0]).toLowerCase() < String(b[0]).toLowerCase() ? -1 : 1;
  });

  tab.getRange(1, 1, 1, STAT_HEAD.length).setValues([STAT_HEAD])
     .setBackground(NAVY).setFontColor(WHITE).setFontWeight('bold')
     .setFontSize(11).setVerticalAlignment('middle').setWrap(true);
  if (isNew) {
    tab.setRowHeight(1, 40);
    tab.setFrozenRows(1);
    tab.setFrozenColumns(1);
  }

  if (!body.length) {
    tab.getRange(2, 1).setValue('Nobody in this class has played yet.');
    return;
  }

  tab.getRange(2, 1, body.length, STAT_HEAD.length).setValues(body)
     .setVerticalAlignment('middle');
  tab.getRange(2, 1, body.length, 1).setFontWeight('bold');
  tab.getRange(2, 2, body.length, STAT_HEAD.length - 2)
     .setHorizontalAlignment('center');
  tab.getRange(2, STAT_HEAD.length, body.length, 1)
     .setNumberFormat('d mmm, h:mm am/pm').setFontColor('#7E97A6');

  // banding, so one child's row stays readable across seventeen columns
  var fills = [];
  for (var b = 0; b < body.length; b++) {
    var line = [];
    for (var cix = 0; cix < STAT_HEAD.length; cix++) line.push(b % 2 ? PALE : WHITE);
    fills.push(line);
  }
  tab.getRange(2, 1, body.length, STAT_HEAD.length).setBackgrounds(fills);

  /* Red through amber to green down each percentage column. The point of this
     tab is that a child who is fine on capacity and lost on length should be
     obvious without reading a single number. */
  var rules = [];
  /* The four per-measure percentage columns plus the overall one. Number was
     added in the middle of the row, so the overall column moved from 13 to 16. */
  var pctCols = [4, 7, 10, 13, 16];
  for (var q = 0; q < pctCols.length; q++) {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .setGradientMinpointWithValue('#F3B2B2', SpreadsheetApp.InterpolationType.NUMBER, '0')
      .setGradientMidpointWithValue('#FBE7B2', SpreadsheetApp.InterpolationType.NUMBER, '60')
      .setGradientMaxpointWithValue('#9AD3B0', SpreadsheetApp.InterpolationType.NUMBER, '100')
      .setRanges([tab.getRange(2, pctCols[q], body.length, 1)])
      .build());
  }
  tab.setConditionalFormatRules(rules);

  var widths = [140, 92, 96, 84, 78, 82, 74, 88, 92, 82, 88, 92, 88, 90, 86,
                84, 78, 92, 74, 74, 62, 78, 88, 74, 138];
  // widths survive a clear(), so they are only set when the tab is first made
  if (isNew) {
    for (var w = 0; w < widths.length; w++) tab.setColumnWidth(w + 1, widths[w]);
  }
}

/* -------------------------------------------------------------- the menu */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Measuring Lab')
    .addItem('Add a class...', 'menuAddClass')
    .addItem('Tidy and re-colour the board', 'menuTidy')
    .addItem('Set teacher name and password...', 'menuTeacherCode')
    .addItem('Speed test this sheet...', 'menuSpeedTest')
    .addItem('Rebuild the class stats tabs', 'menuStats')
    .addItem('Set up the class goal tab', 'menuGoal')
    .addItem('Set up the table assignment tab', 'menuTeams')
    .addSeparator()
    .addItem('Move old Scores tab into class tabs', 'menuMoveOldScores')
    .addItem('Clear one class...', 'menuClearClass')
    .addItem('Clear every score', 'menuClearAll')
    .addToUi();
}

function menuTidy() {
  var tabs = classTabs();
  for (var i = 0; i < tabs.length; i++) {
    var sheet = readySheet(tabs[i]);
    tidy(sheet);
    rebuildStats(sheet);
  }
  SpreadsheetApp.getUi().alert('Board tidied for ' + tabs.length + ' class' +
                               (tabs.length === 1 ? '' : 'es') + '.');
}

function menuStats() {
  var tabs = classTabs();
  for (var i = 0; i < tabs.length; i++) rebuildStats(readySheet(tabs[i]));
  SpreadsheetApp.getUi().alert('Class stats rebuilt - look for the "Stats - " tabs.');
}

/** Adds a class: a tab named for the code, with the headings in place. */
function menuAddClass() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.prompt('Add a class',
    'Type the class code. Children will type exactly this (capitals do not matter).',
    ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  var code = answer.getResponseText().trim().slice(0, 40);
  if (!code) return;
  if (!isClassTabName(code)) {
    ui.alert('"' + code + '" is a name the game keeps for itself. Pick another.');
    return;
  }
  if (/[\[\]*?:\/\\]/.test(code)) {
    ui.alert('A class code cannot contain  [ ] * ? : / \\');
    return;
  }
  if (classSheet(code)) { ui.alert('There is already a class called "' + code + '".'); return; }
  var tab = SpreadsheetApp.getActiveSpreadsheet().insertSheet(code);
  readySheet(tab);
  ui.alert('Class "' + code + '" is ready. Give children that code.');
}

/**
 * One-off: moves rows from the old shared Scores tab into the tab of the class
 * they belong to. Rows for a class with no tab are left where they are.
 */
function menuMoveOldScores() {
  var ui = SpreadsheetApp.getUi();
  var old = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!old || old.getLastRow() < 2) { ui.alert('The old Scores tab has nothing in it.'); return; }
  var rows = readAll(old), moved = 0, keep = [];
  var byTab = {};
  for (var i = 0; i < rows.length; i++) {
    var found = classSheet(rows[i][COL.room - 1]);
    if (!found) { keep.push(rows[i]); continue; }
    rows[i][COL.room - 1] = found.name;
    (byTab[found.name] = byTab[found.name] || { sheet: found.sheet, rows: [] }).rows.push(rows[i]);
    moved++;
  }
  for (var nm in byTab) {
    if (!byTab.hasOwnProperty(nm)) continue;
    var tab = readySheet(byTab[nm].sheet);
    var at = tab.getLastRow() + 1;
    tab.getRange(at, 1, byTab[nm].rows.length, HEADERS.length).setValues(byTab[nm].rows);
    tidy(tab);
  }
  var last = old.getLastRow();
  if (last > 1) old.deleteRows(2, last - 1);
  if (keep.length) old.getRange(2, 1, keep.length, HEADERS.length).setValues(keep);
  ui.alert('Moved ' + moved + ' row' + (moved === 1 ? '' : 's') + ' into class tabs.' +
           (keep.length ? '\n\n' + keep.length + ' belong to a class with no tab and were left in Scores.' : ''));
}

/**
 * The teacher's name and password. A teacher signs in by typing that name on
 * the game's name screen and then the password; only then do the teacher
 * buttons (Who is where, Whiteboard view, Clear, the goal box) appear, and the
 * sheet checks the password again before clearing or changing anything. The
 * name is kept for the teacher: nobody else can play under it. Nothing here is
 * ever written into the page children receive. Setting it again also reopens
 * the login if a class has locked it by guessing.
 */
function menuTeacherCode() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var haveName = String(props.getProperty('teacherName') || '');
  var haveCode = String(props.getProperty('teacherCode') || '').length >= 4;
  var n = ui.prompt('Teacher name',
    'The name you will type on the first screen to sign in as the teacher.' +
    (haveName ? '\n\nNow: ' + haveName + '. Leave blank to keep it.' : ''),
    ui.ButtonSet.OK_CANCEL);
  if (n.getSelectedButton() !== ui.Button.OK) return;
  var name = cleanText(n.getResponseText(), 24) || haveName;
  if (!name) { ui.alert('A teacher name is needed, for example Mr.Sullivan.'); return; }
  var answer = ui.prompt('Teacher password',
    (haveCode ? 'A password is set. Type a new one to replace it.\n\n' : 'No password is set, so clearing and goals are switched off.\n\n') +
    'Six or more characters, and not something a child could guess.',
    ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  var code = String(answer.getResponseText() || '').trim();
  if (code.length < 6) { ui.alert('That is too short. Use six or more characters.'); return; }
  props.setProperty('teacherName', name);
  props.setProperty('teacherCode', code);
  try { CacheService.getScriptCache().remove('tfail'); } catch (e) { /* nothing to reset */ }
  ui.alert('Saved. On the first screen type ' + name + ' as your name and then the password to sign in as the teacher.');
}

/**
 * Times the real thing on this spreadsheet and says how many children it can
 * keep up with. It makes a temporary class called _speedtest with twenty
 * children in it, times posts, reads and a duel the same way the game makes
 * them, then removes every trace. Nothing in a real class is touched.
 */
function menuSpeedTest() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var code = '_speedtest';
  if (ss.getSheetByName(code)) { ui.alert('A leftover _speedtest tab is in the way. Delete it and try again.'); return; }
  var tab = ss.insertSheet(code);
  var report = '';
  try {
    var i, names = [];
    var mk = function (n, bump) {
      return { action: 'submit', room: code, name: n, best: 10 + bump, right: 2 + bump, bestStreak: 3, cleared: 0,
               levels: { capacity: 3, mass: 2, length: 4, temperature: 1, number: 5 },
               scores: { capacity: 50, mass: 20, length: 60, temperature: 10, number: 40 },
               tally: { capacity: { right: 5, wrong: 1 } }, badges: 'a,b', avatar: 'jug',
               weekScore: 10, weekOf: '2026-W45', dayScore: 10, dayOf: '2026-11-02' };
    };
    for (i = 0; i < 20; i++) { names.push('Test' + i); handle(mk(names[i], 0)); }
    var t0 = Date.now(), n = 8;
    for (i = 0; i < n; i++) handle(mk(names[i], i + 1));
    var write = (Date.now() - t0) / n;
    t0 = Date.now();
    for (i = 0; i < 4; i++) {
      CacheService.getScriptCache().remove(boardKey(code));
      handle({ action: 'list', room: code });
    }
    var read = (Date.now() - t0) / 4;
    t0 = Date.now();
    handle({ action: 'duel', duel: 'send', room: code, from: 'Test1', to: 'Test2', right: 5 });
    handle({ action: 'duel', duel: 'answer', room: code, from: 'Test1', to: 'Test2', right: 7 });
    var duelPair = Date.now() - t0;
    var per = Math.max(1, Math.round(write));
    var perSec = 1000 / per;
    // 60% of the time the sheet is writing is about as full as it should be run
    var kids30 = Math.floor(0.6 * 30 * perSec), kids60 = Math.floor(0.6 * 60 * perSec);
    report = 'A score post takes about ' + per + ' ms inside the script.\n' +
      'An uncached read takes about ' + Math.round(read) + ' ms.\n' +
      'A duel sent and answered takes about ' + duelPair + ' ms.\n\n' +
      'The sheet does one write at a time, for every class together. At about ' +
      Math.round(perSec * 10) / 10 + ' writes a second, and with the game posting every 30 seconds, ' +
      'it keeps up comfortably with about ' + kids30 + ' children playing at once across all classes. ' +
      'When more are on, the game stretches its own posting gap towards 60 seconds or more, ' +
      'which carries about ' + kids60 + '.\n\n' +
      'Class tabs do not add capacity: three classes of ten are the same load as one of thirty.';
  } catch (err) {
    report = 'The speed test stopped: ' + err;
  }
  // every trace of the test goes, whatever happened above
  try { ss.deleteSheet(tab); } catch (e1) { /* gone already */ }
  try { var st = ss.getSheetByName(statsTabName(code)); if (st) ss.deleteSheet(st); } catch (e2) { /* none */ }
  [GOAL_TAB, DUEL_TAB].forEach(function (nm) {
    try {
      var t = ss.getSheetByName(nm);
      if (!t) return;
      for (var r = t.getLastRow(); r >= 2; r--) {
        if (String(t.getRange(r, 1).getValue()).toLowerCase() === code) t.deleteRows(r, 1);
      }
    } catch (e3) { /* leave it */ }
  });
  try {
    var pr = PropertiesService.getScriptProperties();
    pr.deleteProperty('lastTidy:' + code);
    pr.deleteProperty('reset:' + code);
    pr.deleteProperty('duelclear:' + code);
  } catch (e4) { /* only housekeeping */ }
  ui.alert('Speed test', report, ui.ButtonSet.OK);
}

function menuClearClass() {
  var ui = SpreadsheetApp.getUi();
  var names = classNames();
  if (!names.length) { ui.alert('There are no class tabs yet. Use Add a class.'); return; }
  var answer = ui.prompt('Clear one class',
    'Type the class code exactly as it appears.\n\nClasses in this sheet:\n' +
    names.join('\n'), ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  var found = classSheet(answer.getResponseText());
  if (!found) { ui.alert('There is no class with that code.'); return; }
  var sheet = readySheet(found.sheet), room = found.name;
  clearRoom(sheet, room);
  bumpReset(room, 'scores');
  tidy(sheet);
  ui.alert('Cleared every score for "' + room + '".\n\n' +
           'Laptops still open will clear themselves within a minute.');
}

function menuClearAll() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert('Clear every score',
    'This wipes every class from the board. It cannot be undone.',
    ui.ButtonSet.OK_CANCEL);
  if (answer !== ui.Button.OK) return;
  var tabs = classTabs();
  for (var t = 0; t < tabs.length; t++) {
    var sheet = readySheet(tabs[t]);
    var name = sheet.getName();
    var last = sheet.getLastRow();
    if (last > 1) sheet.deleteRows(2, last - 1);
    clearStatsTab(sheet, name);
    bumpReset(name, 'scores');
    var g = goalRow(name);
    g.banked = 0;
    writeGoal(g, name);
  }
  ui.alert('The board is empty.\n\n' +
           'Laptops still open will clear themselves within a minute.');
}

/**
 * Makes the tab and gives every class in the sheet a row in it, so there is
 * something to type into rather than a blank page.
 */
/**
 * Makes the table tab and lists every child already on the board, so the job is
 * typing a colour beside each name rather than typing the names as well. Anyone
 * already assigned keeps their table.
 */
function menuTeams() {
  var tab = teamTab();
  var rows = [];
  var tabs = classTabs();
  for (var ct = 0; ct < tabs.length; ct++) rows = rows.concat(readAll(readySheet(tabs[ct])));

  var had = {};
  var last = tab.getLastRow();
  if (last > 1) {
    var old = tab.getRange(2, 1, last - 1, TEAM_HEAD.length).getValues();
    for (var o = 0; o < old.length; o++) {
      had[String(old[o][0]).toLowerCase() + '|' + String(old[o][1]).toLowerCase()] =
        String(old[o][2]);
    }
  }

  var out = [], seen = {};
  for (var i = 0; i < rows.length; i++) {
    var room = String(rows[i][COL.room - 1]);
    var name = String(rows[i][COL.name - 1]);
    if (!room || !name) continue;
    var key = room.toLowerCase() + '|' + name.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    out.push([room, name, had[key] || '']);
  }
  out.sort(function (a, b) {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    return String(a[1]).toLowerCase() < String(b[1]).toLowerCase() ? -1 : 1;
  });

  if (last > 1) tab.deleteRows(2, last - 1);
  if (out.length) tab.getRange(2, 1, out.length, TEAM_HEAD.length).setValues(out);

  SpreadsheetApp.getUi().alert(
    out.length
      ? 'The "' + TEAM_TAB + '" tab lists ' + out.length + ' name' +
        (out.length === 1 ? '' : 's') + '.\n\nType a table beside each one, ' +
        'spelled the way it is in the TABLES setting. Children are not asked ' +
        'to pick, and the table you type is written onto their score whatever ' +
        'their laptop says.\n\nAdd rows by hand for children who have not played yet.'
      : 'The "' + TEAM_TAB + '" tab is ready.\n\nNobody has played yet, so there ' +
        'are no names to list. Type them in yourself, or run this again once ' +
        'they have.');
}

function menuGoal() {
  var names = classNames();
  goalTab();
  for (var i = 0; i < names.length; i++) goalRow(names[i]);
  SpreadsheetApp.getUi().alert(
    'The "' + GOAL_TAB + '" tab is ready.\n\n' +
    'Type what filling the jar is worth in the Reward column, and how many ' +
    'right answers it takes in the Goal column. Every laptop picks the change ' +
    'up within about half a minute. Leave Jars filled and Banked alone.');
}

/** The class codes: the names of the class tabs. */
function classNames() {
  var tabs = classTabs(), out = [];
  for (var i = 0; i < tabs.length; i++) out.push(tabs[i].getName());
  return out;
}

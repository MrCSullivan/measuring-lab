# Hosting Measuring Lab on a website

Why bother: today the game page is served by Apps Script, so an iPad has to wake
Google's script up before it can even show the first screen. When that is slow or
the school network drops it, the iPad says it cannot connect. Hosted on an
ordinary website, the page opens straight away, is saved on the iPad after the
first visit (so it opens even on a bad connection), and can be added to the Home
Screen like an app. Only the scores still go to the Google Sheet, and the game
already retries those quietly.

Nothing secret is in these files. The teacher password lives only in the sheet.

## What is in this folder

| File | What it is |
| --- | --- |
| index.html | The game. The same file you paste into Apps Script as `Page`. |
| config.js | One line: the address of your Apps Script web app. The only file you edit. |
| sw.js | Saves the game on the device and opens it when the connection is poor. |
| manifest.webmanifest, icon-192.png, icon-512.png, apple-touch-icon.png | Make "Add to Home Screen" work, with an icon. |
| fonts.css and the .woff2 files | The two fonts the game uses, kept next to index.html so the page never waits on another website for them. |

Keep all of them together in one folder, with no folders inside it.

## Step 1. Update the script

1. In the Apps Script editor, replace the code with `measuring-lab-leaderboard_38.gs`.
2. Choose Deploy, Manage deployments, the pencil, New version, Deploy. Keep it as
   Execute as **Me** and Who has access **Anyone**. (Not "Anyone with a Google
   account": the hosted page cannot sign in.)
3. Copy the web app address. It begins `https://script.google.com/macros/s/` and
   ends `/exec`.
4. Reopen the sheet. In the Measuring Lab menu choose **Set teacher name and
   password** if you have not already.

## Step 2. Put the address in config.js

Open `config.js` in any text editor and paste the address between the quotes:

    window.MEASURING_LAB_SHEET = "https://script.google.com/macros/s/AKfycb.../exec";

## Step 3. Put the folder on a website

It must be https. Any one of these works.

**GitHub Pages (free).** Make a new public repository, upload every file in this
folder to it, then Settings, Pages, deploy from the main branch. Your address is
`https://YOURNAME.github.io/REPOSITORYNAME/`.

**Netlify Drop (free, no account needed to try).** Go to app.netlify.com/drop and
drag this whole folder onto the page. It gives you an address straight away.

**Your school website.** Ask whoever looks after it to publish the folder as it
is. Any web host that serves plain files will do.

## Step 4. Try it on an iPad

1. Open the hosted address in Safari. You should see "Which class are you in?".
2. Type a class code (the name of a tab in your sheet). If it moves on to "Who is
   playing?", the address in `config.js` is right.
3. To make it an app: Share button, Add to Home Screen. It then opens full screen
   with its own icon.

Give children the hosted address, not the Apps Script one.

## Changing the game later

Replace `index.html` on the website with the new one. Each iPad picks it up the
next time it is opened with a working connection. If the connection is slow, it
opens the saved copy first and has the new one the time after. Changing
`config.js` works the same way.

## When a whole class opens it at once

Fifteen or twenty iPads opening the link in the same minute is fine for the game
itself: the page is a single 120 KB download, and the Google side was tested with
sixty children pressing Continue within three seconds without a single refusal.
When some iPads still fail to load the page, the cause is almost always the
school network, not the game. Things that help:

- **Use a QR code, not a typed address.** A long address typed by twenty children
  is wrong on a few of them, and the error looks like "cannot connect". On a
  computer, open the hosted address in Chrome, right-click the page and choose
  Create QR code for this page, then put it on the board.
- **Do not all press Go on the same second.** Call the iPads in two or three
  groups.
- **After the first successful visit, use the Home Screen icon.** It opens the
  saved copy and needs no connection to show the first screen.
- **If a page opens blank:** older copies waited on Google's font server and sat
  on a white screen where it was slow. This version no longer does.

If some iPads still cannot load it, test one that fails:

- Does google.com open?
- Does it work on a phone hotspot? If yes, the school network or filter is the cause.
- Is it only when many iPads start together? That points to the school's Wi-Fi or filter limiting new connections.

Then ask IT to allow `script.google.com` and `script.googleusercontent.com`
(the class sheet), and the address you host the game on. The fonts no longer need
anything outside your own site.

## Weekly scores and the connection log

Scores start again from 0 every Monday at 8am, Adelaide time, worked out by the
sheet so every iPad agrees. Last week's points are copied to a **Weekly history**
tab first, so nothing is lost, and the all-time total is never reset.

If an iPad cannot reach the sheet, it remembers what went wrong and hands it
over the next time it gets through. Look at the **Connection log** tab to see
what happened: a timeout (weak or just-woken Wi-Fi), a network failure (Wi-Fi
dropping, or a filter), or a web page instead of data (Google briefly down, or
a filter's block page), and whether it was the Home Screen app or Safari.

## Limits worth knowing

- The very first visit on a device needs the network, to save the game.
- Private Browsing in Safari does not keep the saved copy.
- Class codes are the only thing keeping other people out of a class's board, so
  use ones that are hard to guess (for example `5Semmler-4821`).

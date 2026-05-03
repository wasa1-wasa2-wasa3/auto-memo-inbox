/**
 * Auto Memo Inbox Gmail bridge.
 *
 * Setup:
 * 1. Create a Gmail filter for your +memo address and apply the AutoMemo label.
 * 2. Paste this file into Google Apps Script.
 * 3. Set VERCEL_INBOUND_URL and INBOUND_SECRET below.
 * 4. Run installTrigger() once.
 */

const CONFIG = {
  // Example: https://auto-memo-inbox.vercel.app/api/inbound/gmail
  VERCEL_INBOUND_URL: 'https://YOUR-VERCEL-DOMAIN.vercel.app/api/inbound/gmail',
  INBOUND_SECRET: 'PASTE_THE_SAME_SECRET_AS_VERCEL',
  SOURCE_LABEL: 'AutoMemo',
  DONE_LABEL: 'AutoMemoDone',
  MAX_THREADS_PER_RUN: 10,
  BODY_MAX_CHARS: 4000,
};

function syncAutoMemoGmail() {
  const sourceLabel = getOrCreateLabel_(CONFIG.SOURCE_LABEL);
  const doneLabel = getOrCreateLabel_(CONFIG.DONE_LABEL);
  const query = `label:${CONFIG.SOURCE_LABEL} -label:${CONFIG.DONE_LABEL}`;
  const threads = GmailApp.search(query, 0, CONFIG.MAX_THREADS_PER_RUN);

  threads.forEach((thread) => {
    const messages = thread.getMessages();
    const message = messages[messages.length - 1];
    const payload = {
      gmailMessageId: message.getId(),
      threadId: thread.getId(),
      from: message.getFrom(),
      to: message.getTo(),
      subject: message.getSubject(),
      date: message.getDate().toISOString(),
      body: trimBody_(message.getPlainBody()),
    };

    const response = UrlFetchApp.fetch(CONFIG.VERCEL_INBOUND_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'X-Inbound-Secret': CONFIG.INBOUND_SECRET,
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    const status = response.getResponseCode();
    if (status >= 200 && status < 300) {
      thread.addLabel(doneLabel);
      thread.removeLabel(sourceLabel);
    } else {
      console.log(`AutoMemo failed: ${status} ${response.getContentText()}`);
    }
  });
}

function installTrigger() {
  ScriptApp.newTrigger('syncAutoMemoGmail')
    .timeBased()
    .everyMinutes(5)
    .create();
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function trimBody_(body) {
  return String(body || '')
    .replace(/\r/g, '')
    .trim()
    .slice(0, CONFIG.BODY_MAX_CHARS);
}

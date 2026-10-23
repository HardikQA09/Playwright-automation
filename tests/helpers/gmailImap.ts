import tls from 'tls';

import {
  BASE_URL,
  TEST_USERS
} from '../config/testData';

import '../config/loadLocalEnv';

/* =============================================================================
HELPER: Gmail IMAP verification

PURPOSE
-------
Reads the OOLTool verification link from Gmail.

Requires a Google App Password in gitignored .env or the terminal:

GMAIL_USER=imhardikthanki@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
============================================================================= */

const MAILBOXES = [
  'INBOX',
  '[Gmail]/All Mail',
  '[Gmail]/Spam',
  '[Google Mail]/All Mail',
  '[Google Mail]/Spam'
];

function envTimeoutMs() {
  const parsed = Number(
    process.env.GMAIL_IMAP_TIMEOUT_MS
  );

  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return 180000;
}

export function isGmailAutomationEnabled() {
  return Boolean(
    gmailAppPassword()
  );
}

function gmailUser() {
  return (
    process.env.GMAIL_USER ??
    TEST_USERS.onboarding.emailBase ??
    ''
  ).trim();
}

function gmailAppPassword() {
  return (
    process.env.GMAIL_APP_PASSWORD ??
    ''
  ).replace(/\s+/g, '');
}

function decodeQuotedPrintable(value: string) {
  return value
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_match, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16))
    );
}

function decodeBase64(value: string) {
  try {
    return Buffer.from(
      value.replace(/\s+/g, ''),
      'base64'
    ).toString('utf8');
  } catch {
    return '';
  }
}

function decodeMime(rawEmail: string) {
  const quoted = decodeQuotedPrintable(rawEmail);
  const withBase64 = quoted.replace(
    /Content-Transfer-Encoding:\s*base64\s*\r?\n\r?\n([A-Za-z0-9+/=\s]+)/gi,
    (_match, body: string) => `\n${decodeBase64(body)}\n`
  );

  return `${quoted}\n${withBase64}`;
}

function extractAppLinks(rawEmail: string) {
  const decoded = decodeMime(rawEmail)
    .replace(/&amp;/gi, '&')
    .replace(/&#x3d;|=3D/gi, '=');

  const escapedBase = BASE_URL.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&'
  );

  const patterns = [
    new RegExp(`${escapedBase}/[^\\s"'<>\\\\]+`, 'ig'),
    /https?:\/\/(?:www\.)?ooltool\.com\/[^\s"'<>\\]+/ig,
    /https?:\/\/[^\s"'<>\\]*uat\.ooltool\.com\/[^\s"'<>\\]*/ig,
    /https?:\/\/[^\s"'<>\\]*(?:verify-email|email-verif|confirm-email|\/verify|reset-password|type=recovery|unlock)[^\s"'<>\\]*/ig
  ];

  const links: string[] = [];

  for (const pattern of patterns) {
    const matches = decoded.match(pattern) ?? [];
    links.push(...matches);
  }

  return [
    ...new Set(
      links.map((link) =>
        link
          .replace(/&amp;/g, '&')
          .replace(/[),.;>"'\]]+$/g, '')
      )
    )
  ];
}

function extractVerificationLink(rawEmail: string) {
  const unique = extractAppLinks(rawEmail);

  const preferred = unique.find((link) =>
    /verify|confirm|token/i.test(link)
  );

  return preferred ?? unique[0];
}

function extractPasswordResetLink(rawEmail: string) {
  return extractAppLinks(rawEmail).find((link) =>
    /reset-password|type=recovery/i.test(link) &&
    !/verify-email|confirm-email/i.test(link)
  );
}

function extractUnlockLink(rawEmail: string) {
  const decoded = decodeMime(rawEmail);

  if (
    !/unlock|temporarily locked|one-time link/i.test(
      decoded
    )
  ) {
    return undefined;
  }

  return extractAppLinks(rawEmail).find((link) =>
    /unlock|token|verify|confirm/i.test(link) &&
    !/reset-password|type=recovery/i.test(link)
  );
}

function quoteImap(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function collectUids(response: string) {
  const line = response.match(/^\* SEARCH[^\r\n]*/m)?.[0] ?? '';

  return [
    ...new Set(
      [...line.matchAll(/\b(\d+)\b/g)].map((match) => match[1])
    )
  ];
}

function newestUids(uids: string[], limit = 8) {
  return uids.slice(-limit).reverse();
}

async function readImapResponse(
  socket: tls.TLSSocket,
  state: { buffer: string },
  tag: string
) {
  const timeout = Date.now() + 45000;

  while (Date.now() < timeout) {
    if (new RegExp(`^${tag} (NO|BAD)`, 'm').test(state.buffer)) {
      const response = state.buffer;
      state.buffer = '';
      throw new Error(response.slice(-500).trim());
    }

    if (new RegExp(`^${tag} OK`, 'm').test(state.buffer)) {
      const response = state.buffer;
      state.buffer = '';
      return response;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error('Gmail IMAP timed out');
}

async function imapSession<T>(
  run: (
    send: (command: string) => Promise<string>
  ) => Promise<T>
) {
  const user = gmailUser();
  const password = gmailAppPassword();

  if (!user) {
    throw new Error('GMAIL_USER is not set');
  }

  if (!password) {
    throw new Error('GMAIL_APP_PASSWORD is not set');
  }

  const state = {
    buffer: ''
  };

  const socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
    const connection = tls.connect({
      host: 'imap.gmail.com',
      port: 993,
      servername: 'imap.gmail.com'
    });

    connection.setEncoding('utf8');

    connection.on('data', (chunk: string) => {
      state.buffer += chunk;
    });

    connection.once('error', reject);
    connection.once('secureConnect', () => resolve(connection));
  });

  socket.setTimeout(45000);

  try {
    const greetingTimeout = Date.now() + 15000;
    let greeted = false;

    while (Date.now() < greetingTimeout) {
      if (/\* OK/i.test(state.buffer)) {
        state.buffer = '';
        greeted = true;
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    if (!greeted) {
      throw new Error('Gmail IMAP greeting timed out');
    }

    let tagCount = 0;

    const send = async (command: string) => {
      tagCount += 1;
      const tag = `A${tagCount}`;
      socket.write(`${tag} ${command}\r\n`);
      return readImapResponse(socket, state, tag);
    };

    await send(`LOGIN ${quoteImap(user)} ${quoteImap(password)}`);

    try {
      return await run(send);
    } finally {
      await send('LOGOUT').catch(() => undefined);
    }
  } finally {
    socket.destroy();
  }
}

function searchCommands(email: string) {
  const uniqueLocal = email.split('@')[0]?.split('+')[1];

  const commands = [
    `UID SEARCH X-GM-RAW ${quoteImap(`newer_than:2d deliveredto:${email}`)}`,
    `UID SEARCH X-GM-RAW ${quoteImap(`newer_than:2d to:${email}`)}`,
    `UID SEARCH X-GM-RAW ${quoteImap(`newer_than:2d ${email}`)}`,
    `UID SEARCH HEADER Delivered-To ${quoteImap(email)}`,
    `UID SEARCH TO ${quoteImap(email)}`,
    `UID SEARCH TEXT ${quoteImap(email)}`
  ];

  if (uniqueLocal) {
    commands.push(
      `UID SEARCH X-GM-RAW ${quoteImap(`newer_than:2d ${uniqueLocal}`)}`,
      `UID SEARCH TEXT ${quoteImap(uniqueLocal)}`
    );
  }

  return commands;
}

async function searchMailbox(
  send: (command: string) => Promise<string>,
  mailbox: string,
  email: string
) {
  try {
    await send(`SELECT ${quoteImap(mailbox)}`);
  } catch {
    return [];
  }

  const uids: string[] = [];

  for (const command of searchCommands(email)) {
    try {
      const response = await send(command);
      uids.push(...collectUids(response));

      if (uids.length > 0) {
        return newestUids(uids);
      }
    } catch {
      // Try the next Gmail search syntax.
    }
  }

  return newestUids(uids);
}

function subscriptionNoticeFound(
  body: string
) {
  const text =
    `${body}\n${decodeQuotedPrintable(body)}`;

  if (
    /verify your email|confirm your email|email verification/i.test(
      text
    ) &&
    !/trial|subscription/i.test(
      text
    )
  ) {
    return false;
  }

  return /your trial|trial (has )?start|trial is (now )?active|subscription confirm|subscribed|subscription is active|welcome to ooltool/i.test(
    text
  );
}

async function fetchLink(
  send: (command: string) => Promise<string>,
  uid: string,
  kind: 'verification' | 'reset' | 'subscription' | 'unlock'
) {
  const body = await send(`UID FETCH ${uid} BODY.PEEK[]`);

  if (kind === 'subscription') {
    return subscriptionNoticeFound(body)
      ? 'subscription-notice'
      : '';
  }

  if (kind === 'reset') {
    return extractPasswordResetLink(body) ?? '';
  }

  if (kind === 'unlock') {
    return extractUnlockLink(body) ?? '';
  }

  return extractVerificationLink(body);
}

async function imapRequest(
  email: string,
  kind: 'verification' | 'reset' | 'subscription' | 'unlock' = 'verification'
) {
  return imapSession(async (send) => {
    for (const mailbox of MAILBOXES) {
      const uids = await searchMailbox(send, mailbox, email);

      for (const uid of uids) {
        const link = await fetchLink(send, uid, kind);

        if (link) {
          console.log(
            `Found ${kind} link in Gmail ${mailbox} UID ${uid}`
          );
          return link;
        }
      }
    }

    throw new Error(
      `No Gmail ${kind} message found for ${email}`
    );
  });
}

export async function waitForGmailSubscriptionNotice(
  email: string,
  timeoutMs = 90000
) {
  const startedAt = Date.now();
  let lastError: Error | undefined;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await imapRequest(email, 'subscription');
      console.log(
        `Subscription confirmation email found for ${email}`
      );
      return;
    } catch (error) {
      lastError = error instanceof Error
        ? error
        : new Error(String(error));

      const remainingMs = timeoutMs - (Date.now() - startedAt);

      if (remainingMs <= 0) {
        break;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(3000, remainingMs))
      );
    }
  }

  throw lastError ?? new Error(
    `No subscription confirmation email found for ${email}`
  );
}

export async function waitForGmailVerificationLink(
  email: string,
  timeoutMs = envTimeoutMs()
) {
  const startedAt = Date.now();
  let lastError: Error | undefined;
  let attempt = 0;

  while (Date.now() - startedAt < timeoutMs) {
    attempt += 1;

    try {
      return await imapRequest(email, 'verification');
    } catch (error) {
      lastError = error instanceof Error
        ? error
        : new Error(String(error));

      const remainingMs = timeoutMs - (Date.now() - startedAt);

      if (attempt === 1 || attempt % 3 === 0) {
        console.log(
          `Gmail IMAP attempt ${attempt} for ${email}: ${lastError.message.split('\n')[0]}`
        );
      }

      if (remainingMs <= 0) {
        break;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(2000, remainingMs))
      );
    }
  }

  throw lastError ?? new Error(
    `Timed out waiting for Gmail verification mail to ${email}`
  );
}

export async function waitForGmailPasswordResetLink(
  email: string,
  timeoutMs = envTimeoutMs()
) {
  const startedAt = Date.now();
  let lastError: Error | undefined;
  let attempt = 0;

  while (Date.now() - startedAt < timeoutMs) {
    attempt += 1;

    try {
      return await imapRequest(email, 'reset');
    } catch (error) {
      lastError = error instanceof Error
        ? error
        : new Error(String(error));

      const remainingMs = timeoutMs - (Date.now() - startedAt);

      if (attempt === 1 || attempt % 3 === 0) {
        console.log(
          `Gmail reset attempt ${attempt} for ${email}: ${lastError.message.split('\n')[0]}`
        );
      }

      if (remainingMs <= 0) {
        break;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(2000, remainingMs))
      );
    }
  }

  throw lastError ?? new Error(
    `Timed out waiting for the password reset mail to ${email}`
  );
}

/* =============================================================================
Generic Gmail message matcher (subscription lifecycle emails)
============================================================================= */

export type GmailMessage = {
  mailbox: string;
  uid: string;
  messageId: string;
  subject: string;
  text: string;
};

function headerValue(raw: string, name: string) {
  const headerEnd = raw.search(/\r?\n\r?\n/);
  const headers = headerEnd > 0
    ? raw.slice(0, headerEnd)
    : raw.slice(0, 6000);

  const match = headers.match(
    new RegExp(
      `^${name}:[ \\t]*([^\\r\\n]*(?:\\r?\\n[ \\t][^\\r\\n]*)*)`,
      'im'
    )
  );

  return (match?.[1] ?? '')
    .replace(/\r?\n[ \t]+/g, ' ')
    .trim();
}

function decodeMimeWords(value: string) {
  return value.replace(
    /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g,
    (_match, _charset: string, encoding: string, payload: string) => {
      if (encoding.toLowerCase() === 'b') {
        return decodeBase64(payload);
      }

      return decodeQuotedPrintable(
        payload.replace(/_/g, ' ')
      );
    }
  );
}

function plainText(raw: string) {
  return decodeMime(raw)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function listGmailMessages(
  email: string,
  perMailboxLimit = 12
): Promise<GmailMessage[]> {
  return imapSession(async (send) => {
    const found = new Map<string, GmailMessage>();

    for (const mailbox of MAILBOXES) {
      const uids = (
        await searchMailbox(send, mailbox, email)
      ).slice(0, perMailboxLimit);

      for (const uid of uids) {
        try {
          const raw = await send(
            `UID FETCH ${uid} BODY.PEEK[]`
          );

          const messageId =
            headerValue(raw, 'Message-ID') ||
            `${mailbox}:${uid}`;

          if (found.has(messageId)) {
            continue;
          }

          found.set(messageId, {
            mailbox,
            uid,
            messageId,
            subject: decodeMimeWords(
              headerValue(raw, 'Subject')
            ),
            text: plainText(raw)
          });
        } catch {
          // Skip unreadable messages.
        }
      }
    }

    return [...found.values()];
  });
}


export async function waitForGmailUnlockLink(
  email: string,
  timeoutMs = envTimeoutMs()
) {
  const startedAt = Date.now();
  let lastError: Error | undefined;
  let attempt = 0;

  while (Date.now() - startedAt < timeoutMs) {
    attempt += 1;

    try {
      return await imapRequest(email, 'unlock');
    } catch (error) {
      lastError = error instanceof Error
        ? error
        : new Error(String(error));

      const remainingMs = timeoutMs - (Date.now() - startedAt);

      if (attempt === 1 || attempt % 3 === 0) {
        console.log(
          `Gmail IMAP unlock attempt ${attempt} for ${email}: ${lastError.message.split('\n')[0]}`
        );
      }

      if (remainingMs <= 0) {
        break;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(2000, remainingMs))
      );
    }
  }

  throw lastError ?? new Error(
    `Timed out waiting for Gmail unlock mail to ${email}`
  );
}

export async function waitForGmailMessageMatching(
  email: string,
  options: {
    label: string;
    match: (message: GmailMessage) => boolean;
    ignoreMessageIds?: Set<string>;
    timeoutMs?: number;
  }
): Promise<GmailMessage> {
  const timeoutMs = options.timeoutMs ?? 90000;
  const startedAt = Date.now();
  let lastSubjects: string[] = [];
  let lastError = '';

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const messages = await listGmailMessages(email);

      lastSubjects = messages.map(
        (message) => message.subject
      );

      const hit = messages.find(
        (message) =>
          !options.ignoreMessageIds?.has(
            message.messageId
          ) &&
          options.match(message)
      );

      if (hit) {
        console.log(
          `Gmail "${options.label}" found for ${email}: ${hit.subject}`
        );

        return hit;
      }
    } catch (error) {
      lastError = error instanceof Error
        ? error.message.split('\n')[0]
        : String(error);
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 4000)
    );
  }

  throw new Error(
    `No Gmail message for "${options.label}" arrived for ${email} within ${Math.round(timeoutMs / 1000)}s. Subjects seen: ${
      lastSubjects.length
        ? JSON.stringify(lastSubjects)
        : 'none'
    }${lastError ? `. Last IMAP error: ${lastError}` : ''}`
  );
}

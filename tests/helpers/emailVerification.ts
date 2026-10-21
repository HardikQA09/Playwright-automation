import {
  Page,
  test
} from '@playwright/test';

import {
  AUTH_SETTINGS,
  BASE_URL
} from '../config/testData';

import { URLS }
  from '../config/constants';

import '../config/loadLocalEnv';

import {
  isGmailAutomationEnabled,
  waitForGmailVerificationLink
} from './gmailImap';

/* =============================================================================
HELPER: waitForManualEmailVerification

PURPOSE
-------
After registration, wait for the Gmail verification link to succeed.
Never click Resend / Send verification link.

Uses Gmail IMAP when GMAIL_APP_PASSWORD is set in .env or the terminal.
Falls back to a headed pause only when automatic verification cannot finish.
============================================================================= */

export function isEmailVerificationPage(
  page: Page
) {
  return /verify-email/i.test(
    page.url()
  );
}

function emailVerificationPauseEnabled() {
  return [
    '1',
    'true',
    'yes',
    'on'
  ].includes(
    String(
      process.env.EMAIL_VERIFICATION_PAUSE ??
        ''
    ).toLowerCase()
  );
}

export function isEmailVerificationReady() {
  if (
    !AUTH_SETTINGS.emailVerificationRequired
  ) {
    return true;
  }

  return isGmailAutomationEnabled() ||
    emailVerificationPauseEnabled();
}

export function skipUnlessEmailVerificationReady() {
  if (
    isEmailVerificationReady()
  ) {
    return;
  }

  test.skip(
    true,
    'Set GMAIL_APP_PASSWORD for automatic email verification, or EMAIL_VERIFICATION_PAUSE=true for a headed pause.'
  );
}

export async function openFreshLoginPage(
  page: Page
) {
  const emailField =
    page.getByRole(
      'textbox',
      {
        name: /^email$/i
      }
    ).or(
      page.locator(
        'input[type="email"], input[name="email"]'
      )
    ).first();

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (attempt > 1) {
      // Stored subscriber sessions redirect /login → /dashboard.
      // Clear them so a different BILLING_MANAGEMENT / profile user can sign in.
      await page.context().clearCookies();
    }

    await page.goto(
      `${BASE_URL}${URLS.LOGIN}`,
      {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      }
    ).catch(
      () => undefined
    );

    const ready =
      await emailField.waitFor({
        state: 'visible',
        timeout: 15000
      }).then(
        () => true
      ).catch(
        () => false
      );

    if (ready) {
      return;
    }
  }

  await emailField.waitFor({
    state: 'visible',
    timeout: 30000
  });
}

export async function waitForManualEmailVerification(
  page: Page,
  email: string
) {
  if (
    !AUTH_SETTINGS.emailVerificationRequired
  ) {
    if (
      isEmailVerificationPage(
        page
      )
    ) {
      await openFreshLoginPage(
        page
      );
    }

    return;
  }

  console.log(
    `Email verification for ${email}. Gmail IMAP: ${
      isGmailAutomationEnabled()
        ? 'enabled'
        : 'disabled'
    }`
  );

  skipUnlessEmailVerificationReady();

  if (
    isGmailAutomationEnabled()
  ) {
    console.log(
      `Reading verification email from Gmail for ${email}`
    );

    try {
      const verificationLink =
        await waitForGmailVerificationLink(
          email
        );

      console.log(
        'Opened verification link from Gmail inbox'
      );

      let lastNavigationError: unknown;

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await page.goto(
            verificationLink,
            {
              waitUntil: 'domcontentloaded',
              timeout: 45000
            }
          );

          lastNavigationError =
            undefined;

          break;
        } catch (navigationError) {
          lastNavigationError =
            navigationError;

          console.log(
            `Verification link attempt ${attempt} did not load.`
          );
        }
      }

      if (lastNavigationError) {
        throw lastNavigationError;
      }

      await openFreshLoginPage(
        page
      );

      return;
    } catch (
      error
    ) {
      const message =
        error instanceof Error
          ? error.message
          : String(
            error
          );

      console.log(
        'Gmail inbox automation failed.'
      );
      console.log(
        message
      );

      if (process.env.CI || !emailVerificationPauseEnabled()) {
        throw new Error(
          `Automatic Gmail verification failed for ${email}. ${message}`
        );
      }

      console.log(
        'Falling back to manual pause.'
      );
    }
  } else {
    console.log(
      'GMAIL_APP_PASSWORD is not set, so automatic Gmail verification is skipped.'
    );
    console.log(
      'Copy .env.example to .env and paste the Gmail App Password, or set $env:GMAIL_APP_PASSWORD in this VS Code terminal.'
    );
  }

  console.log(
    '\nMANUAL EMAIL VERIFICATION REQUIRED'
  );
  console.log(
    `Verify email sent to: ${email}`
  );
  console.log(
    'Open Gmail and click the verification link until it succeeds.'
  );
  console.log(
    'Do NOT click Send verification link or Resend in this browser.'
  );
  console.log(
    'After Gmail shows success, resume Playwright. Login will open /login next.'
  );

  await page.pause();

  await openFreshLoginPage(
    page
  );
}

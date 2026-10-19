# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: UpgradeSubscriptionMatrix.spec.ts >> Upgrade Subscription Use Case 3 Matrix >> SC-76 - Current lower-tier paid subscription is displayed before upgrade
- Location: tests\UpgradeSubscriptionMatrix.spec.ts:361:13

# Error details

```
TimeoutError: locator.waitFor: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('textbox', { name: /^email$/i }).or(locator('input[type="email"], input[name="email"]')).first() to be visible

```

# Test source

```ts
  1   | import {
  2   |   Page
  3   | } from '@playwright/test';
  4   | 
  5   | import {
  6   |   AUTH_SETTINGS,
  7   |   BASE_URL
  8   | } from '../config/testData';
  9   | 
  10  | import { URLS }
  11  |   from '../config/constants';
  12  | 
  13  | import '../config/loadLocalEnv';
  14  | 
  15  | import {
  16  |   isGmailAutomationEnabled,
  17  |   waitForGmailVerificationLink
  18  | } from './gmailImap';
  19  | 
  20  | /* =============================================================================
  21  | HELPER: waitForManualEmailVerification
  22  | 
  23  | PURPOSE
  24  | -------
  25  | After registration, wait for the Gmail verification link to succeed.
  26  | Never click Resend / Send verification link.
  27  | 
  28  | Uses Gmail IMAP when GMAIL_APP_PASSWORD is set in .env or the terminal.
  29  | Falls back to a headed pause only when automatic verification cannot finish.
  30  | ============================================================================= */
  31  | 
  32  | export function isEmailVerificationPage(
  33  |   page: Page
  34  | ) {
  35  |   return /verify-email/i.test(
  36  |     page.url()
  37  |   );
  38  | }
  39  | 
  40  | export async function openFreshLoginPage(
  41  |   page: Page
  42  | ) {
  43  |   const emailField =
  44  |     page.getByRole(
  45  |       'textbox',
  46  |       {
  47  |         name: /^email$/i
  48  |       }
  49  |     ).or(
  50  |       page.locator(
  51  |         'input[type="email"], input[name="email"]'
  52  |       )
  53  |     ).first();
  54  | 
  55  |   for (let attempt = 1; attempt <= 2; attempt += 1) {
  56  |     await page.goto(
  57  |       `${BASE_URL}${URLS.LOGIN}`,
  58  |       {
  59  |         waitUntil: 'domcontentloaded',
  60  |         timeout: 60000
  61  |       }
  62  |     ).catch(
  63  |       () => undefined
  64  |     );
  65  | 
  66  |     const ready =
  67  |       await emailField.waitFor({
  68  |         state: 'visible',
  69  |         timeout: 30000
  70  |       }).then(
  71  |         () => true
  72  |       ).catch(
  73  |         () => false
  74  |       );
  75  | 
  76  |     if (ready) {
  77  |       return;
  78  |     }
  79  |   }
  80  | 
> 81  |   await emailField.waitFor({
      |                    ^ TimeoutError: locator.waitFor: Timeout 30000ms exceeded.
  82  |     state: 'visible',
  83  |     timeout: 30000
  84  |   });
  85  | }
  86  | 
  87  | export async function waitForManualEmailVerification(
  88  |   page: Page,
  89  |   email: string
  90  | ) {
  91  |   if (
  92  |     !AUTH_SETTINGS.emailVerificationRequired
  93  |   ) {
  94  |     if (
  95  |       isEmailVerificationPage(
  96  |         page
  97  |       )
  98  |     ) {
  99  |       await openFreshLoginPage(
  100 |         page
  101 |       );
  102 |     }
  103 | 
  104 |     return;
  105 |   }
  106 | 
  107 |   console.log(
  108 |     `Email verification for ${email}. Gmail IMAP: ${
  109 |       isGmailAutomationEnabled()
  110 |         ? 'enabled'
  111 |         : 'disabled'
  112 |     }`
  113 |   );
  114 | 
  115 |   if (
  116 |     isGmailAutomationEnabled()
  117 |   ) {
  118 |     console.log(
  119 |       `Reading verification email from Gmail for ${email}`
  120 |     );
  121 | 
  122 |     try {
  123 |       const verificationLink =
  124 |         await waitForGmailVerificationLink(
  125 |           email
  126 |         );
  127 | 
  128 |       console.log(
  129 |         'Opened verification link from Gmail inbox'
  130 |       );
  131 | 
  132 |       let lastNavigationError: unknown;
  133 | 
  134 |       for (let attempt = 1; attempt <= 3; attempt += 1) {
  135 |         try {
  136 |           await page.goto(
  137 |             verificationLink,
  138 |             {
  139 |               waitUntil: 'domcontentloaded',
  140 |               timeout: 45000
  141 |             }
  142 |           );
  143 | 
  144 |           lastNavigationError =
  145 |             undefined;
  146 | 
  147 |           break;
  148 |         } catch (navigationError) {
  149 |           lastNavigationError =
  150 |             navigationError;
  151 | 
  152 |           console.log(
  153 |             `Verification link attempt ${attempt} did not load.`
  154 |           );
  155 |         }
  156 |       }
  157 | 
  158 |       if (lastNavigationError) {
  159 |         throw lastNavigationError;
  160 |       }
  161 | 
  162 |       await openFreshLoginPage(
  163 |         page
  164 |       );
  165 | 
  166 |       return;
  167 |     } catch (
  168 |       error
  169 |     ) {
  170 |       const message =
  171 |         error instanceof Error
  172 |           ? error.message
  173 |           : String(
  174 |             error
  175 |           );
  176 | 
  177 |       console.log(
  178 |         'Gmail inbox automation failed.'
  179 |       );
  180 |       console.log(
  181 |         message
```
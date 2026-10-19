# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: AuthUiValidation.spec.ts >> Auth UI Validation >> Auth pages remain usable with browser back and forward
- Location: tests\AuthUiValidation.spec.ts:719:9

# Error details

```
Error: expect(received).toBeTruthy()

Received: false

Call Log:
- Timeout 60000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - link "OolTool" [ref=e6] [cursor=pointer]:
          - /url: /
          - img "OolTool" [ref=e7]
        - heading "Welcome Back" [level=1] [ref=e8]
        - paragraph [ref=e9]: Sign in to your OolTool account
      - generic [ref=e10]:
        - button "Continue with Google" [ref=e11] [cursor=pointer]:
          - img
          - text: Continue with Google
        - button "Continue with Apple" [ref=e12] [cursor=pointer]:
          - img
          - text: Continue with Apple
        - generic [ref=e17]: Or continue with email
        - generic [ref=e18]:
          - generic [ref=e19]:
            - text: Email
            - textbox "Email" [ref=e20]
          - generic [ref=e21]:
            - generic [ref=e22]:
              - generic [ref=e23]: Password
              - link "Forgot password?" [ref=e24] [cursor=pointer]:
                - /url: /forgot-password
            - generic [ref=e25]:
              - textbox "Password" [ref=e26]
              - button "Show password" [ref=e27]:
                - img [ref=e28]
          - button "Sign In" [ref=e31] [cursor=pointer]
        - paragraph [ref=e32]:
          - text: Don't have an account?
          - link "Sign up" [active] [ref=e33] [cursor=pointer]:
            - /url: /register
    - button "Switch to dark theme" [ref=e35] [cursor=pointer]:
      - img
  - region "Cookie consent" [ref=e36]:
    - generic [ref=e37]:
      - paragraph [ref=e38]:
        - text: We use cookies for login, preferences, and to improve OolTool. Read the
        - link "Privacy Policy" [ref=e39] [cursor=pointer]:
          - /url: /privacy-policy
        - text: .
      - generic [ref=e40]:
        - button "Essential only" [ref=e41] [cursor=pointer]
        - button "Accept" [ref=e42] [cursor=pointer]
  - region "Notifications alt+T"
  - alert [ref=e43]
```

# Test source

```ts
  1   | import {
  2   |   expect,
  3   |   Locator,
  4   |   Page,
  5   |   test
  6   | } from '@playwright/test';
  7   | 
  8   | import {
  9   |   BASE_URL
  10  | } from './config/testData';
  11  | 
  12  | import { ForgotPasswordPage }
  13  |   from './pages/ForgotPasswordPage';
  14  | 
  15  | import { RegistrationPage }
  16  |   from './pages/RegistrationPage';
  17  | 
  18  | import {
  19  |   dismissOverlays
  20  | } from './helpers/dismissOverlays';
  21  | 
  22  | import { safeClick }
  23  |   from './helpers/safeClick';
  24  | 
  25  | /* =============================================================================
  26  | TEST SUITE: Auth UI Validation
  27  | 
  28  | PURPOSE
  29  | -------
  30  | Validates public authentication-screen navigation and non-mutating UI controls.
  31  | 
  32  | RUN
  33  | ---
  34  | npx playwright test tests/AuthUiValidation.spec.ts --headed
  35  | ============================================================================= */
  36  | 
  37  | function authRegistrationLink(
  38  |   page: Page
  39  | ) {
  40  |   return page.getByRole(
  41  |     'link',
  42  |     {
  43  |       name: /^sign up$/i
  44  |     }
  45  |   ).or(
  46  |     page.getByRole(
  47  |       'link',
  48  |       {
  49  |         name: /sign up|create account|start\s+30[-\s]?day\s+free\s+trial/i
  50  |       }
  51  |     )
  52  |   ).or(
  53  |     page.getByRole(
  54  |       'button',
  55  |       {
  56  |         name: /sign up|create account|start\s+30[-\s]?day\s+free\s+trial/i
  57  |       }
  58  |     )
  59  |   ).first();
  60  | }
  61  | 
  62  | async function expectRegistrationOpened(
  63  |   page: Page
  64  | ) {
> 65  |   await expect
      |   ^ Error: expect(received).toBeTruthy()
  66  |     .poll(
  67  |       async () => {
  68  |         if (
  69  |           /\/register|\/signup|\/sign-up|\/create/i.test(
  70  |             page.url()
  71  |           )
  72  |         ) {
  73  |           return true;
  74  |         }
  75  | 
  76  |         const firstName =
  77  |           page.locator(
  78  |             'input[name="firstName"]'
  79  |           ).or(
  80  |             page.getByLabel(
  81  |               /first name/i
  82  |             )
  83  |           ).first();
  84  | 
  85  |         return firstName.isVisible().catch(
  86  |           () => false
  87  |         );
  88  |       },
  89  |       {
  90  |         timeout: 60000
  91  |       }
  92  |     )
  93  |     .toBeTruthy();
  94  | }
  95  | 
  96  | async function findPasswordToggle(
  97  |   page: Page,
  98  |   passwordInput: Locator
  99  | ) {
  100 |   const siblingToggle =
  101 |     passwordInput.locator(
  102 |       'xpath=following-sibling::button'
  103 |     ).first();
  104 | 
  105 |   if (
  106 |     await siblingToggle.isVisible().catch(
  107 |       () => false
  108 |     )
  109 |   ) {
  110 |     return siblingToggle;
  111 |   }
  112 | 
  113 |   const fieldToggle =
  114 |     passwordInput
  115 |       .locator(
  116 |         'xpath=ancestor::div[contains(@class,"relative")][1]'
  117 |       )
  118 |       .getByRole(
  119 |         'button',
  120 |         {
  121 |           name: /^(show|hide)(\s+password)?$/i
  122 |         }
  123 |       )
  124 |       .first();
  125 | 
  126 |   if (
  127 |     await fieldToggle.isVisible().catch(
  128 |       () => false
  129 |     )
  130 |   ) {
  131 |     return fieldToggle;
  132 |   }
  133 | 
  134 |   return page.getByRole(
  135 |     'button',
  136 |     {
  137 |       name: /^(show|hide)(\s+password)?$/i
  138 |     }
  139 |   ).first();
  140 | }
  141 | 
  142 | async function readPasswordToggleState(
  143 |   passwordInput: Locator
  144 | ) {
  145 |   return passwordInput.evaluate(
  146 |     (input) => {
  147 |       const field =
  148 |         input as HTMLInputElement;
  149 | 
  150 |       const toggle =
  151 |         input.parentElement?.querySelector(
  152 |           'button'
  153 |         );
  154 | 
  155 |       return {
  156 |         type:
  157 |           field.type,
  158 |         aria:
  159 |           toggle?.getAttribute(
  160 |             'aria-label'
  161 |           ) ??
  162 |           toggle?.textContent?.trim() ??
  163 |           '',
  164 |         icon:
  165 |           toggle?.querySelector(
```
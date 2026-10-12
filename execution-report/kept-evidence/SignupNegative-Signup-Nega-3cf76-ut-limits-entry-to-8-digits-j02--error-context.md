# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: SignupNegative.spec.ts >> Signup Negative Scenarios >> Signup OTP input limits entry to 8 digits
- Location: tests\SignupNegative.spec.ts:552:11

# Error details

```
Error: expect(locator).toBeEnabled() failed

Locator: getByRole('button', { name: /send code via sms/i }).first()
Expected: enabled
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeEnabled" with timeout 15000ms
  - waiting for getByRole('button', { name: /send code via sms/i }).first()
    3 × locator resolved to <button disabled type="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:text-accent-foreground px-4 py-2 w-full h-10">…</button>
      - unexpected value "disabled"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - link "OolTool" [ref=e6] [cursor=pointer]:
          - /url: /
          - img "OolTool" [ref=e7]
        - heading "Create Account" [level=1] [ref=e8]
        - paragraph [ref=e9]: Start your OolTool journey
      - generic [ref=e10]:
        - button "Continue with Google" [ref=e11] [cursor=pointer]:
          - img
          - text: Continue with Google
        - button "Continue with Apple" [ref=e12] [cursor=pointer]:
          - img
          - text: Continue with Apple
        - generic [ref=e17]: Or sign up with email & mobile
        - generic [ref=e18]:
          - generic [ref=e19]:
            - generic [ref=e20]:
              - generic [ref=e21]: First name
              - textbox "First name" [ref=e22]: Hardik
            - generic [ref=e23]:
              - generic [ref=e24]: Last name
              - textbox "Last name" [ref=e25]: Thanki
          - generic [ref=e26]:
            - generic [ref=e27]: Email
            - textbox "Email" [ref=e28]: imhardikthanki+otp-length-1791465763254@gmail.com
          - generic [ref=e29]:
            - generic [ref=e30]:
              - generic [ref=e31]: Mobile number
              - generic [ref=e32]:
                - img
                - text: Not verified
            - generic [ref=e33]:
              - generic [ref=e34]: "+1"
              - textbox "2015550123" [ref=e35]: "2015558706"
            - paragraph [ref=e36]: US mobile numbers only. We’ll text you a one-time code.
            - generic [ref=e37]:
              - textbox "Enter OTP" [ref=e38]
              - generic [ref=e39]:
                - button "Verify" [disabled]
                - button "46s" [disabled]
          - generic [ref=e40]:
            - generic [ref=e41]: Password
            - generic [ref=e42]:
              - textbox [ref=e43]: Test@123456
              - button "Show" [ref=e44]:
                - img [ref=e45]
          - generic [ref=e48]:
            - generic [ref=e49]: Confirm password
            - generic [ref=e50]:
              - textbox [ref=e51]: Test@123456
              - button "Show" [ref=e52]:
                - img [ref=e53]
          - button "Create Account" [disabled]
        - paragraph [ref=e56]:
          - text: Already have an account?
          - link "Sign in" [ref=e57] [cursor=pointer]:
            - /url: /login
    - button "Switch to dark theme" [ref=e59] [cursor=pointer]:
      - img
  - region "Cookie consent" [ref=e60]:
    - generic [ref=e61]:
      - paragraph [ref=e62]:
        - text: We use cookies for login, preferences, and to improve OolTool. Read the
        - link "Privacy Policy" [ref=e63] [cursor=pointer]:
          - /url: /privacy-policy
        - text: .
      - generic [ref=e64]:
        - button "Essential only" [ref=e65] [cursor=pointer]
        - button "Accept" [ref=e66] [cursor=pointer]
  - region "Notifications alt+T"
  - alert [ref=e67]
```

# Test source

```ts
  20  |     name: 'missing domain',
  21  |     value: 'missing-domain@'
  22  |   },
  23  |   {
  24  |     name: 'missing @',
  25  |     value: 'missing-at.example.com'
  26  |   },
  27  |   {
  28  |     name: 'SQL injection',
  29  |     value: "' OR 1=1 --"
  30  |   },
  31  |   {
  32  |     name: 'XSS injection',
  33  |     value: '<script>alert(1)</script>'
  34  |   }
  35  | ];
  36  | 
  37  | const duplicateEmailValidationEnabled =
  38  |   process.env.SIGNUP_DUPLICATE_EMAIL_VALIDATION_ENABLED ===
  39  |   'true';
  40  | 
  41  | const otpLengthValidationEnabled =
  42  |   process.env.SIGNUP_OTP_LENGTH_VALIDATION_ENABLED ===
  43  |   'true';
  44  | 
  45  | // The SMS OTP field is capped at 8 digits (input maxlength="8").
  46  | const OTP_LENGTH = 8;
  47  | 
  48  | const otpResendValidationEnabled =
  49  |   process.env.SIGNUP_OTP_RESEND_VALIDATION_ENABLED ===
  50  |   'true';
  51  | 
  52  | const duplicateSignupEmail =
  53  |   process.env.SIGNUP_DUPLICATE_EMAIL ??
  54  |   TEST_USERS.subscriber.email;
  55  | 
  56  | const duplicateSignupMobile =
  57  |   process.env.SIGNUP_DUPLICATE_MOBILE ??
  58  |   TEST_USERS.onboarding.mobile;
  59  | 
  60  | async function fillRequiredSignupFields(
  61  |   registration: RegistrationPage,
  62  |   email: string,
  63  |   mobile: string
  64  | ) {
  65  |   await registration.firstNameInput.fill(
  66  |     TEST_USERS.onboarding.firstName
  67  |   );
  68  | 
  69  |   await registration.lastNameInput.fill(
  70  |     TEST_USERS.onboarding.lastName
  71  |   );
  72  | 
  73  |   await registration.emailInput.fill(
  74  |     email
  75  |   );
  76  | 
  77  |   await registration.mobileInput.fill(
  78  |     mobile
  79  |   );
  80  | 
  81  |   await registration.passwordInput.fill(
  82  |     TEST_USERS.onboarding.password
  83  |   );
  84  | 
  85  |   await registration.confirmPasswordInput.fill(
  86  |     TEST_USERS.onboarding.password
  87  |   );
  88  | }
  89  | 
  90  | async function requestSignupOtpIfAvailable(
  91  |   registration: RegistrationPage
  92  | ) {
  93  |   if (
  94  |     !AUTH_SETTINGS.registrationMobileOtpEnabled
  95  |   ) {
  96  |     return false;
  97  |   }
  98  | 
  99  |   for (
  100 |     let attempt = 1;
  101 |     attempt <= 3;
  102 |     attempt++
  103 |   ) {
  104 |     const existingOtpVisible =
  105 |       await registration.otpInput
  106 |         .first()
  107 |         .isVisible({
  108 |           timeout: 1000
  109 |         })
  110 |         .catch(
  111 |           () => false
  112 |         );
  113 | 
  114 |     if (existingOtpVisible) {
  115 |       return true;
  116 |     }
  117 | 
  118 |     await expect(
  119 |       registration.sendCodeButton
> 120 |     ).toBeEnabled({
      |       ^ Error: expect(locator).toBeEnabled() failed
  121 |       timeout: 15000
  122 |     });
  123 | 
  124 |     await registration.sendCodeButton.click();
  125 | 
  126 |     const otpVisible =
  127 |       await registration.otpInput
  128 |         .first()
  129 |         .isVisible({
  130 |           timeout: 20000
  131 |         })
  132 |         .catch(
  133 |           () => false
  134 |         );
  135 | 
  136 |     if (otpVisible) {
  137 |       return true;
  138 |     }
  139 | 
  140 |     await registration.page.waitForTimeout(
  141 |       1000
  142 |     );
  143 |   }
  144 | 
  145 |   return false;
  146 | }
  147 | 
  148 | async function openSignupOtpInput(
  149 |   registration: RegistrationPage,
  150 |   scenario: string
  151 | ) {
  152 |   await registration.open();
  153 | 
  154 |   await fillRequiredSignupFields(
  155 |     registration,
  156 |     `imhardikthanki+${scenario}-${Date.now()}@gmail.com`,
  157 |     generateMobileNumber()
  158 |   );
  159 | 
  160 |   const otpVisible =
  161 |     await requestSignupOtpIfAvailable(
  162 |       registration
  163 |     );
  164 | 
  165 |   test.skip(
  166 |     !otpVisible,
  167 |     'Skipped because signup OTP input did not appear after requesting SMS code.'
  168 |   );
  169 | }
  170 | 
  171 | /* =============================================================================
  172 | TEST SUITE: Signup Negative Scenarios
  173 | 
  174 | PURPOSE
  175 | -------
  176 | Validate registration form guardrails without sending real OTP/email requests.
  177 | 
  178 | Run:
  179 | npx playwright test tests/SignupNegative.spec.ts --headed
  180 | ============================================================================= */
  181 | 
  182 | test.describe(
  183 |   'Signup Negative Scenarios',
  184 |   () => {
  185 |     test.describe.configure({
  186 |       timeout: 120000
  187 |     });
  188 | 
  189 |     test(
  190 |       'Signup form blocks empty required fields',
  191 |       async ({ page }) => {
  192 | 
  193 |         const registration =
  194 |           new RegistrationPage(page);
  195 | 
  196 |         await registration.open();
  197 | 
  198 |         await expect(
  199 |           page
  200 |         ).not.toHaveURL(
  201 |           /\/dashboard/
  202 |         );
  203 | 
  204 |         await expect(
  205 |           registration.submitButton
  206 |         ).toBeDisabled();
  207 | 
  208 |         await expect(
  209 |           registration.firstNameInput
  210 |         ).toBeVisible();
  211 | 
  212 |         await expect(
  213 |           registration.lastNameInput
  214 |         ).toBeVisible();
  215 | 
  216 |         await expect(
  217 |           registration.emailInput
  218 |         ).toBeVisible();
  219 | 
  220 |         await expect(
```
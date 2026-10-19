# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: SignupNegative.spec.ts >> Signup Negative Scenarios >> Signup blocks already registered email address
- Location: tests\SignupNegative.spec.ts:745:11

# Error details

```
Error: expect(locator).toBeEnabled() failed

Locator:  getByRole('button', { name: 'Create Account', exact: true }).or(getByRole('button', { name: /create account|start\s+(30[-\s]?day\s+)?free\s+trial|start trial/i })).or(locator('button[type="submit"]').filter({ hasText: /create account|start\s+(30[-\s]?day\s+)?free\s+trial|start trial/i })).first()
Expected: enabled
Received: disabled
Timeout:  15000ms

Call log:
  - Expect "toBeEnabled" with timeout 15000ms
  - waiting for getByRole('button', { name: 'Create Account', exact: true }).or(getByRole('button', { name: /create account|start\s+(30[-\s]?day\s+)?free\s+trial|start trial/i })).or(locator('button[type="submit"]').filter({ hasText: /create account|start\s+(30[-\s]?day\s+)?free\s+trial|start trial/i })).first()
    18 × locator resolved to <button disabled type="submit" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 w-full h-11">Create Account</button>
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
            - textbox "Email" [ref=e28]: imhardikthanki+plantest@gmail.com
            - paragraph [ref=e29]: This email is already registered. Please sign in instead.
          - generic [ref=e30]:
            - generic [ref=e31]:
              - generic [ref=e32]: Mobile number
              - generic [ref=e33]:
                - img
                - text: Not verified
            - generic [ref=e34]:
              - generic [ref=e35]: "+1"
              - textbox "2015550123" [ref=e36]: "2015559750"
            - paragraph [ref=e37]: US mobile numbers only. We’ll text you a one-time code.
            - generic [ref=e38]:
              - textbox "Enter OTP" [ref=e39]: "111111"
              - generic [ref=e40]:
                - button "Verify" [ref=e41] [cursor=pointer]
                - button "45s" [disabled]
          - generic [ref=e42]:
            - generic [ref=e43]: Password
            - generic [ref=e44]:
              - textbox [ref=e45]: Test@123456
              - button "Show" [ref=e46]:
                - img [ref=e47]
          - generic [ref=e50]:
            - generic [ref=e51]: Confirm password
            - generic [ref=e52]:
              - textbox [ref=e53]: Test@123456
              - button "Show" [ref=e54]:
                - img [ref=e55]
          - button "Create Account" [disabled]
        - paragraph [ref=e58]:
          - text: Already have an account?
          - link "Sign in" [ref=e59] [cursor=pointer]:
            - /url: /login
    - button "Switch to dark theme" [ref=e61] [cursor=pointer]:
      - img
  - region "Cookie consent" [ref=e62]:
    - generic [ref=e63]:
      - paragraph [ref=e64]:
        - text: We use cookies for login, preferences, and to improve OolTool. Read the
        - link "Privacy Policy" [ref=e65] [cursor=pointer]:
          - /url: /privacy-policy
        - text: .
      - generic [ref=e66]:
        - button "Essential only" [ref=e67] [cursor=pointer]
        - button "Accept" [ref=e68] [cursor=pointer]
  - region "Notifications alt+T"
  - alert [ref=e69]
```

# Test source

```ts
  678 |           '123'
  679 |         );
  680 | 
  681 |         const verifyDisabled =
  682 |           await registration.verifyOtpButton
  683 |             .isDisabled()
  684 |             .catch(
  685 |               () => false
  686 |             );
  687 | 
  688 |         if (!verifyDisabled) {
  689 |           await registration.verifyOtpButton.click();
  690 | 
  691 |           await expect(
  692 |             otp,
  693 |             'A short OTP must not complete signup.'
  694 |           ).toBeVisible({
  695 |             timeout: 5000
  696 |           });
  697 | 
  698 |           await expect(
  699 |             page
  700 |           ).not.toHaveURL(
  701 |             /\/(onboarding|plans?|dashboard)/,
  702 |             {
  703 |               timeout: 3000
  704 |             }
  705 |           );
  706 |         }
  707 |         }
  708 |       );
  709 |     }
  710 | 
  711 |     if (otpResendValidationEnabled) {
  712 |       test(
  713 |         'Signup OTP resend or cooldown state is visible after code request',
  714 |         async ({ page }) => {
  715 | 
  716 |         const registration =
  717 |           new RegistrationPage(page);
  718 | 
  719 |         await openSignupOtpInput(
  720 |           registration,
  721 |           'otp-resend-state'
  722 |         );
  723 | 
  724 |         const resendOrCooldown =
  725 |           page
  726 |             .locator(
  727 |               'button, [role="button"], p, span, div'
  728 |             )
  729 |             .filter({
  730 |               hasText:
  731 |                 /resend|send code|send again|code sent|wait|seconds|\d+s|too many|rate|try again/i
  732 |             })
  733 |             .first();
  734 | 
  735 |         await expect(
  736 |           resendOrCooldown
  737 |         ).toBeVisible({
  738 |           timeout: 10000
  739 |         });
  740 |         }
  741 |       );
  742 |     }
  743 | 
  744 |     if (duplicateEmailValidationEnabled) {
  745 |       test(
  746 |         'Signup blocks already registered email address',
  747 |         async ({ page }) => {
  748 | 
  749 |         const registration =
  750 |           new RegistrationPage(page);
  751 | 
  752 |         await registration.open();
  753 | 
  754 |         await fillRequiredSignupFields(
  755 |           registration,
  756 |           duplicateSignupEmail,
  757 |           generateMobileNumber()
  758 |         );
  759 | 
  760 |         const otpVisible =
  761 |           await requestSignupOtpIfAvailable(
  762 |             registration
  763 |           );
  764 | 
  765 |         test.skip(
  766 |           !otpVisible,
  767 |           'Skipped because signup OTP input did not appear after requesting SMS code.'
  768 |         );
  769 | 
  770 |         await registration.otpInput.first().fill(
  771 |           AUTH_SETTINGS.otpCode
  772 |         );
  773 | 
  774 |         await registration.verifyOtpButton.click();
  775 | 
  776 |         await expect(
  777 |           registration.submitButton
> 778 |         ).toBeEnabled({
      |           ^ Error: expect(locator).toBeEnabled() failed
  779 |           timeout: 15000
  780 |         });
  781 | 
  782 |         await registration.submitButton.click();
  783 | 
  784 |         await expect(
  785 |           page.getByText(
  786 |             /email.*already|already.*email|already registered|account already exists|email.*exists/i
  787 |           ).first()
  788 |         ).toBeVisible({
  789 |           timeout: 15000
  790 |         });
  791 | 
  792 |         await expect(
  793 |           page
  794 |         ).not.toHaveURL(
  795 |           /\/dashboard/
  796 |         );
  797 |         }
  798 |       );
  799 |     }
  800 | 
  801 |     test(
  802 |       'Signup password visibility toggles work for both password fields',
  803 |       async ({ page }) => {
  804 | 
  805 |         const registration =
  806 |           new RegistrationPage(page);
  807 | 
  808 |         await registration.open();
  809 | 
  810 |         const showButtons =
  811 |           page.getByRole(
  812 |             'button',
  813 |             {
  814 |               name: /show/i
  815 |             }
  816 |           );
  817 | 
  818 |         await expect(
  819 |           registration.passwordInput
  820 |         ).toHaveAttribute(
  821 |           'type',
  822 |           'password'
  823 |         );
  824 | 
  825 |         await showButtons.nth(0).click();
  826 | 
  827 |         await expect(
  828 |           registration.passwordInput
  829 |         ).toHaveAttribute(
  830 |           'type',
  831 |           'text'
  832 |         );
  833 | 
  834 |         await expect(
  835 |           registration.confirmPasswordInput
  836 |         ).toHaveAttribute(
  837 |           'type',
  838 |           'password'
  839 |         );
  840 | 
  841 |         await showButtons.first().click();
  842 | 
  843 |         await expect(
  844 |           registration.confirmPasswordInput
  845 |         ).toHaveAttribute(
  846 |           'type',
  847 |           'text'
  848 |         );
  849 |       }
  850 |     );
  851 | 
  852 |     test(
  853 |       'Signup submit stays disabled before mobile OTP verification',
  854 |       async ({ page }) => {
  855 | 
  856 |         const registration =
  857 |           new RegistrationPage(page);
  858 | 
  859 |         await registration.open();
  860 | 
  861 |         await registration.firstNameInput.fill(
  862 |           'Test'
  863 |         );
  864 | 
  865 |         await registration.lastNameInput.fill(
  866 |           'User'
  867 |         );
  868 | 
  869 |         await registration.emailInput.fill(
  870 |           'test.user@example.com'
  871 |         );
  872 | 
  873 |         await registration.mobileInput.fill(
  874 |           '2015550199'
  875 |         );
  876 | 
  877 |         await registration.passwordInput.fill(
  878 |           'Test@123456'
```
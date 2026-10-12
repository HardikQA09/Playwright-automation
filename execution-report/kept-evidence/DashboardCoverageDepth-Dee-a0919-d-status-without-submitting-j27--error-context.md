# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: DashboardCoverageDepth.spec.ts >> Deeper dashboard controls >> Support changes ticket fields and status without submitting
- Location: tests\DashboardCoverageDepth.spec.ts:760:9

# Error details

```
TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
Call log:
  - waiting for getByRole('option', { name: /^billing$/i }) to be visible

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - generic [ref=e5]:
        - link "OolTool" [ref=e7] [cursor=pointer]:
          - /url: /dashboard
          - img "OolTool" [ref=e8]
        - navigation [ref=e10]:
          - link "Dashboard" [ref=e11] [cursor=pointer]:
            - /url: /dashboard
          - link "Opportunities" [ref=e12] [cursor=pointer]:
            - /url: /dashboard/opportunities
          - button "Portfolio" [ref=e14]:
            - generic [ref=e15]: Portfolio
            - img [ref=e16]
          - button "Research" [ref=e19]:
            - generic [ref=e20]: Research
            - img [ref=e21]
          - link "Academy" [ref=e23] [cursor=pointer]:
            - /url: /academy
          - link "Support" [ref=e24] [cursor=pointer]:
            - /url: /dashboard/support
        - generic [ref=e25]:
          - button "Market data and portfolio values may be delayed. Prices are not real-time. Portfolio holdings are based on the last snapshot received from your broker" [ref=e26]: Delayed
          - button "Sync all" [ref=e27] [cursor=pointer]:
            - img
            - generic [ref=e28]: Sync all
          - button "Add options" [ref=e29] [cursor=pointer]:
            - img
          - button "Notifications" [ref=e30] [cursor=pointer]:
            - img [ref=e31]
            - generic [ref=e34]: "18"
          - button "QU" [ref=e35] [cursor=pointer]:
            - generic [ref=e37]: QU
    - main [ref=e38]:
      - generic [ref=e39]:
        - generic [ref=e40]:
          - heading "Support" [level=1] [ref=e41]
          - paragraph [ref=e42]: Create a request and keep the conversation with our support team in one place.
        - generic [ref=e43]:
          - generic [ref=e44]:
            - generic [ref=e45]:
              - img [ref=e46]
              - text: Create a support ticket
            - generic [ref=e48]: Describe the issue without including passwords or secret keys.
          - generic [ref=e50]:
            - generic [ref=e51]:
              - generic [ref=e52]:
                - text: Subject
                - textbox "Subject" [ref=e53]
              - generic [ref=e54]:
                - text: Category
                - combobox [active] [ref=e55]:
                  - generic: Technical
                  - img
                - combobox [ref=e56]
              - generic [ref=e57]:
                - text: Priority
                - combobox [ref=e58]:
                  - generic: Normal
                  - img
                - combobox [ref=e59]
            - generic [ref=e60]:
              - text: Message
              - textbox "Message" [ref=e61]
            - generic [ref=e62]:
              - button "Choose File" [ref=e63]
              - generic [ref=e64]:
                - button "Add images" [ref=e65] [cursor=pointer]:
                  - img
                  - text: Add images
                - generic [ref=e66]: Up to 5 JPEG, PNG, or WebP images, 1 MB each
            - button "Submit ticket" [ref=e67] [cursor=pointer]
        - generic [ref=e68]:
          - generic [ref=e69]:
            - generic [ref=e70]:
              - generic [ref=e71]: Your tickets
              - generic [ref=e72]: Select a ticket to view or reply.
            - generic [ref=e73]:
              - combobox [ref=e74]:
                - generic: All statuses
                - img
              - button "Refresh tickets" [ref=e75] [cursor=pointer]:
                - img
          - paragraph [ref=e77]: No support tickets found.
    - contentinfo [ref=e78]:
      - generic [ref=e79]:
        - generic [ref=e80]:
          - paragraph [ref=e81]: © 2026 Ools Inc. All rights reserved.
          - navigation "Legal and support" [ref=e82]:
            - link "Privacy Policy" [ref=e84] [cursor=pointer]:
              - /url: /privacy-policy
            - generic [ref=e85]:
              - generic [ref=e86]: ·
              - link "Terms of Service" [ref=e87] [cursor=pointer]:
                - /url: /terms-of-services
            - generic [ref=e88]:
              - generic [ref=e89]: ·
              - link "Disclosures" [ref=e90] [cursor=pointer]:
                - /url: /disclosures
            - generic [ref=e91]:
              - generic [ref=e92]: ·
              - link "Risk Warning" [ref=e93] [cursor=pointer]:
                - /url: /risk-warning
            - generic [ref=e94]:
              - generic [ref=e95]: ·
              - link "OCC Options Disclosure" [ref=e96] [cursor=pointer]:
                - /url: https://www.theocc.com/company-information/documents-and-archives/options-disclosure-document
            - generic [ref=e97]:
              - generic [ref=e98]: ·
              - link "Contact" [ref=e99] [cursor=pointer]:
                - /url: /contact
        - paragraph [ref=e100]: Options trading involves substantial risk and is not suitable for all investors. Past performance does not guarantee future results.
  - region "Notifications alt+T"
  - alert [ref=e101]
```

# Test source

```ts
  1   | import {
  2   |   Locator,
  3   |   Page
  4   | } from '@playwright/test';
  5   | 
  6   | import {
  7   |   dismissOverlays
  8   | } from './dismissOverlays';
  9   | import {
  10  |   watchDelayMs
  11  | } from '../config/watchMode';
  12  | 
  13  | /* =============================================================================
  14  | HELPER: safeClick
  15  | 
  16  | PURPOSE
  17  | -------
  18  | Waits for a locator to become visible, scrolls it into view, then clicks it.
  19  | Overlays are dismissed first. Real clicks are used so cookie/announcement
  20  | layers cannot swallow Create Account, Sign up, profile, or Plans actions.
  21  | ============================================================================= */
  22  | 
  23  | export async function safeClick(
  24  |   locator: Locator,
  25  |   label: string
  26  | ) {
  27  |   console.log(`[CLICK] ${label}`);
  28  | 
  29  |   const page =
  30  |     locator.page();
  31  | 
  32  |   await dismissOverlays(
  33  |     page
  34  |   );
  35  | 
  36  |   try {
  37  |     await locator.waitFor({
  38  |       state: 'visible',
  39  |       timeout: 15000,
  40  |     });
  41  |   } catch {
  42  |     // A survey or cookie layer often appears a moment after the first
  43  |     // dismiss during a long run. Clear it and wait for the target again.
  44  |     await dismissOverlays(
  45  |       page
  46  |     );
  47  | 
> 48  |     await locator.waitFor({
      |                   ^ TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
  49  |       state: 'visible',
  50  |       timeout: 15000,
  51  |     });
  52  |   }
  53  | 
  54  |   await locator.scrollIntoViewIfNeeded({
  55  |     timeout: 5000,
  56  |   }).catch(
  57  |     () => undefined
  58  |   );
  59  | 
  60  |   try {
  61  |     await locator.click({
  62  |       timeout: 8000,
  63  |     });
  64  |   } catch {
  65  |     await dismissOverlays(
  66  |       page
  67  |     );
  68  | 
  69  |     await locator.scrollIntoViewIfNeeded({
  70  |       timeout: 5000,
  71  |     }).catch(
  72  |       () => undefined
  73  |     );
  74  | 
  75  |     await locator.click({
  76  |       timeout: 8000,
  77  |     }).catch(
  78  |       async () => {
  79  |         await locator.click({
  80  |           force: true,
  81  |           timeout: 8000
  82  |         });
  83  |       }
  84  |     );
  85  |   }
  86  | 
  87  |   const watchDelay =
  88  |     watchDelayMs();
  89  | 
  90  |   if (watchDelay > 0) {
  91  |     await locator.page().waitForTimeout(
  92  |       watchDelay
  93  |     );
  94  |   }
  95  | }
  96  | 
  97  | export async function openHeaderMenu(
  98  |   page: Page,
  99  |   menuName: RegExp
  100 | ) {
  101 |   const menuButton =
  102 |     page.getByRole(
  103 |       'button',
  104 |       {
  105 |         name: menuName
  106 |       }
  107 |     ).first();
  108 | 
  109 |   const anyItem =
  110 |     page.getByRole(
  111 |       'menuitem'
  112 |     ).first();
  113 | 
  114 |   for (let attempt = 1; attempt <= 2; attempt += 1) {
  115 |     await menuButton.hover();
  116 | 
  117 |     const openedByHover =
  118 |       await anyItem.waitFor({
  119 |         state: 'visible',
  120 |         timeout: 1500
  121 |       }).then(
  122 |         () => true
  123 |       ).catch(
  124 |         () => false
  125 |       );
  126 | 
  127 |     if (openedByHover) {
  128 |       return;
  129 |     }
  130 | 
  131 |     const expanded =
  132 |       await menuButton.getAttribute(
  133 |         'aria-expanded'
  134 |       ).catch(
  135 |         () => null
  136 |       );
  137 | 
  138 |     if (expanded !== 'true') {
  139 |       await menuButton.click({
  140 |         timeout: 8000
  141 |       });
  142 |     }
  143 | 
  144 |     const opened =
  145 |       await anyItem.waitFor({
  146 |         state: 'visible',
  147 |         timeout: 5000
  148 |       }).then(
```
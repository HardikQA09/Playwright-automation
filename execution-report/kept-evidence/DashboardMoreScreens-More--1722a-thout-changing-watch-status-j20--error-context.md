# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: DashboardMoreScreens.spec.ts >> More dashboard screens >> CTA Details opens without changing watch status
- Location: tests\DashboardMoreScreens.spec.ts:252:9

# Error details

```
TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
Call log:
  - waiting for getByRole('row').filter({ hasText: /cash secured put|covered call|protective put|long call/i }).first().getByRole('button', { name: /row actions/i }) to be visible

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
          - generic [ref=e41]:
            - generic [ref=e42]:
              - heading "Opportunities" [level=1] [ref=e43]
              - button "About opportunities" [ref=e44]:
                - img [ref=e45]
            - paragraph [ref=e47]: CTAs for your open positions and watchlist
            - 'link "OCC: Characteristics and Risks of Standardized Options" [ref=e48] [cursor=pointer]':
              - /url: https://www.theocc.com/company-information/documents-and-archives/options-disclosure-document
              - text: "OCC: Characteristics and Risks of Standardized Options"
              - img [ref=e49]
          - button "How Opportunities work" [ref=e54] [cursor=pointer]:
            - img
            - text: How Opportunities work
        - generic [ref=e56]:
          - generic [ref=e57]:
            - generic [ref=e58]: Symbol
            - generic [ref=e59]:
              - img
              - combobox "Search any symbol" [ref=e60]
          - combobox [ref=e61]:
            - generic: All Strategies
            - img
          - combobox [ref=e62]:
            - generic: "Source: All"
            - img
          - combobox [ref=e63]:
            - generic: "Expiry: All"
            - img
          - combobox [ref=e64]:
            - generic: "Cost Basis: All"
            - img
          - button "Filters" [ref=e65] [cursor=pointer]:
            - img
            - text: Filters
          - button "Save View" [ref=e66] [cursor=pointer]
          - button "Saved Views" [ref=e67]
        - generic [ref=e70]:
          - generic [ref=e71]:
            - img [ref=e72]
            - generic [ref=e74]: "Your risk:"
            - generic [ref=e75]: Moderate (4–6)
            - generic [ref=e76]: ·
            - link "Details →" [ref=e77] [cursor=pointer]:
              - /url: /dashboard/risk-compliance
          - generic [ref=e78]:
            - button "Conservative (1–3) 0" [ref=e79]:
              - generic [ref=e81]:
                - text: Conservative
                - generic [ref=e82]: (1–3)
              - generic [ref=e83]: "0"
            - button "Moderate (4–6) 0" [active] [pressed] [ref=e84]:
              - generic [ref=e86]:
                - text: Moderate
                - generic [ref=e87]: (4–6)
              - generic [ref=e88]: "0"
            - button "Growth (7–8) 1" [disabled] [ref=e89]:
              - generic [ref=e90]:
                - img [ref=e91]
                - generic [ref=e94]:
                  - text: Growth
                  - generic [ref=e95]: (7–8)
              - generic [ref=e96]: "1"
            - button "Aggressive (9–10) 1" [disabled] [ref=e97]:
              - generic [ref=e98]:
                - img [ref=e99]
                - generic [ref=e102]:
                  - text: Aggressive
                  - generic [ref=e103]: (9–10)
              - generic [ref=e104]: "1"
          - generic [ref=e105]:
            - generic [ref=e106]: Viewing Moderate risk
            - generic [ref=e107]: ·
            - link "Change profile →" [ref=e108] [cursor=pointer]:
              - /url: /dashboard/risk-compliance
        - generic [ref=e109]:
          - generic [ref=e110]:
            - generic [ref=e111]: Growth risk
            - generic [ref=e113]: Moderate risk
            - generic [ref=e115]: Aggressive risk
            - generic [ref=e117]: Conservative risk
            - generic [ref=e119]:
              - generic [ref=e120]: E
              - text: Earnings
            - generic [ref=e121]:
              - generic [ref=e122]: D
              - text: Dividend
            - generic [ref=e123]:
              - img [ref=e124]
              - text: Watching (opportunity watch)
            - generic [ref=e127]:
              - generic [ref=e128]: P
              - text: Position Taken (in Your Status)
            - button "Legend notes" [ref=e129]:
              - img [ref=e130]
          - generic [ref=e132]:
            - generic [ref=e133]: "Sort by:"
            - combobox [ref=e134]:
              - generic: Expiry (Soonest)
              - img
        - generic [ref=e136]: No opportunities found.
        - generic [ref=e138]:
          - text: "Rows per page:"
          - combobox [ref=e139]:
            - generic: "10"
            - img
    - contentinfo [ref=e140]:
      - generic [ref=e141]:
        - generic [ref=e142]:
          - paragraph [ref=e143]: © 2026 Ools Inc. All rights reserved.
          - navigation "Legal and support" [ref=e144]:
            - link "Privacy Policy" [ref=e146] [cursor=pointer]:
              - /url: /privacy-policy
            - generic [ref=e147]:
              - generic [ref=e148]: ·
              - link "Terms of Service" [ref=e149] [cursor=pointer]:
                - /url: /terms-of-services
            - generic [ref=e150]:
              - generic [ref=e151]: ·
              - link "Disclosures" [ref=e152] [cursor=pointer]:
                - /url: /disclosures
            - generic [ref=e153]:
              - generic [ref=e154]: ·
              - link "Risk Warning" [ref=e155] [cursor=pointer]:
                - /url: /risk-warning
            - generic [ref=e156]:
              - generic [ref=e157]: ·
              - link "OCC Options Disclosure" [ref=e158] [cursor=pointer]:
                - /url: https://www.theocc.com/company-information/documents-and-archives/options-disclosure-document
            - generic [ref=e159]:
              - generic [ref=e160]: ·
              - link "Contact" [ref=e161] [cursor=pointer]:
                - /url: /contact
        - paragraph [ref=e162]: Options trading involves substantial risk and is not suitable for all investors. Past performance does not guarantee future results.
  - region "Notifications alt+T"
  - alert [ref=e163]
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
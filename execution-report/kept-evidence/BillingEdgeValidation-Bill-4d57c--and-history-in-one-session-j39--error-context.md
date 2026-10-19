# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: BillingEdgeValidation.spec.ts >> Billing Edge Validation >> Billing overview plans and history in one session
- Location: tests\BillingEdgeValidation.spec.ts:34:9

# Error details

```
Error: Manage subscription control was not found. Visible controls: Dashboard | Opportunities | Portfolio | Research | Academy | Support | Delayed | Sync all | 20 | QU | Overview | Plans | History | Privacy Policy | Terms of Service | Disclosures | Risk Warning | OCC Options Disclosure | Contact
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
            - generic [ref=e34]: "20"
          - button "QU" [ref=e35] [cursor=pointer]:
            - generic [ref=e37]: QU
    - main [ref=e38]:
      - generic [ref=e39]:
        - generic [ref=e40]:
          - heading "Billing & Subscription" [level=1] [ref=e41]
          - paragraph [ref=e42]: Manage your plan, payment methods, and billing history.
        - generic [ref=e43]:
          - tablist [ref=e44]:
            - tab "Overview" [active] [selected] [ref=e45] [cursor=pointer]: Overview
            - tab "Plans" [ref=e46] [cursor=pointer]: Plans
            - tab "History" [ref=e47] [cursor=pointer]: History
          - tabpanel "Overview" [ref=e48]:
            - generic [ref=e49]:
              - generic [ref=e50]:
                - generic [ref=e51]:
                  - img [ref=e52]
                  - text: Current Plan
                - generic [ref=e54]: Free
              - generic [ref=e56]:
                - generic [ref=e57]:
                  - paragraph [ref=e58]: Plan
                  - paragraph [ref=e59]: Free
                - generic [ref=e60]:
                  - paragraph [ref=e61]: Price
                  - paragraph [ref=e62]: Free
            - generic [ref=e65]: Manage Subscription
    - contentinfo [ref=e67]:
      - generic [ref=e68]:
        - generic [ref=e69]:
          - paragraph [ref=e70]: © 2026 Ools Inc. All rights reserved.
          - navigation "Legal and support" [ref=e71]:
            - link "Privacy Policy" [ref=e73] [cursor=pointer]:
              - /url: /privacy-policy
            - generic [ref=e74]:
              - generic [ref=e75]: ·
              - link "Terms of Service" [ref=e76] [cursor=pointer]:
                - /url: /terms-of-services
            - generic [ref=e77]:
              - generic [ref=e78]: ·
              - link "Disclosures" [ref=e79] [cursor=pointer]:
                - /url: /disclosures
            - generic [ref=e80]:
              - generic [ref=e81]: ·
              - link "Risk Warning" [ref=e82] [cursor=pointer]:
                - /url: /risk-warning
            - generic [ref=e83]:
              - generic [ref=e84]: ·
              - link "OCC Options Disclosure" [ref=e85] [cursor=pointer]:
                - /url: https://www.theocc.com/company-information/documents-and-archives/options-disclosure-document
            - generic [ref=e86]:
              - generic [ref=e87]: ·
              - link "Contact" [ref=e88] [cursor=pointer]:
                - /url: /contact
        - paragraph [ref=e89]: Options trading involves substantial risk and is not suitable for all investors. Past performance does not guarantee future results.
  - region "Notifications alt+T"
  - alert [ref=e90]
```

# Test source

```ts
  5335 |     !alreadyOnHistory
  5336 |   ) {
  5337 |     await this.validateHistoryTabStable();
  5338 |   }
  5339 | 
  5340 |   const invoiceLink =
  5341 |     this.invoiceLinks.first();
  5342 | 
  5343 |   await expect(
  5344 |     invoiceLink
  5345 |   ).toBeVisible({
  5346 |     timeout: 15000,
  5347 |   });
  5348 | 
  5349 |   const invoiceHref =
  5350 |     await invoiceLink.getAttribute(
  5351 |       'href'
  5352 |     );
  5353 | 
  5354 |   expect(
  5355 |     invoiceHref
  5356 |   ).toBeTruthy();
  5357 | 
  5358 |   const pdfLink =
  5359 |     this.pdfLinks.first();
  5360 | 
  5361 |   await expect(
  5362 |     pdfLink
  5363 |   ).toBeVisible({
  5364 |     timeout: 15000,
  5365 |   });
  5366 | 
  5367 |   const pdfHref =
  5368 |     await pdfLink.getAttribute(
  5369 |       'href'
  5370 |     );
  5371 | 
  5372 |   expect(
  5373 |     pdfHref
  5374 |   ).toBeTruthy();
  5375 | 
  5376 |   Logger.success(
  5377 |     'Billing Evidence Links Have Targets'
  5378 |   );
  5379 | }
  5380 | 
  5381 | private async manageSubscriptionControl() {
  5382 |   if (
  5383 |     /stripe\.com/i.test(
  5384 |       this.page.url()
  5385 |     )
  5386 |   ) {
  5387 |     throw new Error(
  5388 |       `Manage subscription was requested while still on Stripe: ${this.page.url()}`
  5389 |     );
  5390 |   }
  5391 | 
  5392 |   const manageName =
  5393 |     /manage subscription|manage billing|billing portal|customer portal|subscription settings|manage plan|manage payment methods|payment methods\s*&\s*invoices|update payment method|change payment method/i;
  5394 | 
  5395 |   const candidates = [
  5396 |     this.page.getByRole(
  5397 |       'button',
  5398 |       {
  5399 |         name: manageName,
  5400 |       }
  5401 |     ),
  5402 |     this.page.getByRole(
  5403 |       'link',
  5404 |       {
  5405 |         name: manageName,
  5406 |       }
  5407 |     ),
  5408 |     this.page.locator(
  5409 |       'a[href*="billing.stripe.com"], a[href*="stripe.com"]'
  5410 |     ).filter({
  5411 |       hasText: manageName,
  5412 |     }),
  5413 |     this.page.locator(
  5414 |       'button, a, [role="button"]'
  5415 |     ).filter({
  5416 |       hasText: manageName,
  5417 |     }),
  5418 |   ];
  5419 | 
  5420 |   for (const candidate of candidates) {
  5421 |     const control =
  5422 |       candidate.first();
  5423 | 
  5424 |     if (
  5425 |       await control.isVisible({
  5426 |         timeout: 2000
  5427 |       }).catch(
  5428 |         () => false
  5429 |       )
  5430 |     ) {
  5431 |       return control;
  5432 |     }
  5433 |   }
  5434 | 
> 5435 |   throw new Error(
       |         ^ Error: Manage subscription control was not found. Visible controls: Dashboard | Opportunities | Portfolio | Research | Academy | Support | Delayed | Sync all | 20 | QU | Overview | Plans | History | Privacy Policy | Terms of Service | Disclosures | Risk Warning | OCC Options Disclosure | Contact
  5436 |     `Manage subscription control was not found. Visible controls: ${(await this.visibleControlSummary()).join(' | ')}`
  5437 |   );
  5438 | }
  5439 | 
  5440 | private async clickStripePortalControl(
  5441 |   locator: Locator,
  5442 |   label: string
  5443 | ) {
  5444 |   console.log(`[CLICK] ${label}`);
  5445 | 
  5446 |   await locator.waitFor({
  5447 |     state: 'visible',
  5448 |     timeout: 15000
  5449 |   });
  5450 | 
  5451 |   try {
  5452 |     await locator.click({
  5453 |       timeout: 5000
  5454 |     });
  5455 |   } catch {
  5456 |     await locator.click({
  5457 |       force: true,
  5458 |       timeout: 8000
  5459 |     });
  5460 |   }
  5461 | }
  5462 | 
  5463 | private async dismissStripeCancelDialog(
  5464 |   portalPage: Page
  5465 | ) {
  5466 |   const layer =
  5467 |     portalPage.locator(
  5468 |       '#__sail-layer-containers, [role="dialog"]'
  5469 |     ).filter({
  5470 |       hasText: /cancel your subscription/i
  5471 |     }).last();
  5472 | 
  5473 |   const goBack =
  5474 |     layer.getByRole(
  5475 |       'button',
  5476 |       {
  5477 |         name: /^go back$/i
  5478 |       }
  5479 |     ).last();
  5480 | 
  5481 |   if (
  5482 |     !await goBack.isVisible({
  5483 |       timeout: 2000
  5484 |     }).catch(
  5485 |       () => false
  5486 |     )
  5487 |   ) {
  5488 |     return false;
  5489 |   }
  5490 | 
  5491 |   await this.clickStripePortalControl(
  5492 |     goBack,
  5493 |     'Go Back From Cancel Subscription'
  5494 |   );
  5495 | 
  5496 |   await portalPage.getByText(
  5497 |     /cancel your subscription/i
  5498 |   ).first().waitFor({
  5499 |     state: 'hidden',
  5500 |     timeout: 10000
  5501 |   }).catch(
  5502 |     () => undefined
  5503 |   );
  5504 | 
  5505 |   return true;
  5506 | }
  5507 | 
  5508 | private async ensurePortalOverview(
  5509 |   portalPage: Page
  5510 | ) {
  5511 |   for (let attempt = 0; attempt < 4; attempt++) {
  5512 |     const overviewReady =
  5513 |       await this.waitForPortalOverview(
  5514 |         portalPage,
  5515 |         attempt === 0 ? 3000 : 5000
  5516 |       );
  5517 | 
  5518 |     if (
  5519 |       overviewReady
  5520 |     ) {
  5521 |       return;
  5522 |     }
  5523 | 
  5524 |     if (
  5525 |       await this.dismissStripeCancelDialog(
  5526 |         portalPage
  5527 |       )
  5528 |     ) {
  5529 |       continue;
  5530 |     }
  5531 | 
  5532 |     const goBack =
  5533 |       portalPage.getByRole(
  5534 |         'button',
  5535 |         {
```
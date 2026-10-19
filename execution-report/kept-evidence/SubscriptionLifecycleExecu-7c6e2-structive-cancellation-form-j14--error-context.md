# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: SubscriptionLifecycleExecution.spec.ts >> Subscription Lifecycle Execution >> Prepared paid user exposes non-destructive cancellation form
- Location: tests\SubscriptionLifecycleExecution.spec.ts:139:9

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
  5286 |     !alreadyOnHistory
  5287 |   ) {
  5288 |     await this.validateHistoryTabStable();
  5289 |   }
  5290 | 
  5291 |   const invoiceLink =
  5292 |     this.invoiceLinks.first();
  5293 | 
  5294 |   await expect(
  5295 |     invoiceLink
  5296 |   ).toBeVisible({
  5297 |     timeout: 15000,
  5298 |   });
  5299 | 
  5300 |   const invoiceHref =
  5301 |     await invoiceLink.getAttribute(
  5302 |       'href'
  5303 |     );
  5304 | 
  5305 |   expect(
  5306 |     invoiceHref
  5307 |   ).toBeTruthy();
  5308 | 
  5309 |   const pdfLink =
  5310 |     this.pdfLinks.first();
  5311 | 
  5312 |   await expect(
  5313 |     pdfLink
  5314 |   ).toBeVisible({
  5315 |     timeout: 15000,
  5316 |   });
  5317 | 
  5318 |   const pdfHref =
  5319 |     await pdfLink.getAttribute(
  5320 |       'href'
  5321 |     );
  5322 | 
  5323 |   expect(
  5324 |     pdfHref
  5325 |   ).toBeTruthy();
  5326 | 
  5327 |   Logger.success(
  5328 |     'Billing Evidence Links Have Targets'
  5329 |   );
  5330 | }
  5331 | 
  5332 | private async manageSubscriptionControl() {
  5333 |   if (
  5334 |     /stripe\.com/i.test(
  5335 |       this.page.url()
  5336 |     )
  5337 |   ) {
  5338 |     throw new Error(
  5339 |       `Manage subscription was requested while still on Stripe: ${this.page.url()}`
  5340 |     );
  5341 |   }
  5342 | 
  5343 |   const manageName =
  5344 |     /manage subscription|manage billing|billing portal|customer portal|subscription settings|manage plan|manage payment methods|payment methods\s*&\s*invoices|update payment method|change payment method/i;
  5345 | 
  5346 |   const candidates = [
  5347 |     this.page.getByRole(
  5348 |       'button',
  5349 |       {
  5350 |         name: manageName,
  5351 |       }
  5352 |     ),
  5353 |     this.page.getByRole(
  5354 |       'link',
  5355 |       {
  5356 |         name: manageName,
  5357 |       }
  5358 |     ),
  5359 |     this.page.locator(
  5360 |       'a[href*="billing.stripe.com"], a[href*="stripe.com"]'
  5361 |     ).filter({
  5362 |       hasText: manageName,
  5363 |     }),
  5364 |     this.page.locator(
  5365 |       'button, a, [role="button"]'
  5366 |     ).filter({
  5367 |       hasText: manageName,
  5368 |     }),
  5369 |   ];
  5370 | 
  5371 |   for (const candidate of candidates) {
  5372 |     const control =
  5373 |       candidate.first();
  5374 | 
  5375 |     if (
  5376 |       await control.isVisible({
  5377 |         timeout: 2000
  5378 |       }).catch(
  5379 |         () => false
  5380 |       )
  5381 |     ) {
  5382 |       return control;
  5383 |     }
  5384 |   }
  5385 | 
> 5386 |   throw new Error(
       |         ^ Error: Manage subscription control was not found. Visible controls: Dashboard | Opportunities | Portfolio | Research | Academy | Support | Delayed | Sync all | 20 | QU | Overview | Plans | History | Privacy Policy | Terms of Service | Disclosures | Risk Warning | OCC Options Disclosure | Contact
  5387 |     `Manage subscription control was not found. Visible controls: ${(await this.visibleControlSummary()).join(' | ')}`
  5388 |   );
  5389 | }
  5390 | 
  5391 | private async clickStripePortalControl(
  5392 |   locator: Locator,
  5393 |   label: string
  5394 | ) {
  5395 |   console.log(`[CLICK] ${label}`);
  5396 | 
  5397 |   await locator.waitFor({
  5398 |     state: 'visible',
  5399 |     timeout: 15000
  5400 |   });
  5401 | 
  5402 |   try {
  5403 |     await locator.click({
  5404 |       timeout: 5000
  5405 |     });
  5406 |   } catch {
  5407 |     await locator.click({
  5408 |       force: true,
  5409 |       timeout: 8000
  5410 |     });
  5411 |   }
  5412 | }
  5413 | 
  5414 | private async dismissStripeCancelDialog(
  5415 |   portalPage: Page
  5416 | ) {
  5417 |   const layer =
  5418 |     portalPage.locator(
  5419 |       '#__sail-layer-containers, [role="dialog"]'
  5420 |     ).filter({
  5421 |       hasText: /cancel your subscription/i
  5422 |     }).last();
  5423 | 
  5424 |   const goBack =
  5425 |     layer.getByRole(
  5426 |       'button',
  5427 |       {
  5428 |         name: /^go back$/i
  5429 |       }
  5430 |     ).last();
  5431 | 
  5432 |   if (
  5433 |     !await goBack.isVisible({
  5434 |       timeout: 2000
  5435 |     }).catch(
  5436 |       () => false
  5437 |     )
  5438 |   ) {
  5439 |     return false;
  5440 |   }
  5441 | 
  5442 |   await this.clickStripePortalControl(
  5443 |     goBack,
  5444 |     'Go Back From Cancel Subscription'
  5445 |   );
  5446 | 
  5447 |   await portalPage.getByText(
  5448 |     /cancel your subscription/i
  5449 |   ).first().waitFor({
  5450 |     state: 'hidden',
  5451 |     timeout: 10000
  5452 |   }).catch(
  5453 |     () => undefined
  5454 |   );
  5455 | 
  5456 |   return true;
  5457 | }
  5458 | 
  5459 | private async ensurePortalOverview(
  5460 |   portalPage: Page
  5461 | ) {
  5462 |   for (let attempt = 0; attempt < 4; attempt++) {
  5463 |     const overviewReady =
  5464 |       await this.waitForPortalOverview(
  5465 |         portalPage,
  5466 |         attempt === 0 ? 3000 : 5000
  5467 |       );
  5468 | 
  5469 |     if (
  5470 |       overviewReady
  5471 |     ) {
  5472 |       return;
  5473 |     }
  5474 | 
  5475 |     if (
  5476 |       await this.dismissStripeCancelDialog(
  5477 |         portalPage
  5478 |       )
  5479 |     ) {
  5480 |       continue;
  5481 |     }
  5482 | 
  5483 |     const goBack =
  5484 |       portalPage.getByRole(
  5485 |         'button',
  5486 |         {
```
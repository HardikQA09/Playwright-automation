# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: SubscriptionCancellationMatrix.spec.ts >> Subscription Cancellation Use Case 7 Matrix >> SC-244 - Cancellation form opens without immediately cancelling subscription
- Location: tests\SubscriptionCancellationMatrix.spec.ts:553:13

# Error details

```
Error: Manage subscription control was not found. Visible controls: Dashboard | Opportunities | Portfolio | Research | Academy | Support | Delayed | Sync all | 20 | QU | Overview | Plans | History | Privacy Policy | Terms of Service | Disclosures | Risk Warning | OCC Options Disclosure | Contact
```

# Test source

```ts
  5286 | 
  5287 |   await expect(
  5288 |     this.page.getByText(
  5289 |       /transactions|paid|invoice|history/i
  5290 |     ).first()
  5291 |   ).toBeVisible({
  5292 |     timeout: 15000,
  5293 |   });
  5294 | 
  5295 |   Logger.success(
  5296 |     'Billing History Tab Stable'
  5297 |   );
  5298 | }
  5299 | 
  5300 | async validateInvoiceAndPdfLinksHaveTargets() {
  5301 | 
  5302 |   Logger.info(
  5303 |     'Validating Billing Evidence Links'
  5304 |   );
  5305 | 
  5306 |   const alreadyOnHistory =
  5307 |     await this.page.getByText(
  5308 |       /^paid$/i
  5309 |     ).first().isVisible({
  5310 |       timeout: 2000
  5311 |     }).catch(
  5312 |       () => false
  5313 |     );
  5314 | 
  5315 |   if (
  5316 |     !alreadyOnHistory
  5317 |   ) {
  5318 |     await this.validateHistoryTabStable();
  5319 |   }
  5320 | 
  5321 |   const invoiceLink =
  5322 |     this.invoiceLinks.first();
  5323 | 
  5324 |   await expect(
  5325 |     invoiceLink
  5326 |   ).toBeVisible({
  5327 |     timeout: 15000,
  5328 |   });
  5329 | 
  5330 |   const invoiceHref =
  5331 |     await invoiceLink.getAttribute(
  5332 |       'href'
  5333 |     );
  5334 | 
  5335 |   expect(
  5336 |     invoiceHref
  5337 |   ).toBeTruthy();
  5338 | 
  5339 |   const pdfLink =
  5340 |     this.pdfLinks.first();
  5341 | 
  5342 |   await expect(
  5343 |     pdfLink
  5344 |   ).toBeVisible({
  5345 |     timeout: 15000,
  5346 |   });
  5347 | 
  5348 |   const pdfHref =
  5349 |     await pdfLink.getAttribute(
  5350 |       'href'
  5351 |     );
  5352 | 
  5353 |   expect(
  5354 |     pdfHref
  5355 |   ).toBeTruthy();
  5356 | 
  5357 |   Logger.success(
  5358 |     'Billing Evidence Links Have Targets'
  5359 |   );
  5360 | }
  5361 | 
  5362 | private async manageSubscriptionControl() {
  5363 |   if (
  5364 |     /stripe\.com/i.test(
  5365 |       this.page.url()
  5366 |     )
  5367 |   ) {
  5368 |     throw new Error(
  5369 |       `Manage subscription was requested while still on Stripe: ${this.page.url()}`
  5370 |     );
  5371 |   }
  5372 | 
  5373 |   const manageName =
  5374 |     /manage subscription|manage billing|billing portal|customer portal|subscription settings|manage plan|manage payment methods|payment methods\s*&\s*invoices|update payment method|change payment method/i;
  5375 | 
  5376 |   const candidates = [
  5377 |     this.page.getByRole(
  5378 |       'button',
  5379 |       {
  5380 |         name: manageName,
  5381 |       }
  5382 |     ),
  5383 |     this.page.getByRole(
  5384 |       'link',
  5385 |       {
> 5386 |         name: manageName,
       |         ^ Error: Manage subscription control was not found. Visible controls: Dashboard | Opportunities | Portfolio | Research | Academy | Support | Delayed | Sync all | 20 | QU | Overview | Plans | History | Privacy Policy | Terms of Service | Disclosures | Risk Warning | OCC Options Disclosure | Contact
  5387 |       }
  5388 |     ),
  5389 |     this.page.locator(
  5390 |       'a[href*="billing.stripe.com"], a[href*="stripe.com"]'
  5391 |     ).filter({
  5392 |       hasText: manageName,
  5393 |     }),
  5394 |     this.page.locator(
  5395 |       'button, a, [role="button"]'
  5396 |     ).filter({
  5397 |       hasText: manageName,
  5398 |     }),
  5399 |   ];
  5400 | 
  5401 |   for (const candidate of candidates) {
  5402 |     const control =
  5403 |       candidate.first();
  5404 | 
  5405 |     if (
  5406 |       await control.isVisible({
  5407 |         timeout: 2000
  5408 |       }).catch(
  5409 |         () => false
  5410 |       )
  5411 |     ) {
  5412 |       return control;
  5413 |     }
  5414 |   }
  5415 | 
  5416 |   throw new Error(
  5417 |     `Manage subscription control was not found. Visible controls: ${(await this.visibleControlSummary()).join(' | ')}`
  5418 |   );
  5419 | }
  5420 | 
  5421 | private async clickStripePortalControl(
  5422 |   locator: Locator,
  5423 |   label: string
  5424 | ) {
  5425 |   console.log(`[CLICK] ${label}`);
  5426 | 
  5427 |   await locator.waitFor({
  5428 |     state: 'visible',
  5429 |     timeout: 15000
  5430 |   });
  5431 | 
  5432 |   try {
  5433 |     await locator.click({
  5434 |       timeout: 5000
  5435 |     });
  5436 |   } catch {
  5437 |     await locator.click({
  5438 |       force: true,
  5439 |       timeout: 8000
  5440 |     });
  5441 |   }
  5442 | }
  5443 | 
  5444 | private async dismissStripeCancelDialog(
  5445 |   portalPage: Page
  5446 | ) {
  5447 |   const layer =
  5448 |     portalPage.locator(
  5449 |       '#__sail-layer-containers, [role="dialog"]'
  5450 |     ).filter({
  5451 |       hasText: /cancel your subscription/i
  5452 |     }).last();
  5453 | 
  5454 |   const goBack =
  5455 |     layer.getByRole(
  5456 |       'button',
  5457 |       {
  5458 |         name: /^go back$/i
  5459 |       }
  5460 |     ).last();
  5461 | 
  5462 |   if (
  5463 |     !await goBack.isVisible({
  5464 |       timeout: 2000
  5465 |     }).catch(
  5466 |       () => false
  5467 |     )
  5468 |   ) {
  5469 |     return false;
  5470 |   }
  5471 | 
  5472 |   await this.clickStripePortalControl(
  5473 |     goBack,
  5474 |     'Go Back From Cancel Subscription'
  5475 |   );
  5476 | 
  5477 |   await portalPage.getByText(
  5478 |     /cancel your subscription/i
  5479 |   ).first().waitFor({
  5480 |     state: 'hidden',
  5481 |     timeout: 10000
  5482 |   }).catch(
  5483 |     () => undefined
  5484 |   );
  5485 | 
  5486 |   return true;
```
# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: Opportunities.spec.ts >> Opportunities >> Opportunity save view research watch and pagination
- Location: tests\Opportunities.spec.ts:80:9

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('dialog')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('dialog')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
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
            - button "Conservative (1–3) 2" [ref=e79]:
              - generic [ref=e81]:
                - text: Conservative
                - generic [ref=e82]: (1–3)
              - generic [ref=e83]: "2"
            - button "Moderate (4–6) 4" [pressed] [ref=e84]:
              - generic [ref=e86]:
                - text: Moderate
                - generic [ref=e87]: (4–6)
              - generic [ref=e88]: "4"
            - button "Growth (7–8) 4" [disabled] [ref=e89]:
              - generic [ref=e90]:
                - img [ref=e91]
                - generic [ref=e94]:
                  - text: Growth
                  - generic [ref=e95]: (7–8)
              - generic [ref=e96]: "4"
            - button "Aggressive (9–10) 5" [disabled] [ref=e97]:
              - generic [ref=e98]:
                - img [ref=e99]
                - generic [ref=e102]:
                  - text: Aggressive
                  - generic [ref=e103]: (9–10)
              - generic [ref=e104]: "5"
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
        - table [ref=e137]:
          - rowgroup [ref=e138]:
            - row "Symbol Strategy Expiry (DTE) Strike Last price Premium * Premium per contract Est. Return % Range +/- % Range for Premium Assign. Risk AD ± 0.10×(score/4) Equity Events Opp. Status Shows if this opportunity is New, Updated, Active, or Closed. On Hold isn’t used yet. Your Status Opportunity watch (date and underlying price at watch time) plus matching option holdings (Buy/Sell aggregated across broker and manual). Actions" [ref=e139]:
              - columnheader "Symbol" [ref=e140]:
                - button "Symbol" [ref=e142]:
                  - text: Symbol
                  - img [ref=e143]
              - columnheader "Strategy" [ref=e146]:
                - button "Strategy" [ref=e148]:
                  - text: Strategy
                  - img [ref=e149]
              - columnheader "Expiry (DTE)" [ref=e152]:
                - button "Expiry (DTE)" [ref=e154]:
                  - text: Expiry (DTE)
                  - img [ref=e155]
              - columnheader "Strike" [ref=e157]:
                - button "Strike" [ref=e159]:
                  - text: Strike
                  - img [ref=e160]
              - columnheader "Last price" [ref=e163]
              - columnheader "Premium * Premium per contract" [ref=e164]:
                - generic [ref=e165]:
                  - button "Premium" [ref=e166]:
                    - text: Premium
                    - img [ref=e167]
                  - button "* Premium per contract" [ref=e170]:
                    - img [ref=e171]
              - columnheader "Est. Return" [ref=e173]:
                - button "Est. Return" [ref=e175]:
                  - text: Est. Return
                  - img [ref=e176]
              - columnheader "% Range +/- % Range for Premium" [ref=e179]:
                - generic [ref=e180]:
                  - text: "% Range"
                  - button "+/- % Range for Premium" [ref=e181]:
                    - img [ref=e182]
              - columnheader "Assign. Risk AD ± 0.10×(score/4)" [ref=e184]:
                - generic [ref=e185]:
                  - button "Assign. Risk" [ref=e186]:
                    - text: Assign. Risk
                    - img [ref=e187]
                  - button "AD ± 0.10×(score/4)" [ref=e190]:
                    - img [ref=e191]
              - columnheader "Equity" [ref=e193]
              - columnheader "Events" [ref=e194]
              - columnheader "Opp. Status Shows if this opportunity is New, Updated, Active, or Closed. On Hold isn’t used yet." [ref=e195]:
                - generic [ref=e196]:
                  - text: Opp. Status
                  - button "Shows if this opportunity is New, Updated, Active, or Closed. On Hold isn’t used yet." [ref=e197]:
                    - img [ref=e198]
              - columnheader "Your Status Opportunity watch (date and underlying price at watch time) plus matching option holdings (Buy/Sell aggregated across broker and manual)." [ref=e200]:
                - generic [ref=e201]:
                  - text: Your Status
                  - button "Opportunity watch (date and underlying price at watch time) plus matching option holdings (Buy/Sell aggregated across broker and manual)." [ref=e202]:
                    - img [ref=e203]
              - columnheader "Actions" [ref=e205]
          - rowgroup [ref=e206]:
            - row "Moderate Opportunities 4 Balanced growth and income with moderate risk" [ref=e207]:
              - cell "Moderate Opportunities 4 Balanced growth and income with moderate risk" [ref=e208]:
                - generic [ref=e209]:
                  - generic [ref=e210]: Moderate Opportunities 4
                  - generic [ref=e211]: Balanced growth and income with moderate risk
            - row "Moderate risk CB Chubb Ltd Cash Secured Put Sell to Open Oct 16, 2026 8 DTE $330.00 $334.00 $4.85 (1.47%) +12.50% ±2.01% 30% 236 sh @ $1,200.00 Oct 20 New Oct 7, 2026, 10:00 PM Not Watching Row actions" [ref=e212]:
              - cell "Moderate risk CB Chubb Ltd" [ref=e213]:
                - generic [ref=e214]:
                  - generic "Moderate risk" [ref=e215]
                  - generic [ref=e216]:
                    - paragraph [ref=e217]: CB
                    - paragraph [ref=e218]: Chubb Ltd
              - cell "Cash Secured Put Sell to Open" [ref=e219]:
                - paragraph [ref=e220]: Cash Secured Put
                - paragraph [ref=e221]: Sell to Open
              - cell "Oct 16, 2026 8 DTE" [ref=e222]:
                - paragraph [ref=e223]: Oct 16, 2026
                - paragraph [ref=e224]: 8 DTE
              - cell "$330.00" [ref=e225]
              - cell "$334.00" [ref=e226]
              - cell "$4.85 (1.47%)" [ref=e227]:
                - paragraph [ref=e228]: $4.85
                - paragraph [ref=e229]: (1.47%)
              - cell "+12.50%" [ref=e230]
              - cell "±2.01%" [ref=e231]
              - cell "30%" [ref=e232]
              - cell "236 sh @ $1,200.00" [ref=e233]:
                - paragraph [ref=e234]: 236 sh
                - paragraph [ref=e235]: "@ $1,200.00"
              - cell "Oct 20" [ref=e236]:
                - generic [ref=e238]:
                  - generic [ref=e239]: E
                  - generic [ref=e240]: Oct 20
              - cell "New Oct 7, 2026, 10:00 PM" [ref=e241]:
                - generic [ref=e242]:
                  - generic [ref=e243]: New
                  - paragraph [ref=e244]: Oct 7, 2026, 10:00 PM
              - cell "Not Watching" [ref=e245]:
                - generic [ref=e248]:
                  - img [ref=e249]
                  - generic [ref=e252]: Not Watching
              - cell "Row actions" [ref=e253]:
                - button "Row actions" [ref=e254] [cursor=pointer]:
                  - img
                  - generic [ref=e255]: Row actions
            - row "Moderate risk FICO Fair Isaac Corporation Cash Secured Put Sell to Open Oct 16, 2026 8 DTE $1,040.00 $678.00 $44.30 (4.26%) +36.20% ±7.58% 99% 2 sh @ $10.00 Nov 4 New Oct 7, 2026, 10:00 PM Not Watching Row actions" [ref=e256]:
              - cell "Moderate risk FICO Fair Isaac Corporation" [ref=e257]:
                - generic [ref=e258]:
                  - generic "Moderate risk" [ref=e259]
                  - generic [ref=e260]:
                    - paragraph [ref=e261]: FICO
                    - paragraph [ref=e262]: Fair Isaac Corporation
              - cell "Cash Secured Put Sell to Open" [ref=e263]:
                - paragraph [ref=e264]: Cash Secured Put
                - paragraph [ref=e265]: Sell to Open
              - cell "Oct 16, 2026 8 DTE" [ref=e266]:
                - paragraph [ref=e267]: Oct 16, 2026
                - paragraph [ref=e268]: 8 DTE
              - cell "$1,040.00" [ref=e269]
              - cell "$678.00" [ref=e270]
              - cell "$44.30 (4.26%)" [ref=e271]:
                - paragraph [ref=e272]: $44.30
                - paragraph [ref=e273]: (4.26%)
              - cell "+36.20%" [ref=e274]
              - cell "±7.58%" [ref=e275]
              - cell "99%" [ref=e276]
              - cell "2 sh @ $10.00" [ref=e277]:
                - paragraph [ref=e278]: 2 sh
                - paragraph [ref=e279]: "@ $10.00"
              - cell "Nov 4" [ref=e280]:
                - generic [ref=e282]:
                  - generic [ref=e283]: E
                  - generic [ref=e284]: Nov 4
              - cell "New Oct 7, 2026, 10:00 PM" [ref=e285]:
                - generic [ref=e286]:
                  - generic [ref=e287]: New
                  - paragraph [ref=e288]: Oct 7, 2026, 10:00 PM
              - cell "Not Watching" [ref=e289]:
                - generic [ref=e292]:
                  - img [ref=e293]
                  - generic [ref=e296]: Not Watching
              - cell "Row actions" [ref=e297]:
                - button "Row actions" [ref=e298] [cursor=pointer]:
                  - img
                  - generic [ref=e299]: Row actions
            - row "Moderate risk CB Chubb Ltd Cash Secured Put Sell to Open Nov 20, 2026 43 DTE $320.00 $334.00 $5.35 (1.67%) +13.30% ±2.01% 24% 236 sh @ $1,200.00 Oct 20 Updated Oct 7, 2026, 10:00 PM Not Watching Row actions" [ref=e300]:
              - cell "Moderate risk CB Chubb Ltd" [ref=e301]:
                - generic [ref=e302]:
                  - generic "Moderate risk" [ref=e303]
                  - generic [ref=e304]:
                    - paragraph [ref=e305]: CB
                    - paragraph [ref=e306]: Chubb Ltd
              - cell "Cash Secured Put Sell to Open" [ref=e307]:
                - paragraph [ref=e308]: Cash Secured Put
                - paragraph [ref=e309]: Sell to Open
              - cell "Nov 20, 2026 43 DTE" [ref=e310]:
                - paragraph [ref=e311]: Nov 20, 2026
                - paragraph [ref=e312]: 43 DTE
              - cell "$320.00" [ref=e313]
              - cell "$334.00" [ref=e314]
              - cell "$5.35 (1.67%)" [ref=e315]:
                - paragraph [ref=e316]: $5.35
                - paragraph [ref=e317]: (1.67%)
              - cell "+13.30%" [ref=e318]
              - cell "±2.01%" [ref=e319]
              - cell "24%" [ref=e320]
              - cell "236 sh @ $1,200.00" [ref=e321]:
                - paragraph [ref=e322]: 236 sh
                - paragraph [ref=e323]: "@ $1,200.00"
              - cell "Oct 20" [ref=e324]:
                - generic [ref=e326]:
                  - generic [ref=e327]: E
                  - generic [ref=e328]: Oct 20
              - cell "Updated Oct 7, 2026, 10:00 PM" [ref=e329]:
                - generic [ref=e330]:
                  - generic [ref=e331]: Updated
                  - paragraph [ref=e332]: Oct 7, 2026, 10:00 PM
              - cell "Not Watching" [ref=e333]:
                - generic [ref=e336]:
                  - img [ref=e337]
                  - generic [ref=e340]: Not Watching
              - cell "Row actions" [ref=e341]:
                - button "Row actions" [ref=e342] [cursor=pointer]:
                  - img
                  - generic [ref=e343]: Row actions
            - row "Moderate risk FICO Fair Isaac Corporation Cash Secured Put Sell to Open Nov 20, 2026 43 DTE $600.00 $678.00 $27.00 (4.50%) +36.50% ±7.58% 25% 2 sh @ $10.00 Nov 4 Updated Oct 7, 2026, 10:00 PM Not Watching Row actions" [ref=e344]:
              - cell "Moderate risk FICO Fair Isaac Corporation" [ref=e345]:
                - generic [ref=e346]:
                  - generic "Moderate risk" [ref=e347]
                  - generic [ref=e348]:
                    - paragraph [ref=e349]: FICO
                    - paragraph [ref=e350]: Fair Isaac Corporation
              - cell "Cash Secured Put Sell to Open" [ref=e351]:
                - paragraph [ref=e352]: Cash Secured Put
                - paragraph [ref=e353]: Sell to Open
              - cell "Nov 20, 2026 43 DTE" [ref=e354]:
                - paragraph [ref=e355]: Nov 20, 2026
                - paragraph [ref=e356]: 43 DTE
              - cell "$600.00" [ref=e357]
              - cell "$678.00" [ref=e358]
              - cell "$27.00 (4.50%)" [ref=e359]:
                - paragraph [ref=e360]: $27.00
                - paragraph [ref=e361]: (4.50%)
              - cell "+36.50%" [ref=e362]
              - cell "±7.58%" [ref=e363]
              - cell "25%" [ref=e364]
              - cell "2 sh @ $10.00" [ref=e365]:
                - paragraph [ref=e366]: 2 sh
                - paragraph [ref=e367]: "@ $10.00"
              - cell "Nov 4" [ref=e368]:
                - generic [ref=e370]:
                  - generic [ref=e371]: E
                  - generic [ref=e372]: Nov 4
              - cell "Updated Oct 7, 2026, 10:00 PM" [ref=e373]:
                - generic [ref=e374]:
                  - generic [ref=e375]: Updated
                  - paragraph [ref=e376]: Oct 7, 2026, 10:00 PM
              - cell "Not Watching" [ref=e377]:
                - generic [ref=e380]:
                  - img [ref=e381]
                  - generic [ref=e384]: Not Watching
              - cell "Row actions" [ref=e385]:
                - button "Row actions" [ref=e386] [cursor=pointer]:
                  - img
                  - generic [ref=e387]: Row actions
        - generic [ref=e388]:
          - generic [ref=e389]:
            - text: "Rows per page:"
            - combobox [ref=e390]:
              - generic: "10"
              - img
          - generic [ref=e391]:
            - paragraph [ref=e392]:
              - text: Showing
              - generic [ref=e393]: 1–4
              - text: of 4
            - navigation "Pagination" [ref=e394]:
              - button "First page" [disabled]:
                - img
              - button "Previous page" [disabled]:
                - img
              - button "Page 1" [ref=e395] [cursor=pointer]: "1"
              - button "Next page" [disabled]:
                - img
              - button "Last page" [disabled]:
                - img
    - contentinfo [ref=e396]:
      - generic [ref=e397]:
        - generic [ref=e398]:
          - paragraph [ref=e399]: © 2026 Ools Inc. All rights reserved.
          - navigation "Legal and support" [ref=e400]:
            - link "Privacy Policy" [ref=e402] [cursor=pointer]:
              - /url: /privacy-policy
            - generic [ref=e403]:
              - generic [ref=e404]: ·
              - link "Terms of Service" [ref=e405] [cursor=pointer]:
                - /url: /terms-of-services
            - generic [ref=e406]:
              - generic [ref=e407]: ·
              - link "Disclosures" [ref=e408] [cursor=pointer]:
                - /url: /disclosures
            - generic [ref=e409]:
              - generic [ref=e410]: ·
              - link "Risk Warning" [ref=e411] [cursor=pointer]:
                - /url: /risk-warning
            - generic [ref=e412]:
              - generic [ref=e413]: ·
              - link "OCC Options Disclosure" [ref=e414] [cursor=pointer]:
                - /url: https://www.theocc.com/company-information/documents-and-archives/options-disclosure-document
            - generic [ref=e415]:
              - generic [ref=e416]: ·
              - link "Contact" [ref=e417] [cursor=pointer]:
                - /url: /contact
        - paragraph [ref=e418]: Options trading involves substantial risk and is not suitable for all investors. Past performance does not guarantee future results.
  - region "Notifications alt+T"
  - alert [ref=e419]
```

# Test source

```ts
  580 |       'textbox'
  581 |     ).first().fill(
  582 |       viewName
  583 |     );
  584 | 
  585 |     await safeClick(
  586 |       dialog.getByRole(
  587 |         'button',
  588 |         {
  589 |           name: /^save$/i
  590 |         }
  591 |       ),
  592 |       'Save the view'
  593 |     );
  594 | 
  595 |     await expect(
  596 |       dialog
  597 |     ).toBeHidden({
  598 |       timeout: 10000
  599 |     });
  600 | 
  601 |     Logger.success(
  602 |       `Saved opportunity view ${viewName}`
  603 |     );
  604 |   }
  605 | 
  606 |   async openSavedView(
  607 |     viewName: string
  608 |   ) {
  609 |     Logger.info(
  610 |       `Opening saved view ${viewName}`
  611 |     );
  612 | 
  613 |     await safeClick(
  614 |       this.page.getByRole(
  615 |         'button',
  616 |         {
  617 |           name: /^saved views$/i
  618 |         }
  619 |       ),
  620 |       'Saved Views'
  621 |     );
  622 | 
  623 |     const dialog =
  624 |       this.page.getByRole(
  625 |         'dialog'
  626 |       );
  627 | 
  628 |     const item =
  629 |       dialog.getByRole(
  630 |         'listitem'
  631 |       ).filter({
  632 |         hasText: viewName
  633 |       });
  634 | 
  635 |     await safeClick(
  636 |       item.getByRole(
  637 |         'button',
  638 |         {
  639 |           name: /^apply$/i
  640 |         }
  641 |       ),
  642 |       `Apply ${viewName}`
  643 |     );
  644 | 
  645 |     await expect(
  646 |       dialog
  647 |     ).toBeHidden({
  648 |       timeout: 10000
  649 |     });
  650 | 
  651 |     Logger.success(
  652 |       `Opened saved view ${viewName}`
  653 |     );
  654 |   }
  655 | 
  656 |   async deleteSavedViews(
  657 |     name: RegExp
  658 |   ) {
  659 |     Logger.info(
  660 |       'Removing saved opportunity views'
  661 |     );
  662 | 
  663 |     await safeClick(
  664 |       this.page.getByRole(
  665 |         'button',
  666 |         {
  667 |           name: /^saved views$/i
  668 |         }
  669 |       ),
  670 |       'Saved Views'
  671 |     );
  672 | 
  673 |     const dialog =
  674 |       this.page.getByRole(
  675 |         'dialog'
  676 |       );
  677 | 
  678 |     await expect(
  679 |       dialog
> 680 |     ).toBeVisible();
      |       ^ Error: expect(locator).toBeVisible() failed
  681 | 
  682 |     for (
  683 |       let attempt = 0;
  684 |       attempt < 6;
  685 |       attempt += 1
  686 |     ) {
  687 |       const remove =
  688 |         dialog.getByRole(
  689 |           'button',
  690 |           {
  691 |             name: name
  692 |           }
  693 |         ).first();
  694 | 
  695 |       if (
  696 |         !await remove.waitFor({
  697 |           state: 'visible',
  698 |           timeout: 2000
  699 |         }).then(
  700 |           () => true
  701 |         ).catch(
  702 |           () => false
  703 |         )
  704 |       ) {
  705 |         break;
  706 |       }
  707 | 
  708 |       await safeClick(
  709 |         remove,
  710 |         'Delete saved view'
  711 |       );
  712 | 
  713 |       const confirm =
  714 |         this.page.getByRole(
  715 |           'button',
  716 |           {
  717 |             name: /^delete$/i
  718 |           }
  719 |         );
  720 | 
  721 |       if (
  722 |         await confirm.waitFor({
  723 |           state: 'visible',
  724 |           timeout: 2000
  725 |         }).then(
  726 |           () => true
  727 |         ).catch(
  728 |           () => false
  729 |         )
  730 |       ) {
  731 |         await safeClick(
  732 |           confirm,
  733 |           'Confirm delete'
  734 |         );
  735 |       }
  736 |     }
  737 | 
  738 |     await this.page.keyboard.press(
  739 |       'Escape'
  740 |     );
  741 | 
  742 |     Logger.success(
  743 |       'Saved opportunity views are cleared'
  744 |     );
  745 |   }
  746 | 
  747 |   async validatePagination() {
  748 |     Logger.info(
  749 |       'Validating opportunity pagination'
  750 |     );
  751 | 
  752 |     const pageSize =
  753 |       this.page.locator(
  754 |         'main'
  755 |       ).getByRole(
  756 |         'combobox'
  757 |       ).filter({
  758 |         hasText: /^(10|15|25)$/
  759 |       }).first();
  760 | 
  761 |     await safeClick(
  762 |       pageSize,
  763 |       'Page size'
  764 |     );
  765 | 
  766 |     await safeClick(
  767 |       this.page.getByRole(
  768 |         'option',
  769 |         {
  770 |           name: /^15$/
  771 |         }
  772 |       ),
  773 |       '15 rows'
  774 |     );
  775 | 
  776 |     await expect(
  777 |       pageSize
  778 |     ).toContainText(
  779 |       /^15$/
  780 |     );
```
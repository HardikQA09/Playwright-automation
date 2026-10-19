# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: DashboardCoverageDepth.spec.ts >> Deeper dashboard controls >> Watchlist opens a new list and cancels, then shows opportunities
- Location: tests\DashboardCoverageDepth.spec.ts:673:9

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('main')
Expected pattern: /no watched opportunities|browse opportunities/i
Received string:  "WatchlistTrack symbols, market snapshots, news, and generate opportunities.My Watchlist(1)Opportunities(1)NewSymbolStrategyExpiry (DTE)StrikeLast pricePremiumEst. Return% RangeAssign. RiskEquityEventsOpp. StatusYour StatusActionsModerate Opportunities 1Balanced growth and income with moderate riskCBChubb LtdCovered CallSell to OpenOct 16, 20261 DTE$355.00$350.15$0.50(0.14%)+26.10%±1.87%23%236 sh@ $1,200.00EOct 20ActiveOct 14, 2026, 11:02 PMWatchingOct 15, 2026 @ $0.60Row actionsRows per page:10Showing 1–1 of 11"
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('main')
    9 × locator resolved to <main class="container flex-1 px-4 py-8">…</main>
      - unexpected value "WatchlistTrack symbols, market snapshots, news, and generate opportunities.My Watchlist(1)Opportunities(1)NewSymbolStrategyExpiry (DTE)StrikeLast pricePremiumEst. Return% RangeAssign. RiskEquityEventsOpp. StatusYour StatusActionsModerate Opportunities 1Balanced growth and income with moderate riskCBChubb LtdCovered CallSell to OpenOct 16, 20261 DTE$355.00$350.15$0.50(0.14%)+26.10%±1.87%23%236 sh@ $1,200.00EOct 20ActiveOct 14, 2026, 11:02 PMWatchingOct 15, 2026 @ $0.60Row actionsRows per page:10Showing 1–1 of 11"

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
          - heading "Watchlist" [level=1] [ref=e41]
          - paragraph [ref=e42]: Track symbols, market snapshots, news, and generate opportunities.
        - generic [ref=e43]:
          - generic [ref=e44]:
            - generic [ref=e45]:
              - tablist [ref=e46]:
                - tab "My Watchlist (1)" [ref=e47] [cursor=pointer]:
                  - text: My Watchlist
                  - generic [ref=e48]: (1)
                - tab "Opportunities (1)" [active] [selected] [ref=e49] [cursor=pointer]:
                  - text: Opportunities
                  - generic [ref=e50]: (1)
              - tabpanel "Opportunities (1)"
            - button "New" [ref=e52] [cursor=pointer]:
              - img
              - text: New
          - generic [ref=e53]:
            - table [ref=e56]:
              - rowgroup [ref=e57]:
                - row "Symbol Strategy Expiry (DTE) Strike Last price Premium * Premium per contract Est. Return % Range +/- % Range for Premium Assign. Risk AD ± 0.10×(score/4) Equity Events Opp. Status Shows if this opportunity is New, Updated, Active, or Closed. On Hold isn’t used yet. Your Status Opportunity watch (date and underlying price at watch time) plus matching option holdings (Buy/Sell aggregated across broker and manual). Actions" [ref=e58]:
                  - columnheader "Symbol" [ref=e59]:
                    - button "Symbol" [ref=e61]:
                      - text: Symbol
                      - img [ref=e62]
                  - columnheader "Strategy" [ref=e65]:
                    - button "Strategy" [ref=e67]:
                      - text: Strategy
                      - img [ref=e68]
                  - columnheader "Expiry (DTE)" [ref=e71]:
                    - button "Expiry (DTE)" [ref=e73]:
                      - text: Expiry (DTE)
                      - img [ref=e74]
                  - columnheader "Strike" [ref=e77]:
                    - button "Strike" [ref=e79]:
                      - text: Strike
                      - img [ref=e80]
                  - columnheader "Last price" [ref=e83]
                  - columnheader "Premium * Premium per contract" [ref=e84]:
                    - generic [ref=e85]:
                      - button "Premium" [ref=e86]:
                        - text: Premium
                        - img [ref=e87]
                      - button "* Premium per contract" [ref=e90]:
                        - img [ref=e91]
                  - columnheader "Est. Return" [ref=e93]:
                    - button "Est. Return" [ref=e95]:
                      - text: Est. Return
                      - img [ref=e96]
                  - columnheader "% Range +/- % Range for Premium" [ref=e99]:
                    - generic [ref=e100]:
                      - text: "% Range"
                      - button "+/- % Range for Premium" [ref=e101]:
                        - img [ref=e102]
                  - columnheader "Assign. Risk AD ± 0.10×(score/4)" [ref=e104]:
                    - generic [ref=e105]:
                      - button "Assign. Risk" [ref=e106]:
                        - text: Assign. Risk
                        - img [ref=e107]
                      - button "AD ± 0.10×(score/4)" [ref=e110]:
                        - img [ref=e111]
                  - columnheader "Equity" [ref=e113]
                  - columnheader "Events" [ref=e114]
                  - columnheader "Opp. Status Shows if this opportunity is New, Updated, Active, or Closed. On Hold isn’t used yet." [ref=e115]:
                    - generic [ref=e116]:
                      - text: Opp. Status
                      - button "Shows if this opportunity is New, Updated, Active, or Closed. On Hold isn’t used yet." [ref=e117]:
                        - img [ref=e118]
                  - columnheader "Your Status Opportunity watch (date and underlying price at watch time) plus matching option holdings (Buy/Sell aggregated across broker and manual)." [ref=e120]:
                    - generic [ref=e121]:
                      - text: Your Status
                      - button "Opportunity watch (date and underlying price at watch time) plus matching option holdings (Buy/Sell aggregated across broker and manual)." [ref=e122]:
                        - img [ref=e123]
                  - columnheader "Actions" [ref=e125]
              - rowgroup [ref=e126]:
                - row "Moderate Opportunities 1 Balanced growth and income with moderate risk" [ref=e127]:
                  - cell "Moderate Opportunities 1 Balanced growth and income with moderate risk" [ref=e128]:
                    - generic [ref=e129]:
                      - generic [ref=e130]: Moderate Opportunities 1
                      - generic [ref=e131]: Balanced growth and income with moderate risk
                - row "Moderate risk CB Chubb Ltd Covered Call Sell to Open Oct 16, 2026 1 DTE $355.00 $350.15 $0.50 (0.14%) +26.10% ±1.87% 23% 236 sh @ $1,200.00 Oct 20 Active Oct 14, 2026, 11:02 PM Watching Oct 15, 2026 @ $0.60 Row actions" [ref=e132]:
                  - cell "Moderate risk CB Chubb Ltd" [ref=e133]:
                    - generic [ref=e134]:
                      - generic "Moderate risk" [ref=e135]
                      - generic [ref=e136]:
                        - paragraph [ref=e137]: CB
                        - paragraph [ref=e138]: Chubb Ltd
                  - cell "Covered Call Sell to Open" [ref=e139]:
                    - paragraph [ref=e140]: Covered Call
                    - paragraph [ref=e141]: Sell to Open
                  - cell "Oct 16, 2026 1 DTE" [ref=e142]:
                    - paragraph [ref=e143]: Oct 16, 2026
                    - paragraph [ref=e144]: 1 DTE
                  - cell "$355.00" [ref=e145]
                  - cell "$350.15" [ref=e146]
                  - cell "$0.50 (0.14%)" [ref=e147]:
                    - paragraph [ref=e148]: $0.50
                    - paragraph [ref=e149]: (0.14%)
                  - cell "+26.10%" [ref=e150]
                  - cell "±1.87%" [ref=e151]
                  - cell "23%" [ref=e152]
                  - cell "236 sh @ $1,200.00" [ref=e153]:
                    - paragraph [ref=e154]: 236 sh
                    - paragraph [ref=e155]: "@ $1,200.00"
                  - cell "Oct 20" [ref=e156]:
                    - generic [ref=e158]:
                      - generic [ref=e159]: E
                      - generic [ref=e160]: Oct 20
                  - cell "Active Oct 14, 2026, 11:02 PM" [ref=e161]:
                    - generic [ref=e162]:
                      - generic [ref=e163]: Active
                      - paragraph [ref=e164]: Oct 14, 2026, 11:02 PM
                  - cell "Watching Oct 15, 2026 @ $0.60" [ref=e165]:
                    - generic [ref=e167]:
                      - generic [ref=e168]:
                        - img [ref=e170]
                        - generic [ref=e173]: Watching
                      - paragraph [ref=e174]: Oct 15, 2026 @ $0.60
                  - cell "Row actions" [ref=e175]:
                    - button "Row actions" [ref=e176] [cursor=pointer]:
                      - img
                      - generic [ref=e177]: Row actions
            - generic [ref=e178]:
              - generic [ref=e179]:
                - text: "Rows per page:"
                - combobox [ref=e180]:
                  - generic: "10"
                  - img
              - generic [ref=e181]:
                - paragraph [ref=e182]:
                  - text: Showing
                  - generic [ref=e183]: 1–1
                  - text: of 1
                - navigation "Pagination" [ref=e184]:
                  - button "First page" [disabled]:
                    - img
                  - button "Previous page" [disabled]:
                    - img
                  - button "Page 1" [ref=e185] [cursor=pointer]: "1"
                  - button "Next page" [disabled]:
                    - img
                  - button "Last page" [disabled]:
                    - img
    - contentinfo [ref=e186]:
      - generic [ref=e187]:
        - generic [ref=e188]:
          - paragraph [ref=e189]: © 2026 Ools Inc. All rights reserved.
          - navigation "Legal and support" [ref=e190]:
            - link "Privacy Policy" [ref=e192] [cursor=pointer]:
              - /url: /privacy-policy
            - generic [ref=e193]:
              - generic [ref=e194]: ·
              - link "Terms of Service" [ref=e195] [cursor=pointer]:
                - /url: /terms-of-services
            - generic [ref=e196]:
              - generic [ref=e197]: ·
              - link "Disclosures" [ref=e198] [cursor=pointer]:
                - /url: /disclosures
            - generic [ref=e199]:
              - generic [ref=e200]: ·
              - link "Risk Warning" [ref=e201] [cursor=pointer]:
                - /url: /risk-warning
            - generic [ref=e202]:
              - generic [ref=e203]: ·
              - link "OCC Options Disclosure" [ref=e204] [cursor=pointer]:
                - /url: https://www.theocc.com/company-information/documents-and-archives/options-disclosure-document
            - generic [ref=e205]:
              - generic [ref=e206]: ·
              - link "Contact" [ref=e207] [cursor=pointer]:
                - /url: /contact
        - paragraph [ref=e208]: Options trading involves substantial risk and is not suitable for all investors. Past performance does not guarantee future results.
  - region "Notifications alt+T"
  - alert [ref=e209]
```

# Test source

```ts
  635 |           ).first(),
  636 |           'Open covered call lesson'
  637 |         );
  638 | 
  639 |         await expect(
  640 |           page.locator(
  641 |             'main'
  642 |           )
  643 |         ).toContainText(
  644 |           /covered call|strike|shares/i,
  645 |           {
  646 |             timeout: 15000
  647 |           }
  648 |         );
  649 | 
  650 |         await safeClick(
  651 |           page.getByRole(
  652 |             'link',
  653 |             {
  654 |               name: /^strategy library$/i
  655 |             }
  656 |           ).first(),
  657 |           'Strategy library'
  658 |         );
  659 | 
  660 |         await expect(
  661 |           page.locator(
  662 |             'main'
  663 |           )
  664 |         ).toContainText(
  665 |           /covered call|strateg/i,
  666 |           {
  667 |             timeout: 15000
  668 |           }
  669 |         );
  670 |       }
  671 |     );
  672 | 
  673 |     test(
  674 |       'Watchlist opens a new list and cancels, then shows opportunities',
  675 |       async ({ page }) => {
  676 |         await openDashboard(
  677 |           page
  678 |         );
  679 | 
  680 |         await openPortfolioItem(
  681 |           page,
  682 |           /^watchlist$/i,
  683 |           'Watchlist'
  684 |         );
  685 | 
  686 |         await safeClick(
  687 |           page.getByRole(
  688 |             'button',
  689 |             {
  690 |               name: /^new$/i
  691 |             }
  692 |           ),
  693 |           'New watchlist'
  694 |         );
  695 | 
  696 |         const dialog =
  697 |           page.getByRole(
  698 |             'dialog'
  699 |           );
  700 | 
  701 |         await expect(
  702 |           dialog
  703 |         ).toContainText(
  704 |           /create watchlist|name/i
  705 |         );
  706 | 
  707 |         await safeClick(
  708 |           dialog.getByRole(
  709 |             'button',
  710 |             {
  711 |               name: /^cancel$/i
  712 |             }
  713 |           ),
  714 |           'Cancel new watchlist'
  715 |         );
  716 | 
  717 |         await expect(
  718 |           dialog
  719 |         ).toBeHidden();
  720 | 
  721 |         await safeClick(
  722 |           page.getByRole(
  723 |             'tab',
  724 |             {
  725 |               name: /^opportunities\b/i
  726 |             }
  727 |           ),
  728 |           'Watchlist opportunities'
  729 |         );
  730 | 
  731 |         await expect(
  732 |           page.locator(
  733 |             'main'
  734 |           )
> 735 |         ).toContainText(
      |           ^ Error: expect(locator).toContainText(expected) failed
  736 |           /no watched opportunities|browse opportunities/i
  737 |         );
  738 | 
  739 |         await safeClick(
  740 |           page.getByRole(
  741 |             'tab',
  742 |             {
  743 |               name: /^my watchlist\b/i
  744 |             }
  745 |           ),
  746 |           'My watchlist'
  747 |         );
  748 | 
  749 |         await expect(
  750 |           page.getByRole(
  751 |             'heading',
  752 |             {
  753 |               name: /^watchlist$/i
  754 |             }
  755 |           )
  756 |         ).toBeVisible();
  757 |       }
  758 |     );
  759 | 
  760 |     test(
  761 |       'Support changes ticket fields and status without submitting',
  762 |       async ({ page }) => {
  763 |         await openDashboard(
  764 |           page
  765 |         );
  766 | 
  767 |         await safeClick(
  768 |           page.getByRole(
  769 |             'link',
  770 |             {
  771 |               name: /^support$/i
  772 |             }
  773 |           ).first(),
  774 |           'Support'
  775 |         );
  776 | 
  777 |         const combos =
  778 |           page.locator(
  779 |             'main'
  780 |           ).getByRole(
  781 |             'combobox'
  782 |           );
  783 | 
  784 |         await safeClick(
  785 |           combos.nth(
  786 |             0
  787 |           ),
  788 |           'Ticket category'
  789 |         );
  790 | 
  791 |         await safeClick(
  792 |           page.getByRole(
  793 |             'option',
  794 |             {
  795 |               name: /^billing$/i
  796 |             }
  797 |           ),
  798 |           'Billing category'
  799 |         );
  800 | 
  801 |         await expect(
  802 |           combos.nth(
  803 |             0
  804 |           )
  805 |         ).toContainText(
  806 |           /billing/i
  807 |         );
  808 | 
  809 |         await safeClick(
  810 |           combos.nth(
  811 |             1
  812 |           ),
  813 |           'Ticket priority'
  814 |         );
  815 | 
  816 |         await safeClick(
  817 |           page.getByRole(
  818 |             'option',
  819 |             {
  820 |               name: /^low$/i
  821 |             }
  822 |           ),
  823 |           'Low priority'
  824 |         );
  825 | 
  826 |         await expect(
  827 |           combos.nth(
  828 |             1
  829 |           )
  830 |         ).toContainText(
  831 |           /^low$/i
  832 |         );
  833 | 
  834 |         const subject =
  835 |           page.getByRole(
```
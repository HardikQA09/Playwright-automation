# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: DashboardMoreScreens.spec.ts >> More dashboard screens >> Option chain strike count keeps calls and puts
- Location: tests\DashboardMoreScreens.spec.ts:229:9

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/^show$/i).first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText(/^show$/i).first()

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
            - generic [ref=e34]: "20"
          - button "QU" [ref=e35] [cursor=pointer]:
            - generic [ref=e37]: QU
    - main [ref=e38]:
      - generic [ref=e39]:
        - generic [ref=e40]:
          - heading "Options Research" [level=1] [ref=e41]
          - paragraph [ref=e42]: Search any symbol to explore option chains, expirations, and greeks.
        - generic [ref=e45]:
          - generic [ref=e47]:
            - text: Symbol
            - generic [ref=e48]:
              - img
              - combobox "Search company name or symbol" [disabled] [ref=e49]: AAPL
              - button "Clear Symbol" [disabled] [ref=e50]:
                - img [ref=e51]
          - button "Analyze" [disabled]
        - paragraph [ref=e125]: OolTool™ is a product of Ools Inc. OolTool is an AI Analytics Service providing scenarios and analytics based on volume trends and market dynamics. OOLS does not guarantee any scenario, as market conditions can change. OOLS does not provide custody, auto execution, or trade advice. All scenarios generated are for educating investors on risks and opportunities on their portfolio.
    - contentinfo [ref=e126]:
      - generic [ref=e127]:
        - generic [ref=e128]:
          - paragraph [ref=e129]: © 2026 Ools Inc. All rights reserved.
          - navigation "Legal and support" [ref=e130]:
            - link "Privacy Policy" [ref=e132] [cursor=pointer]:
              - /url: /privacy-policy
            - generic [ref=e133]:
              - generic [ref=e134]: ·
              - link "Terms of Service" [ref=e135] [cursor=pointer]:
                - /url: /terms-of-services
            - generic [ref=e136]:
              - generic [ref=e137]: ·
              - link "Disclosures" [ref=e138] [cursor=pointer]:
                - /url: /disclosures
            - generic [ref=e139]:
              - generic [ref=e140]: ·
              - link "Risk Warning" [ref=e141] [cursor=pointer]:
                - /url: /risk-warning
            - generic [ref=e142]:
              - generic [ref=e143]: ·
              - link "OCC Options Disclosure" [ref=e144] [cursor=pointer]:
                - /url: https://www.theocc.com/company-information/documents-and-archives/options-disclosure-document
            - generic [ref=e145]:
              - generic [ref=e146]: ·
              - link "Contact" [ref=e147] [cursor=pointer]:
                - /url: /contact
        - paragraph [ref=e148]: Options trading involves substantial risk and is not suitable for all investors. Past performance does not guarantee future results.
  - region "Notifications alt+T"
  - alert [ref=e149]
```

# Test source

```ts
  630 |             if (
  631 |               /latest news/i.test(
  632 |                 value
  633 |               ) &&
  634 |               value.length > 12 &&
  635 |               value.length < 5000
  636 |             ) {
  637 |               return value;
  638 |             }
  639 | 
  640 |             current =
  641 |               current.parentElement;
  642 |           }
  643 | 
  644 |           return node.textContent || '';
  645 |         }
  646 |       );
  647 | 
  648 |     expect(
  649 |       text
  650 |     ).toMatch(
  651 |       /latest news/i
  652 |     );
  653 | 
  654 |     expect(
  655 |       text
  656 |     ).toMatch(
  657 |       /[A-Za-z]{4,}|no news|no articles/i
  658 |     );
  659 | 
  660 |     Logger.success(
  661 |       'Latest news is shown'
  662 |     );
  663 |   }
  664 | 
  665 |   private labeledCombobox(
  666 |     label: RegExp
  667 |   ) {
  668 |     return this.page.getByText(
  669 |       label
  670 |     ).first().locator(
  671 |       'xpath=following::*[@role="combobox"][1]'
  672 |     );
  673 |   }
  674 | 
  675 |   private async expectChainHeaders() {
  676 |     await expect(
  677 |       this.page.getByText(
  678 |         /loading option chain/i
  679 |       )
  680 |     ).toBeHidden({
  681 |       timeout: 20000
  682 |     });
  683 | 
  684 |     await expect(
  685 |       this.page.getByRole(
  686 |         'columnheader',
  687 |         {
  688 |           name: /^calls$/i
  689 |         }
  690 |       )
  691 |     ).toBeVisible({
  692 |       timeout: 20000
  693 |     });
  694 | 
  695 |     await expect(
  696 |       this.page.getByRole(
  697 |         'columnheader',
  698 |         {
  699 |           name: /^puts$/i
  700 |         }
  701 |       )
  702 |     ).toBeVisible();
  703 | 
  704 |     await expect(
  705 |       this.page.getByRole(
  706 |         'columnheader',
  707 |         {
  708 |           name: /^strike$/i
  709 |         }
  710 |       ).first()
  711 |     ).toBeVisible();
  712 |   }
  713 | 
  714 |   async validateChainControls() {
  715 |     Logger.info(
  716 |       'Validating option chain controls'
  717 |     );
  718 | 
  719 |     await this.ensureSymbolResult();
  720 | 
  721 |     for (const label of [
  722 |       /expir(?:ation|y)(?:\s+date)?/i,
  723 |       /^show$/i,
  724 |       /strike count/i
  725 |     ]) {
  726 |       await expect(
  727 |         this.page.getByText(
  728 |           label
  729 |         ).first()
> 730 |       ).toBeVisible();
      |         ^ Error: expect(locator).toBeVisible() failed
  731 |     }
  732 | 
  733 |     const strikeCount =
  734 |       this.page.getByText(
  735 |         /^strike count$/i
  736 |       ).locator(
  737 |         'xpath=following::*[@role="combobox"][1]'
  738 |       );
  739 | 
  740 |     const before =
  741 |       this.firstLine(
  742 |         await strikeCount.innerText()
  743 |       );
  744 | 
  745 |     await safeClick(
  746 |       strikeCount,
  747 |       'Strike count'
  748 |     );
  749 | 
  750 |     const options =
  751 |       this.page.getByRole(
  752 |         'option'
  753 |       );
  754 | 
  755 |     await expect(
  756 |       options.first()
  757 |     ).toBeVisible({
  758 |       timeout: 8000
  759 |     });
  760 | 
  761 |     const count =
  762 |       await options.count();
  763 | 
  764 |     let picked = '';
  765 | 
  766 |     for (
  767 |       let index = 0;
  768 |       index < count;
  769 |       index += 1
  770 |     ) {
  771 |       const label =
  772 |         this.firstLine(
  773 |           await options.nth(
  774 |             index
  775 |           ).innerText()
  776 |         );
  777 | 
  778 |       if (
  779 |         label &&
  780 |         label !== before
  781 |       ) {
  782 |         picked = label;
  783 | 
  784 |         await safeClick(
  785 |           options.nth(
  786 |             index
  787 |           ),
  788 |           `Strike count ${label}`
  789 |         );
  790 | 
  791 |         break;
  792 |       }
  793 |     }
  794 | 
  795 |     if (
  796 |       picked
  797 |     ) {
  798 |       await expect(
  799 |         strikeCount
  800 |       ).toContainText(
  801 |         picked,
  802 |         {
  803 |           timeout: 10000
  804 |         }
  805 |       );
  806 |     }
  807 | 
  808 |     await expect(
  809 |       this.page.getByRole(
  810 |         'columnheader',
  811 |         {
  812 |           name: /^calls$/i
  813 |         }
  814 |       )
  815 |     ).toBeVisible({
  816 |       timeout: 15000
  817 |     });
  818 | 
  819 |     Logger.success(
  820 |       'Option chain controls keep the chain visible'
  821 |     );
  822 |   }
  823 | }
  824 | 
```
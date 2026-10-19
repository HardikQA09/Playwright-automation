# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: SubscriptionLifecycleExecution.spec.ts >> Subscription Lifecycle Execution >> Prepared paid user can preview billing interval change without submitting
- Location: tests\SubscriptionLifecycleExecution.spec.ts:139:9

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('dialog').or(getByRole('alertdialog')).filter({ hasText: /confirm your subscription|(?:Overlay Strategists|Overlay)|(?:switch|change).{0,80}(?:annual|monthly)|(?:annual|monthly|per month|per year|\/month|\/year)/i }).first()
Expected pattern: /credit for unused time/i
Received string:  "Confirm your subscriptionReview Overlay Strategists and accept the terms before continuing to payment.Founding Team's Beta PricingSave while helping us build OolTool — Beta pricing for the first 1,000 users.Note: OolTool is iteratively adding new features, new brokers and additional symbols.PlanOverlay StrategistsBilling frequencyannualPrice$790.00/yearTaxCalculated at checkoutTotal due today$790.00 USDNext renewal dateOctober 15, 2027This subscription renews automatically on October 15, 2027 at $790.00/year until you cancel. You can cancel any time from Billing.I agree to the Terms & Conditions, Privacy Policy and Refund & Cancellation Policy.CancelConfirm & pay $790.00Close"
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for getByRole('dialog').or(getByRole('alertdialog')).filter({ hasText: /confirm your subscription|(?:Overlay Strategists|Overlay)|(?:switch|change).{0,80}(?:annual|monthly)|(?:annual|monthly|per month|per year|\/month|\/year)/i }).first()
    9 × locator resolved to <div role="dialog" tabindex="-1" id="radix-_r_g_" data-state="open" aria-labelledby="radix-_r_h_" aria-describedby="radix-_r_i_" class="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2…>…</div>
      - unexpected value "Confirm your subscriptionReview Overlay Strategists and accept the terms before continuing to payment.Founding Team's Beta PricingSave while helping us build OolTool — Beta pricing for the first 1,000 users.Note: OolTool is iteratively adding new features, new brokers and additional symbols.PlanOverlay StrategistsBilling frequencyannualPrice$790.00/yearTaxCalculated at checkoutTotal due today$790.00 USDNext renewal dateOctober 15, 2027This subscription renews automatically on October 15, 2027 at $790.00/year until you cancel. You can cancel any time from Billing.I agree to the Terms & Conditions, Privacy Policy and Refund & Cancellation Policy.CancelConfirm & pay $790.00Close"

```

# Page snapshot

```yaml
- generic:
  - generic:
    - banner:
      - generic:
        - generic:
          - generic:
            - link:
              - /url: /dashboard
              - img
          - generic:
            - navigation:
              - link:
                - /url: /dashboard
                - text: Dashboard
              - link:
                - /url: /dashboard/opportunities
                - text: Opportunities
              - generic:
                - button:
                  - generic: Portfolio
                  - img
              - generic:
                - button:
                  - generic: Research
                  - img
              - link:
                - /url: /academy
                - text: Academy
              - link:
                - /url: /dashboard/support
                - text: Support
          - generic:
            - button: Delayed
            - button:
              - img
              - generic: Sync all
            - button:
              - img
            - button:
              - img
              - generic: "20"
            - button:
              - generic:
                - generic: QU
    - main:
      - generic:
        - generic:
          - heading [level=1]: Billing & Subscription
          - paragraph: Manage your plan, payment methods, and billing history.
        - generic:
          - tablist:
            - tab: Overview
            - tab [selected]: Plans
            - tab: History
          - tabpanel:
            - note:
              - generic:
                - generic:
                  - img
                - generic: Founding Team's Beta Pricing
              - generic:
                - paragraph: Save while helping us build OolTool — Beta pricing for the first 1,000 users.
                - paragraph: "Note: OolTool is iteratively adding new features, new brokers and additional symbols."
            - generic:
              - generic:
                - generic:
                  - img
                  - text: Change Plan
                - generic:
                  - button: Monthly
                  - button: Annual
              - generic:
                - generic:
                  - generic:
                    - generic:
                      - generic:
                        - paragraph: Curious
                      - paragraph: Explore your Portfolio
                      - generic:
                        - paragraph: Free
                    - list:
                      - listitem:
                        - img
                        - text: Manual Upload Only
                      - listitem:
                        - img
                        - text: Positions (10)
                      - listitem:
                        - img
                        - text: Simulations (10)
                      - listitem:
                        - img
                        - text: CTAs Refresh
                      - listitem:
                        - img
                        - text: Covered Calls
                      - listitem:
                        - img
                        - text: OOLS Score
                    - button:
                      - img
                      - text: Switch to Free
                  - generic:
                    - generic:
                      - generic:
                        - paragraph: Income
                      - paragraph: Build your Portfolio
                      - generic:
                        - generic:
                          - generic:
                            - paragraph:
                              - generic: $290
                              - generic: /year
                            - generic: Beta
                    - list:
                      - listitem:
                        - img
                        - text: Broker Integration (1)
                      - listitem:
                        - img
                        - text: Account Linked (1)
                      - listitem:
                        - img
                        - text: Positions (100)
                      - listitem:
                        - img
                        - text: CTAs Unlimited
                      - listitem:
                        - img
                        - text: Simulations Unlimited
                      - listitem:
                        - img
                        - text: Covered Calls/Puts CTAs
                      - listitem:
                        - img
                        - text: Earnings Notifications
                      - listitem:
                        - img
                        - text: Dividend Notifications
                      - listitem:
                        - img
                        - text: OOLS Score
                    - button:
                      - img
                      - text: Upgrade
                  - generic:
                    - generic:
                      - generic:
                        - paragraph: Overlay Strategists
                      - paragraph: Optimize your Portfolio
                      - generic:
                        - generic:
                          - generic:
                            - paragraph:
                              - generic: $790
                              - generic: /year
                            - generic: Beta
                    - list:
                      - listitem:
                        - img
                        - text: Broker Integration (5)
                      - listitem:
                        - img
                        - text: Account Linked (10)
                      - listitem:
                        - img
                        - text: Positions (500)
                      - listitem:
                        - img
                        - text: CTAs & Simulations Unlimited
                      - listitem:
                        - img
                        - text: Covered Calls/Puts CTAs
                      - listitem:
                        - img
                        - text: Earnings & Dividends Notifications
                      - listitem:
                        - img
                        - text: ITM/ATM resolve suggestions
                      - listitem:
                        - img
                        - text: Portfolio Analytics
                      - listitem:
                        - img
                        - text: Bulk Portfolio Load
                      - listitem:
                        - img
                        - text: OOLS Score
                    - button:
                      - img
                      - text: Upgrade
                  - generic:
                    - generic:
                      - generic:
                        - paragraph: Portfolio Hedger
                      - paragraph: Optimize your Portfolio
                      - generic:
                        - generic:
                          - generic:
                            - paragraph:
                              - generic: $1,490
                              - generic: /year
                            - generic: Beta
                    - list:
                      - listitem:
                        - img
                        - text: Broker Integration (10)
                      - listitem:
                        - img
                        - text: Account Linked (20)
                      - listitem:
                        - img
                        - text: Positions (1000)
                      - listitem:
                        - img
                        - text: CTAs & Simulations Unlimited
                      - listitem:
                        - img
                        - text: Covered Calls/Puts CTAs
                      - listitem:
                        - img
                        - text: Protective Puts
                      - listitem:
                        - img
                        - text: Option roll suggestions
                      - listitem:
                        - img
                        - text: Earnings & Dividends Notifications
                      - listitem:
                        - img
                        - text: ITM/ATM resolve suggestions
                      - listitem:
                        - img
                        - text: Portfolio Analytics
                      - listitem:
                        - img
                        - text: Bulk Portfolio Load
                      - listitem:
                        - img
                        - text: OOLS Score
                    - button:
                      - img
                      - text: Upgrade
                - paragraph: Upgrades and switching to annual take effect immediately - the prorated difference is charged to your card on file. Downgrades and switching to monthly are scheduled for your next renewal. Switching to the Free plan takes effect at the end of the period you have already paid for - you keep full access until then.
    - contentinfo:
      - generic:
        - generic:
          - paragraph: © 2026 Ools Inc. All rights reserved.
          - navigation:
            - generic:
              - link:
                - /url: /privacy-policy
                - text: Privacy Policy
            - generic:
              - generic: ·
              - link:
                - /url: /terms-of-services
                - text: Terms of Service
            - generic:
              - generic: ·
              - link:
                - /url: /disclosures
                - text: Disclosures
            - generic:
              - generic: ·
              - link:
                - /url: /risk-warning
                - text: Risk Warning
            - generic:
              - generic: ·
              - link:
                - /url: https://www.theocc.com/company-information/documents-and-archives/options-disclosure-document
                - text: OCC Options Disclosure
            - generic:
              - generic: ·
              - link:
                - /url: /contact
                - text: Contact
        - paragraph: Options trading involves substantial risk and is not suitable for all investors. Past performance does not guarantee future results.
  - region "Notifications alt+T"
  - alert
  - dialog "Confirm your subscription" [ref=e2]:
    - generic [ref=e3]:
      - heading "Confirm your subscription" [level=2] [ref=e4]:
        - img [ref=e5]
        - text: Confirm your subscription
      - paragraph [ref=e8]: Review Overlay Strategists and accept the terms before continuing to payment.
    - note [ref=e9]:
      - generic [ref=e10]:
        - img [ref=e12]
        - generic [ref=e15]: Founding Team's Beta Pricing
      - generic [ref=e17]:
        - paragraph [ref=e18]: Save while helping us build OolTool — Beta pricing for the first 1,000 users.
        - paragraph [ref=e19]: "Note: OolTool is iteratively adding new features, new brokers and additional symbols."
    - generic [ref=e20]:
      - generic [ref=e21]:
        - term [ref=e22]: Plan
        - definition [ref=e23]: Overlay Strategists
      - generic [ref=e24]:
        - term [ref=e25]: Billing frequency
        - definition [ref=e26]: annual
      - generic [ref=e27]:
        - term [ref=e28]: Price
        - definition [ref=e29]: $790.00/year
      - generic [ref=e30]:
        - term [ref=e31]: Tax
        - definition [ref=e32]: Calculated at checkout
      - generic [ref=e33]:
        - term [ref=e34]: Total due today
        - definition [ref=e35]: $790.00 USD
      - generic [ref=e36]:
        - term [ref=e37]: Next renewal date
        - definition [ref=e38]: October 15, 2027
    - paragraph [ref=e39]: This subscription renews automatically on October 15, 2027 at $790.00/year until you cancel. You can cancel any time from Billing.
    - generic [ref=e40] [cursor=pointer]:
      - checkbox "I agree to the Terms & Conditions" [active] [ref=e41]
      - generic [ref=e42]:
        - text: I agree to the
        - link "Terms & Conditions" [ref=e43]:
          - /url: /terms-of-services
        - text: ","
        - link "Privacy Policy" [ref=e44]:
          - /url: /privacy-policy
        - text: and
        - link "Refund & Cancellation Policy" [ref=e45]:
          - /url: /terms-of-services#cancellation
        - text: .
    - generic [ref=e46]:
      - button "Cancel" [ref=e47] [cursor=pointer]
      - button "Confirm & pay $790.00" [disabled]
    - button "Close" [ref=e48]:
      - img [ref=e49]
      - generic [ref=e52]: Close
```

# Test source

```ts
  1832 |     options.interval === 'annual'
  1833 |       ? showsMonthly && !showsAnnual
  1834 |       : showsAnnual && !showsMonthly;
  1835 | 
  1836 |   if (wrongInterval) {
  1837 |     await this.closePlanChangeCalculationPreview(
  1838 |       options
  1839 |     );
  1840 | 
  1841 |     await this.billingIntervalButton(
  1842 |       options.interval
  1843 |     ).click({
  1844 |       timeout: 8000
  1845 |     });
  1846 | 
  1847 |     await safeClick(
  1848 |       actionButton,
  1849 |       `${options.action} ${options.targetPlan} ${options.interval}`
  1850 |     );
  1851 | 
  1852 |     await expect(
  1853 |       dialog
  1854 |     ).toBeVisible({
  1855 |       timeout: 15000
  1856 |     });
  1857 |   }
  1858 | 
  1859 |   Logger.success(
  1860 |     `${options.action} calculation preview opened for ${options.targetPlan} ${options.interval}`
  1861 |   );
  1862 | }
  1863 | 
  1864 | async validatePlanChangeCalculationPreview(
  1865 |   options: {
  1866 |     targetPlan: string;
  1867 |     action: 'upgrade' | 'downgrade' | 'interval';
  1868 |     interval: 'monthly' | 'annual';
  1869 |     expectedBillingCopy?: RegExp;
  1870 |     expectedPlanCharge?: number;
  1871 |     expectedRecurringAmount?: number;
  1872 |   }
  1873 | ) {
  1874 |   Logger.info(
  1875 |     `Validating ${options.action} calculation preview for ${options.targetPlan} ${options.interval}`
  1876 |   );
  1877 | 
  1878 |   const dialog =
  1879 |     this.planChangeDialog(
  1880 |       options
  1881 |     );
  1882 | 
  1883 |   await expect(
  1884 |     dialog
  1885 |   ).toBeVisible({
  1886 |     timeout: 15000
  1887 |   });
  1888 | 
  1889 |   const dialogText =
  1890 |     await dialog.innerText();
  1891 | 
  1892 |   const scheduledChange =
  1893 |     /takes effect|no refund|end of (this|the) billing period|schedule downgrade/i.test(
  1894 |       dialogText
  1895 |     );
  1896 | 
  1897 |   await expect(
  1898 |     dialog
  1899 |   ).toContainText(
  1900 |     new RegExp(
  1901 |       `${options.action === 'interval'
  1902 |         ? `(?:upgrade|downgrade|switch|change)\\s+to|${this.planNamePattern(
  1903 |           options.targetPlan
  1904 |         )}`
  1905 |         : `${options.action}\\s+to\\s+(?:${this.planNamePattern(
  1906 |           options.targetPlan
  1907 |         )})`}`,
  1908 |       'i'
  1909 |     )
  1910 |   );
  1911 | 
  1912 |   if (scheduledChange) {
  1913 |     Logger.success(
  1914 |       `${options.action} calculation preview validated for ${options.targetPlan} ${options.interval}`
  1915 |     );
  1916 | 
  1917 |     return;
  1918 |   }
  1919 | 
  1920 |   // The proration quote loads after the dialog title appears; give it time.
  1921 |   await expect(
  1922 |     dialog
  1923 |   ).toContainText(
  1924 |     /prorat|charged|card on file|billing cycle|renews|new price|amount due/i,
  1925 |     {
  1926 |       timeout: 25000
  1927 |     }
  1928 |   );
  1929 | 
  1930 |   await expect(
  1931 |     dialog
> 1932 |   ).toContainText(
       |     ^ Error: expect(locator).toContainText(expected) failed
  1933 |     /credit for unused time/i
  1934 |   );
  1935 | 
  1936 |   await expect(
  1937 |     dialog
  1938 |   ).toContainText(
  1939 |     /amount due today/i
  1940 |   );
  1941 | 
  1942 |   await expect(
  1943 |     dialog
  1944 |   ).toContainText(
  1945 |     /new recurring amount/i
  1946 |   );
  1947 | 
  1948 |   await expect(
  1949 |     dialog
  1950 |   ).toContainText(
  1951 |     /next billing date/i
  1952 |   );
  1953 | 
  1954 |   if (options.expectedBillingCopy) {
  1955 |     await expect(
  1956 |       dialog
  1957 |     ).toContainText(
  1958 |       options.expectedBillingCopy
  1959 |     );
  1960 |   }
  1961 | 
  1962 |   await expect(
  1963 |     dialog.getByRole(
  1964 |       'checkbox'
  1965 |     ).first()
  1966 |   ).toBeVisible({
  1967 |     timeout: 10000
  1968 |   });
  1969 | 
  1970 |   await expect(
  1971 |     dialog.getByRole(
  1972 |       'button',
  1973 |       {
  1974 |         name: /confirm|pay|continue/i
  1975 |       }
  1976 |     ).first()
  1977 |   ).toBeVisible({
  1978 |     timeout: 10000
  1979 |   });
  1980 | 
  1981 |   const planCharge =
  1982 |     firstCurrencyValueNearLabel(
  1983 |       dialogText,
  1984 |       new RegExp(
  1985 |         `(?:${this.planNamePattern(
  1986 |           options.targetPlan
  1987 |         )})\\s+charge`,
  1988 |         'i'
  1989 |       )
  1990 |     );
  1991 | 
  1992 |   const unusedCredit =
  1993 |     firstCurrencyValueNearLabel(
  1994 |       dialogText,
  1995 |       /credit for unused time/i
  1996 |     );
  1997 | 
  1998 |   const amountDueToday =
  1999 |     firstCurrencyValueNearLabel(
  2000 |       dialogText,
  2001 |       /amount due today/i
  2002 |     );
  2003 | 
  2004 |   const newRecurringAmount =
  2005 |     firstCurrencyValueNearLabel(
  2006 |       dialogText,
  2007 |       /new recurring amount/i
  2008 |     );
  2009 | 
  2010 |   expect(
  2011 |     planCharge,
  2012 |     'Plan charge should be present in plan-change preview'
  2013 |   ).toBeDefined();
  2014 | 
  2015 |   expect(
  2016 |     unusedCredit,
  2017 |     'Unused-time credit should be present in plan-change preview'
  2018 |   ).toBeDefined();
  2019 | 
  2020 |   expect(
  2021 |     amountDueToday,
  2022 |     'Amount due today should be present in plan-change preview'
  2023 |   ).toBeDefined();
  2024 | 
  2025 |   expect(
  2026 |     newRecurringAmount,
  2027 |     'New recurring amount should be present in plan-change preview'
  2028 |   ).toBeDefined();
  2029 | 
  2030 |   if (options.expectedPlanCharge !== undefined) {
  2031 |     const comparableListPrice =
  2032 |       options.expectedPlanCharge;
```
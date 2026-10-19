# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: MonthlyAnnualBillingChangeMatrix.spec.ts >> Monthly To Annual Billing Change Use Case 5 Matrix >> SC-170 - Annual switch confirmation displays current monthly plan and target annual plan
- Location: tests\MonthlyAnnualBillingChangeMatrix.spec.ts:353:13

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('dialog').or(getByRole('alertdialog')).filter({ hasText: /confirm your subscription|(?:Income Builder|Income)|(?:switch|change).{0,80}(?:annual|monthly)|(?:annual|monthly|per month|per year|\/month|\/year)/i }).first()
Expected pattern: /credit for unused time/i
Received string:  "Confirm your subscriptionReview Income and accept the terms before continuing to payment.Founding Team's Beta PricingSave while helping us build OolTool — Beta pricing for the first 1,000 users.Note: OolTool is iteratively adding new features, new brokers and additional symbols.PlanIncomeBilling frequencyannualPrice$290.00/yearTaxCalculated at checkoutTotal due today$290.00 USDNext renewal dateOctober 15, 2027This subscription renews automatically on October 15, 2027 at $290.00/year until you cancel. You can cancel any time from Billing.I agree to the Terms & Conditions, Privacy Policy and Refund & Cancellation Policy.CancelConfirm & pay $290.00Close"
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for getByRole('dialog').or(getByRole('alertdialog')).filter({ hasText: /confirm your subscription|(?:Income Builder|Income)|(?:switch|change).{0,80}(?:annual|monthly)|(?:annual|monthly|per month|per year|\/month|\/year)/i }).first()
    9 × locator resolved to <div role="dialog" tabindex="-1" id="radix-_r_g_" data-state="open" aria-labelledby="radix-_r_h_" aria-describedby="radix-_r_i_" class="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2…>…</div>
      - unexpected value "Confirm your subscriptionReview Income and accept the terms before continuing to payment.Founding Team's Beta PricingSave while helping us build OolTool — Beta pricing for the first 1,000 users.Note: OolTool is iteratively adding new features, new brokers and additional symbols.PlanIncomeBilling frequencyannualPrice$290.00/yearTaxCalculated at checkoutTotal due today$290.00 USDNext renewal dateOctober 15, 2027This subscription renews automatically on October 15, 2027 at $290.00/year until you cancel. You can cancel any time from Billing.I agree to the Terms & Conditions, Privacy Policy and Refund & Cancellation Policy.CancelConfirm & pay $290.00Close"

```

# Test source

```ts
  1832 |       () => undefined
  1833 |     );
  1834 | 
  1835 |     await scopedButton.evaluate(
  1836 |       (element) => {
  1837 |         (element as HTMLButtonElement).click();
  1838 |       }
  1839 |     );
  1840 |   }
  1841 | 
  1842 |   await expect(
  1843 |     dialog
  1844 |   ).toBeVisible({
  1845 |     timeout: 15000
  1846 |   });
  1847 | 
  1848 |   const dialogText =
  1849 |     await dialog.innerText();
  1850 | 
  1851 |   const showsMonthly =
  1852 |     /\/month|per month/i.test(
  1853 |       dialogText
  1854 |     );
  1855 | 
  1856 |   const showsAnnual =
  1857 |     /\/year|per year/i.test(
  1858 |       dialogText
  1859 |     );
  1860 | 
  1861 |   const wrongInterval =
  1862 |     options.interval === 'annual'
  1863 |       ? showsMonthly && !showsAnnual
  1864 |       : showsAnnual && !showsMonthly;
  1865 | 
  1866 |   if (wrongInterval) {
  1867 |     await this.closePlanChangeCalculationPreview(
  1868 |       options
  1869 |     );
  1870 | 
  1871 |     await this.billingIntervalButton(
  1872 |       options.interval
  1873 |     ).click({
  1874 |       timeout: 8000
  1875 |     });
  1876 | 
  1877 |     await safeClick(
  1878 |       actionButton,
  1879 |       `${options.action} ${options.targetPlan} ${options.interval}`
  1880 |     );
  1881 | 
  1882 |     await expect(
  1883 |       dialog
  1884 |     ).toBeVisible({
  1885 |       timeout: 15000
  1886 |     });
  1887 |   }
  1888 | 
  1889 |   Logger.success(
  1890 |     `${options.action} calculation preview opened for ${options.targetPlan} ${options.interval}`
  1891 |   );
  1892 | }
  1893 | 
  1894 | async validatePlanChangeCalculationPreview(
  1895 |   options: {
  1896 |     targetPlan: string;
  1897 |     action: 'upgrade' | 'downgrade' | 'interval';
  1898 |     interval: 'monthly' | 'annual';
  1899 |     expectedBillingCopy?: RegExp;
  1900 |     expectedPlanCharge?: number;
  1901 |     expectedRecurringAmount?: number;
  1902 |   }
  1903 | ) {
  1904 |   Logger.info(
  1905 |     `Validating ${options.action} calculation preview for ${options.targetPlan} ${options.interval}`
  1906 |   );
  1907 | 
  1908 |   const dialog =
  1909 |     this.planChangeDialog(
  1910 |       options
  1911 |     );
  1912 | 
  1913 |   await expect(
  1914 |     dialog
  1915 |   ).toBeVisible({
  1916 |     timeout: 15000
  1917 |   });
  1918 | 
  1919 |   const dialogText =
  1920 |     await dialog.innerText();
  1921 | 
  1922 |   const scheduledChange =
  1923 |     /takes effect|no refund|end of (this|the) billing period|schedule downgrade/i.test(
  1924 |       dialogText
  1925 |     );
  1926 | 
  1927 |   await expect(
  1928 |     dialog
  1929 |   ).toContainText(
  1930 |     new RegExp(
  1931 |       `${options.action === 'interval'
> 1932 |         ? `(?:upgrade|downgrade|switch|change)\\s+to|${this.planNamePattern(
       |     ^ Error: expect(locator).toContainText(expected) failed
  1933 |           options.targetPlan
  1934 |         )}`
  1935 |         : `${options.action}\\s+to\\s+(?:${this.planNamePattern(
  1936 |           options.targetPlan
  1937 |         )})`}`,
  1938 |       'i'
  1939 |     )
  1940 |   );
  1941 | 
  1942 |   if (scheduledChange) {
  1943 |     Logger.success(
  1944 |       `${options.action} calculation preview validated for ${options.targetPlan} ${options.interval}`
  1945 |     );
  1946 | 
  1947 |     return;
  1948 |   }
  1949 | 
  1950 |   // The proration quote loads after the dialog title appears; give it time.
  1951 |   await expect(
  1952 |     dialog
  1953 |   ).toContainText(
  1954 |     /prorat|charged|card on file|billing cycle|renews|new price|amount due/i,
  1955 |     {
  1956 |       timeout: 25000
  1957 |     }
  1958 |   );
  1959 | 
  1960 |   await expect(
  1961 |     dialog
  1962 |   ).toContainText(
  1963 |     /credit for unused time/i
  1964 |   );
  1965 | 
  1966 |   await expect(
  1967 |     dialog
  1968 |   ).toContainText(
  1969 |     /amount due today/i
  1970 |   );
  1971 | 
  1972 |   await expect(
  1973 |     dialog
  1974 |   ).toContainText(
  1975 |     /new recurring amount/i
  1976 |   );
  1977 | 
  1978 |   await expect(
  1979 |     dialog
  1980 |   ).toContainText(
  1981 |     /next billing date/i
  1982 |   );
  1983 | 
  1984 |   if (options.expectedBillingCopy) {
  1985 |     await expect(
  1986 |       dialog
  1987 |     ).toContainText(
  1988 |       options.expectedBillingCopy
  1989 |     );
  1990 |   }
  1991 | 
  1992 |   await expect(
  1993 |     dialog.getByRole(
  1994 |       'checkbox'
  1995 |     ).first()
  1996 |   ).toBeVisible({
  1997 |     timeout: 10000
  1998 |   });
  1999 | 
  2000 |   await expect(
  2001 |     dialog.getByRole(
  2002 |       'button',
  2003 |       {
  2004 |         name: /confirm|pay|continue/i
  2005 |       }
  2006 |     ).first()
  2007 |   ).toBeVisible({
  2008 |     timeout: 10000
  2009 |   });
  2010 | 
  2011 |   const planCharge =
  2012 |     firstCurrencyValueNearLabel(
  2013 |       dialogText,
  2014 |       new RegExp(
  2015 |         `(?:${this.planNamePattern(
  2016 |           options.targetPlan
  2017 |         )})\\s+charge`,
  2018 |         'i'
  2019 |       )
  2020 |     );
  2021 | 
  2022 |   const unusedCredit =
  2023 |     firstCurrencyValueNearLabel(
  2024 |       dialogText,
  2025 |       /credit for unused time/i
  2026 |     );
  2027 | 
  2028 |   const amountDueToday =
  2029 |     firstCurrencyValueNearLabel(
  2030 |       dialogText,
  2031 |       /amount due today/i
  2032 |     );
```
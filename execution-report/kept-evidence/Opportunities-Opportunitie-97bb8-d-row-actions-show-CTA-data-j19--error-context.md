# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: Opportunities.spec.ts >> Opportunities >> Opportunity tabs filters and row actions show CTA data
- Location: tests\Opportunities.spec.ts:41:9

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('columnheader', { name: /^symbol/i }).first()
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByRole('columnheader', { name: /^symbol/i }).first()

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
        - generic [ref=e68]:
          - generic [ref=e70]:
            - generic [ref=e71]:
              - img [ref=e72]
              - generic [ref=e74]: "Your risk:"
              - generic [ref=e75]: Moderate (4–6)
              - generic [ref=e76]: ·
              - link "Details →" [ref=e77] [cursor=pointer]:
                - /url: /dashboard/risk-compliance
            - generic [ref=e78]:
              - button "Conservative (1–3) 0" [active] [pressed] [ref=e79]:
                - generic [ref=e81]:
                  - text: Conservative
                  - generic [ref=e82]: (1–3)
                - generic [ref=e83]: "0"
              - button "Moderate (4–6) 0" [pressed] [ref=e84]:
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
              - generic [ref=e106]: Viewing Moderate and Conservative risk
              - generic [ref=e107]: ·
              - link "Change profile →" [ref=e108] [cursor=pointer]:
                - /url: /dashboard/risk-compliance
          - generic [ref=e109]:
            - paragraph [ref=e110]:
              - img [ref=e111]
              - generic [ref=e113]: You are viewing Moderate (your profile) and Conservative opportunities. CTAs are colored by risk category.
            - button "Return to My Risk" [ref=e114] [cursor=pointer]
        - generic [ref=e115]:
          - generic [ref=e116]:
            - generic [ref=e117]: Growth risk
            - generic [ref=e119]: Moderate risk
            - generic [ref=e121]: Aggressive risk
            - generic [ref=e123]: Conservative risk
            - generic [ref=e125]:
              - generic [ref=e126]: E
              - text: Earnings
            - generic [ref=e127]:
              - generic [ref=e128]: D
              - text: Dividend
            - generic [ref=e129]:
              - img [ref=e130]
              - text: Watching (opportunity watch)
            - generic [ref=e133]:
              - generic [ref=e134]: P
              - text: Position Taken (in Your Status)
            - button "Legend notes" [ref=e135]:
              - img [ref=e136]
          - generic [ref=e138]:
            - generic [ref=e139]: "Sort by:"
            - combobox [ref=e140]:
              - generic: Expiry (Soonest)
              - img
        - generic [ref=e142]: No opportunities found.
        - generic [ref=e144]:
          - text: "Rows per page:"
          - combobox [ref=e145]:
            - generic: "10"
            - img
    - contentinfo [ref=e146]:
      - generic [ref=e147]:
        - generic [ref=e148]:
          - paragraph [ref=e149]: © 2026 Ools Inc. All rights reserved.
          - navigation "Legal and support" [ref=e150]:
            - link "Privacy Policy" [ref=e152] [cursor=pointer]:
              - /url: /privacy-policy
            - generic [ref=e153]:
              - generic [ref=e154]: ·
              - link "Terms of Service" [ref=e155] [cursor=pointer]:
                - /url: /terms-of-services
            - generic [ref=e156]:
              - generic [ref=e157]: ·
              - link "Disclosures" [ref=e158] [cursor=pointer]:
                - /url: /disclosures
            - generic [ref=e159]:
              - generic [ref=e160]: ·
              - link "Risk Warning" [ref=e161] [cursor=pointer]:
                - /url: /risk-warning
            - generic [ref=e162]:
              - generic [ref=e163]: ·
              - link "OCC Options Disclosure" [ref=e164] [cursor=pointer]:
                - /url: https://www.theocc.com/company-information/documents-and-archives/options-disclosure-document
            - generic [ref=e165]:
              - generic [ref=e166]: ·
              - link "Contact" [ref=e167] [cursor=pointer]:
                - /url: /contact
        - paragraph [ref=e168]: Options trading involves substantial risk and is not suitable for all investors. Past performance does not guarantee future results.
  - region "Notifications alt+T"
  - alert [ref=e169]
```

# Test source

```ts
  1115 |     if (
  1116 |       !symbol
  1117 |     ) {
  1118 |       throw new Error(
  1119 |         'Opportunity row did not include a symbol.'
  1120 |       );
  1121 |     }
  1122 | 
  1123 |     return symbol;
  1124 |   }
  1125 | 
  1126 |   async selectFilter(
  1127 |     current: RegExp,
  1128 |     option: RegExp
  1129 |   ) {
  1130 |     const combo =
  1131 |       this.page.locator(
  1132 |         'main'
  1133 |       ).getByRole(
  1134 |         'combobox'
  1135 |       ).filter({
  1136 |         hasText: current
  1137 |       }).first();
  1138 | 
  1139 |     await safeClick(
  1140 |       combo,
  1141 |       'Opportunity filter'
  1142 |     );
  1143 | 
  1144 |     await safeClick(
  1145 |       this.page.getByRole(
  1146 |         'option',
  1147 |         {
  1148 |           name: option
  1149 |         }
  1150 |       ).first(),
  1151 |       'Filter value'
  1152 |     );
  1153 | 
  1154 |     await expect(
  1155 |       this.page.locator(
  1156 |         'main'
  1157 |       ).getByRole(
  1158 |         'combobox'
  1159 |       ).filter({
  1160 |         hasText: option
  1161 |       }).first()
  1162 |     ).toBeVisible();
  1163 |   }
  1164 | 
  1165 |   private async applyStrategyFilter(
  1166 |     choice: RegExp
  1167 |   ) {
  1168 |     await safeClick(
  1169 |       this.page.getByRole(
  1170 |         'combobox'
  1171 |       ).filter({
  1172 |         hasText: /all strategies|covered call|cash secured put|protective put|long call/i
  1173 |       }).first(),
  1174 |       'Strategy filter'
  1175 |     );
  1176 | 
  1177 |     await safeClick(
  1178 |       this.page.getByRole(
  1179 |         'option',
  1180 |         {
  1181 |           name: choice
  1182 |         }
  1183 |       ).or(
  1184 |         this.page.getByRole(
  1185 |           'menuitem',
  1186 |           {
  1187 |             name: choice
  1188 |           }
  1189 |         )
  1190 |       ).first(),
  1191 |       'Choose strategy'
  1192 |     );
  1193 |   }
  1194 | 
  1195 |   private async validateTable(
  1196 |     tabLabel: string
  1197 |   ) {
  1198 |     for (const header of [
  1199 |       /^symbol/i,
  1200 |       /^strategy/i,
  1201 |       /expiry/i,
  1202 |       /^strike/i,
  1203 |       /last price/i,
  1204 |       /^premium/i,
  1205 |       /est\.?\s*return/i,
  1206 |       /assign\.?\s*risk/i
  1207 |     ]) {
  1208 |       await expect(
  1209 |         this.page.getByRole(
  1210 |           'columnheader',
  1211 |           {
  1212 |             name: header
  1213 |           }
  1214 |         ).first()
> 1215 |       ).toBeVisible({
       |         ^ Error: expect(locator).toBeVisible() failed
  1216 |         timeout: 15000
  1217 |       });
  1218 |     }
  1219 | 
  1220 |     const empty =
  1221 |       /\)\s*0\s*$/.test(
  1222 |         tabLabel
  1223 |       );
  1224 | 
  1225 |     if (
  1226 |       !empty
  1227 |     ) {
  1228 |       await expect(
  1229 |         this.page.locator(
  1230 |           'main'
  1231 |         )
  1232 |       ).toContainText(
  1233 |         /\$[\d,]+(?:\.\d+)?/
  1234 |       );
  1235 |     }
  1236 |   }
  1237 | }
  1238 | 
```
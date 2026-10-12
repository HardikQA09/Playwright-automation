# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ProfileSecurityDisplay.spec.ts >> Profile Security Display >> Profile security MFA backup codes trusted devices and refresh
- Location: tests\ProfileSecurityDisplay.spec.ts:50:9

# Error details

```
Error: Could not locate user Security / MFA settings page.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - heading "404" [level=1] [ref=e3]
    - paragraph [ref=e4]: Page not found
    - link "Go Home" [ref=e5] [cursor=pointer]:
      - /url: /
  - region "Notifications alt+T"
  - alert [ref=e6]
```

# Test source

```ts
  166 | 
  167 |     if (
  168 |       await securitySignal().isVisible({
  169 |         timeout: 5000
  170 |       }).catch(
  171 |         () => false
  172 |       )
  173 |     ) {
  174 |       Logger.success(
  175 |         'Security settings opened from the account menu'
  176 |       );
  177 | 
  178 |       return;
  179 |     }
  180 | 
  181 |     const routes =
  182 |       [
  183 |         '/dashboard/profile',
  184 |         '/dashboard/settings',
  185 |         '/dashboard/account',
  186 |         '/dashboard/profile/security',
  187 |         '/dashboard/account/security'
  188 |       ];
  189 | 
  190 |     for (const route of routes) {
  191 |       await openAuthenticatedPath(
  192 |         this.page,
  193 |         route,
  194 |         new RegExp(
  195 |           route.replace(
  196 |             /[.*+?^${}()|[\]\\]/g,
  197 |             '\\$&'
  198 |           )
  199 |         )
  200 |       ).catch(
  201 |         async () => {
  202 |           await this.page.goto(
  203 |             `${BASE_URL}${route}`,
  204 |             {
  205 |               waitUntil: 'domcontentloaded'
  206 |             }
  207 |           );
  208 |         }
  209 |       );
  210 | 
  211 |       await dismissOverlays(
  212 |         this.page
  213 |       );
  214 | 
  215 |       const securityTab =
  216 |         this.page.getByRole(
  217 |           'tab',
  218 |           {
  219 |             name: /security/i
  220 |           }
  221 |         ).or(
  222 |           this.page.getByRole(
  223 |             'link',
  224 |             {
  225 |               name: /^security$/i
  226 |             }
  227 |           )
  228 |         ).or(
  229 |           this.page.getByRole(
  230 |             'button',
  231 |             {
  232 |               name: /^security$/i
  233 |             }
  234 |           )
  235 |         );
  236 | 
  237 |       if (
  238 |         await securityTab.first().isVisible({
  239 |           timeout: 3000
  240 |         }).catch(() => false)
  241 |       ) {
  242 |         await safeClick(
  243 |           securityTab.first(),
  244 |           'Open Security Tab'
  245 |         );
  246 |       }
  247 | 
  248 |       const securitySignal =
  249 |         this.page.getByText(
  250 |           /two-factor authentication|two-factor|mfa|2fa|multi-factor|authenticator|backup codes|trusted devices/i
  251 |         ).first();
  252 | 
  253 |       if (
  254 |         await securitySignal.isVisible({
  255 |           timeout: 15000
  256 |         }).catch(() => false)
  257 |       ) {
  258 |         Logger.success(
  259 |           `Security settings opened: ${route}`
  260 |         );
  261 | 
  262 |         return;
  263 |       }
  264 |     }
  265 | 
> 266 |     throw new Error(
      |           ^ Error: Could not locate user Security / MFA settings page.
  267 |       'Could not locate user Security / MFA settings page.'
  268 |     );
  269 |   }
  270 | 
  271 |   async startEnableMfa() {
  272 | 
  273 |     await safeClick(
  274 |       this.page.getByRole(
  275 |         'button',
  276 |         {
  277 |           name: /enable.*authenticator|enable.*authenticator app|enable.*mfa|enable.*2fa|enable.*two-factor|set up.*authenticator|setup.*authenticator/i
  278 |         }
  279 |       ).or(
  280 |         this.page.getByText(
  281 |           /enable.*authenticator|enable.*authenticator app|enable.*mfa|enable.*2fa|set up.*authenticator/i
  282 |         )
  283 |       ).first(),
  284 |       'Enable MFA'
  285 |     );
  286 |   }
  287 | 
  288 |   async expectMfaSetupScreenVisible() {
  289 | 
  290 |     const setupSignal =
  291 |       this.page.getByText(
  292 |         /scan|qr|authenticator app|verification code|verify\s*&\s*enable|verify and enable|setup key|secret/i
  293 |       ).first();
  294 | 
  295 |     await expect(
  296 |       setupSignal
  297 |     ).toBeVisible({
  298 |       timeout: 15000
  299 |     });
  300 | 
  301 |     Logger.success(
  302 |       'MFA setup screen is visible'
  303 |     );
  304 |   }
  305 | 
  306 |   async expectMfaDisabledBeforeEnable() {
  307 | 
  308 |     await expect(
  309 |       this.page.getByRole(
  310 |         'button',
  311 |         {
  312 |           name: /enable.*authenticator|enable.*authenticator app|enable.*mfa|enable.*2fa|enable.*two-factor|set up.*authenticator|setup.*authenticator/i
  313 |         }
  314 |       ).or(
  315 |         this.page.getByText(
  316 |           /enable.*authenticator|enable.*authenticator app|enable.*mfa|enable.*2fa|set up.*authenticator/i
  317 |         )
  318 |       ).first()
  319 |     ).toBeVisible({
  320 |       timeout: 15000
  321 |     });
  322 | 
  323 |     await expect(
  324 |       this.page.getByText(
  325 |         /current method:\s*authenticator app|disable 2fa|regenerate backup codes/i
  326 |       ).first()
  327 |     ).not.toBeVisible({
  328 |       timeout: 3000
  329 |     });
  330 |   }
  331 | 
  332 |   async assertMfaChallengeVisible() {
  333 | 
  334 |     await expect(
  335 |       this.page.getByText(
  336 |         /mfa|2fa|two-factor|multi-factor|verification code|authenticator|backup code/i
  337 |       ).first()
  338 |     ).toBeVisible({
  339 |       timeout: 30000
  340 |     });
  341 |   }
  342 | 
  343 |   async readVisibleSecret() {
  344 | 
  345 |     const otpauthLocator =
  346 |       this.page.locator(
  347 |         'a[href^="otpauth://"], img[src*="otpauth"], [data-secret], input[value]'
  348 |       );
  349 | 
  350 |     const count =
  351 |       await otpauthLocator.count();
  352 | 
  353 |     for (let index = 0; index < count; index++) {
  354 |       const element =
  355 |         otpauthLocator.nth(index);
  356 | 
  357 |       const attributes =
  358 |         [
  359 |           await element.getAttribute('data-secret'),
  360 |           await element.getAttribute('href'),
  361 |           await element.getAttribute('src'),
  362 |           await element.getAttribute('value')
  363 |         ];
  364 | 
  365 |       for (const attribute of attributes) {
  366 |         const secret =
```
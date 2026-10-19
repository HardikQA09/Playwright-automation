import {
  expect,
  Locator,
  Page
} from '@playwright/test';

import {
  BASE_URL
} from '../config/testData';

import {
  boxesOverlap,
  toHexColor
} from '../helpers/chartGeometry';
import type {
  ChartBox
} from '../helpers/chartGeometry';
import {
  openHeaderMenuItem
} from '../helpers/safeClick';
import { Logger }
  from '../utils/logger';

/* =============================================================================
PAGE OBJECT: DashboardUiStoryPage

PURPOSE
-------
Validates the dashboard UI story: pie hover layout, Beta Performance
relocation, Analytics provider copy, and asset-type colors.
============================================================================= */

export type PaletteEntry = {
  label: string;
  hex: string;
};

export type PieHoverLayout = {
  category: {
    text: string;
    box: ChartBox;
  } | null;
  value: {
    text: string;
    box: ChartBox;
  } | null;
  percent: {
    text: string;
    box: ChartBox;
  } | null;
  centerTotal: {
    text: string;
    box: ChartBox;
  } | null;
  tooltipVisible: boolean;
};

export class DashboardUiStoryPage {
  constructor(
    private readonly page: Page
  ) {}

  allocationHeading() {
    return this.page.getByRole(
      'heading',
      {
        name: /asset allocation/i
      }
    ).first();
  }

  performanceHeading() {
    return this.page.getByRole(
      'heading',
      {
        name: /ooltool performance/i
      }
    ).or(
      this.page.getByText(
        /^ooltool performance$/i
      )
    );
  }

  async expectPerformanceAbsentFromDashboard() {
    Logger.info(
      'Checking that OolTool Performance is not on the dashboard'
    );

    await expect(
      this.allocationHeading()
    ).toBeVisible({
      timeout: 20000
    });

    await expect(
      this.performanceHeading()
    ).toHaveCount(
      0
    );

    const mainText =
      await this.page.locator(
        'main'
      ).innerText();

    expect(
      mainText,
      'Dashboard main content should not include an OolTool Performance widget'
    ).not.toMatch(
      /ooltool performance/i
    );

    Logger.success(
      'OolTool Performance is not on the dashboard'
    );
  }

  async openBetaPerformance() {
    Logger.info(
      'Opening OolTool Performance from the Beta menu'
    );

    const betaControl =
      this.page.getByRole(
        'button',
        {
          name: /^beta$/i
        }
      ).or(
        this.page.getByRole(
          'link',
          {
            name: /^beta$/i
          }
        )
      ).first();

    await expect(
      betaControl,
      'Beta should be in the post-sign-in navigation so Performance can live there'
    ).toBeVisible({
      timeout: 8000
    });

    await openHeaderMenuItem(
      this.page,
      /^beta$/i,
      /performance/i,
      'Beta > Performance'
    );

    await expect(
      this.page
    ).toHaveURL(
      /performance|beta/i,
      {
        timeout: 15000
      }
    );

    await expect(
      this.page.getByRole(
        'heading',
        {
          name: /performance/i
        }
      ).first()
    ).toBeVisible({
      timeout: 15000
    });

    Logger.success(
      'Beta menu opened OolTool Performance'
    );
  }

  async readAssetTypePalette() {
    await expect(
      this.allocationHeading()
    ).toBeVisible({
      timeout: 20000
    });

    await this.allocationHeading().scrollIntoViewIfNeeded();

    const raw =
      await this.page.evaluate(
        () => {
          const heading =
            [...document.querySelectorAll(
              'h1,h2,h3,h4'
            )].find(
              (node) =>
                /asset allocation/i.test(
                  node.textContent || ''
                )
            );

          if (!heading) {
            return {
              legend: [] as Array<{
                label: string;
                bg: string;
              }>,
              pie: [] as string[]
            };
          }

          let root =
            heading.parentElement;

          while (root) {
            const svg =
              root.querySelector(
                'svg'
              );

            if (svg) {
              const pie =
                [...svg.querySelectorAll(
                  'path'
                )]
                  .map(
                    (path) =>
                      path.getAttribute(
                        'fill'
                      ) || ''
                  )
                  .filter(
                    (fill) =>
                      fill &&
                      fill !== 'none' &&
                      fill.toLowerCase() !== '#fff' &&
                      fill.toLowerCase() !== '#ffffff'
                  );

              const legend: Array<{
                label: string;
                bg: string;
              }> = [];

              for (const node of [...root.querySelectorAll(
                '*'
              )]) {
                const box =
                  node.getBoundingClientRect();

                if (
                  box.width < 8 ||
                  box.width > 28 ||
                  box.height < 8 ||
                  box.height > 28
                ) {
                  continue;
                }

                const bg =
                  getComputedStyle(
                    node as HTMLElement
                  ).backgroundColor;

                const nearby =
                  (
                    node.parentElement?.innerText ||
                    ''
                  )
                    .replace(
                      /\s+/g,
                      ' '
                    )
                    .trim();

                const named =
                  nearby.match(
                    /\b(equity|cash|options)\b/i
                  );

                if (
                  !named ||
                  bg === 'rgba(0, 0, 0, 0)'
                ) {
                  continue;
                }

                legend.push({
                  label: named[1],
                  bg
                });
              }

              const uniqueLegend =
                Object.values(
                  legend.reduce(
                    (
                      map: Record<string, {
                        label: string;
                        bg: string;
                      }>,
                      entry
                    ) => {
                      const key =
                        entry.label.toLowerCase();

                      if (!map[key]) {
                        map[key] =
                          entry;
                      }

                      return map;
                    },
                    {}
                  )
                );

              return {
                legend: uniqueLegend,
                pie
              };
            }

            root =
              root.parentElement;
          }

          return {
            legend: [] as Array<{
              label: string;
              bg: string;
            }>,
            pie: [] as string[]
          };
        }
      );

    const legend: PaletteEntry[] =
      raw.legend
        .map(
          (entry) => ({
            label: entry.label,
            hex: toHexColor(
              entry.bg
            )
          })
        )
        .filter(
          (entry) =>
            entry.hex
        );

    const pie =
      [...new Set(
        raw.pie
          .map(
            (fill) =>
              toHexColor(
                fill
              )
          )
          .filter(
            Boolean
          )
      )];

    return {
      legend,
      pie
    };
  }

  async expectAssetTypePaletteConsistent() {
    Logger.info(
      'Checking asset-type colors on the allocation pie and legend'
    );

    const palette =
      await this.readAssetTypePalette();

    expect(
      palette.legend.length,
      'Asset Allocation legend should include Equity, Cash, and Options'
    ).toBeGreaterThanOrEqual(
      3
    );

    expect(
      palette.pie.length,
      'Asset Allocation pie should use a distinct fill per asset type'
    ).toBeGreaterThanOrEqual(
      3
    );

    const legendHexes =
      palette.legend.map(
        (entry) =>
          entry.hex
      );

    expect(
      new Set(
        legendHexes
      ).size,
      `Legend colors should be unique: ${JSON.stringify(palette.legend)}`
    ).toBe(
      legendHexes.length
    );

    expect(
      new Set(
        palette.pie
      ).size,
      `Pie fills should be unique: ${palette.pie.join(', ')}`
    ).toBe(
      palette.pie.length
    );

    for (const entry of palette.legend) {
      expect(
        palette.pie,
        `Pie slices should include legend color ${entry.label} ${entry.hex}`
      ).toContain(
        entry.hex
      );
    }

    Logger.success(
      `Asset-type colors: ${palette.legend
        .map(
          (entry) =>
            `${entry.label}=${entry.hex}`
        )
        .join(
          ', '
        )}`
    );
  }

  private slicePath(
    fill: string
  ): Locator {
    return this.page.locator(
      `svg path[fill="${fill}"], svg path[fill="${fill.toUpperCase()}"]`
    ).first();
  }

  async hoverAllocationSlice(
    fill: string
  ) {
    const path =
      this.slicePath(
        fill
      );

    await path.scrollIntoViewIfNeeded();

    await path.hover({
      force: true
    });

    const tooltip =
      this.page.locator(
        '.recharts-tooltip-wrapper'
      ).filter({
        hasText: /equity|cash|options|\$/i
      });

    await expect(
      tooltip
    ).toBeVisible({
      timeout: 5000
    }).catch(
      async () => {
        await path.hover({
          force: true,
          position: {
            x: 8,
            y: 8
          }
        });

        await expect(
          tooltip
        ).toBeVisible({
          timeout: 5000
        });
      }
    );
  }

  async readPieHoverLayout(
    fill: string
  ): Promise<PieHoverLayout> {
    await this.hoverAllocationSlice(
      fill
    );

    return this.page.evaluate(
      () => {
        const asBox = (
          rect: DOMRect
        ): ChartBox => ({
          x: rect.x,
          y: rect.y,
          w: rect.width,
          h: rect.height
        });

        const tooltip =
          document.querySelector(
            '.recharts-tooltip-wrapper'
          ) as HTMLElement | null;

        const tooltipVisible =
          !!tooltip &&
          tooltip.getBoundingClientRect().width > 0 &&
          getComputedStyle(
            tooltip
          ).visibility !== 'hidden' &&
          getComputedStyle(
            tooltip
          ).opacity !== '0';

        const lines =
          tooltipVisible
            ? [...tooltip.querySelectorAll(
              'p,span,div,li'
            )]
              .filter(
                (node) =>
                  node.childElementCount === 0 &&
                  (node.textContent || '').trim()
              )
              .map(
                (node) => ({
                  text: (node.textContent || '')
                    .replace(
                      /\s+/g,
                      ' '
                    )
                    .trim(),
                  box: asBox(
                    node.getBoundingClientRect()
                  )
                })
              )
            : [];

        const overlay =
          [...document.querySelectorAll(
            'h1,h2,h3,h4'
          )]
            .find(
              (node) =>
                /asset allocation/i.test(
                  node.textContent || ''
                )
            );

        let centerTotal: {
          text: string;
          box: ChartBox;
        } | null =
          null;

        if (overlay) {
          let root =
            overlay.parentElement;

          while (root) {
            const center =
              [...root.querySelectorAll(
                'p,span,div'
              )].find(
                (node) =>
                  /\$[\d,.]+[kmb]?/i.test(
                    node.textContent || ''
                  ) &&
                  /total/i.test(
                    node.textContent || ''
                  )
              );

            if (center) {
              const amount =
                [...center.querySelectorAll(
                  'p,span,div'
                )]
                  .concat(
                    [center]
                  )
                  .find(
                    (node) =>
                      /^\$[\d,.]+[kmb]?$/i.test(
                        (node.textContent || '').replace(
                          /\s+/g,
                          ''
                        )
                      ) ||
                      /\$[\d,.]+[kmb]?/i.test(
                        node.textContent || ''
                      ) &&
                      node.childElementCount === 0
                  );

              if (amount) {
                centerTotal = {
                  text: (amount.textContent || '')
                    .replace(
                      /\s+/g,
                      ' '
                    )
                    .trim(),
                  box: asBox(
                    amount.getBoundingClientRect()
                  )
                };
              }

              break;
            }

            if (
              root.querySelector(
                'svg path'
              )
            ) {
              break;
            }

            root =
              root.parentElement;
          }
        }

        const category =
          lines.find(
            (line) =>
              /^(equity|cash|options)/i.test(
                line.text
              )
          ) ||
          null;

        const value =
          lines.find(
            (line) =>
              /^\$[\d,.]+/.test(
                line.text
              )
          ) ||
          null;

        const percent =
          lines.find(
            (line) =>
              /^\d+(?:\.\d+)?%$/.test(
                line.text
              )
          ) ||
          null;

        return {
          category,
          value,
          percent,
          centerTotal,
          tooltipVisible
        };
      }
    );
  }

  async expectPieHoverCategoryUnderValue() {
    Logger.info(
      'Checking pie hover label layout'
    );

    const palette =
      await this.readAssetTypePalette();

    const equity =
      palette.legend.find(
        (entry) =>
          /equity/i.test(
            entry.label
          )
      );

    expect(
      equity,
      'Equity must be in the allocation legend so hover can be measured'
    ).toBeTruthy();

    const layout =
      await this.readPieHoverLayout(
        equity!.hex
      );

    expect(
      layout.tooltipVisible ||
      layout.category,
      'Hovering an allocation slice should show a category label'
    ).toBeTruthy();

    expect(
      layout.category,
      'Hover state should name the asset type'
    ).toBeTruthy();

    expect(
      layout.value,
      'Hover state should show the account balance/value'
    ).toBeTruthy();

    expect(
      layout.category!.box.y,
      'Category label should render underneath the value, not above it'
    ).toBeGreaterThanOrEqual(
      layout.value!.box.y +
      layout.value!.box.h -
      2
    );

    if (
      layout.centerTotal &&
      layout.tooltipVisible &&
      layout.category
    ) {
      expect(
        boxesOverlap(
          layout.category.box,
          layout.centerTotal.box
        ) ||
        boxesOverlap(
          layout.value!.box,
          layout.centerTotal.box
        ),
        'Hover labels must not overlap or clip the donut total'
      ).toBe(
        false
      );
    }

    Logger.success(
      'Pie hover category sits under the value without overlapping the total'
    );
  }

  async expectAnalyticsProviderCopy() {
    Logger.info(
      'Checking Analytics provider copy'
    );

    await this.page.goto(
      `${BASE_URL}/dashboard/analytics`,
      {
        waitUntil: 'domcontentloaded'
      }
    );

    await expect(
      this.page.getByRole(
        'heading',
        {
          name: /^analytics$/i
        }
      )
    ).toBeVisible({
      timeout: 20000
    });

    const delayed =
      this.page.getByRole(
        'button',
        {
          name: /delayed/i
        }
      ).first();

    if (
      await delayed.isVisible().catch(
        () => false
      )
    ) {
      await delayed.hover();
    }

    const visible =
      await this.page.locator(
        'body'
      ).innerText();

    const tooltipText =
      (
        await this.page.locator(
          '[role="tooltip"]'
        ).allInnerTexts().catch(
          () => []
        )
      ).join(
        ' '
      );

    const combined =
      `${visible}\n${tooltipText}`;

    expect(
      combined,
      'Analytics must not show the AlphaVanatage misspelling'
    ).not.toMatch(
      /alphavanatage/i
    );

    const provider =
      combined.match(
        /alpha\s*vantage/ig
      ) ||
      [];

    for (const match of provider) {
      expect(
        match.replace(
          /\s+/g,
          ' '
        )
      ).toMatch(
        /^alpha vantage$/i
      );
    }

    Logger.success(
      'Analytics copy does not use AlphaVanatage'
    );
  }

  async expectAnalyticsStatsKpis() {
    Logger.info(
      'Checking Analytics KPI surface used until Stats ships'
    );

    await this.page.goto(
      `${BASE_URL}/dashboard/analytics`,
      {
        waitUntil: 'domcontentloaded'
      }
    );

    await expect(
      this.page.getByRole(
        'heading',
        {
          name: /^analytics$/i
        }
      )
    ).toBeVisible({
      timeout: 20000
    });

    const main =
      this.page.locator(
        'main'
      );

    await expect(
      main
    ).toContainText(
      /ools score/i
    );

    await expect(
      main
    ).toContainText(
      /portfolio performance/i
    );

    await expect(
      main
    ).toContainText(
      /sector allocation|allocation/i
    );

    await expect(
      main
    ).toContainText(
      /position concentration|hhi|top 5/i
    );

    Logger.success(
      'Analytics still exposes the Stats KPI set'
    );
  }
}

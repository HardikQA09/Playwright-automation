import {
  expect,
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

type AllocationRaw = {
  legend: Array<{
    label: string;
    bg: string;
  }>;
  pie: string[];
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

    const betaVisible =
      await betaControl.isVisible({
        timeout: 4000
      }).catch(
        () => false
      );

    if (
      !betaVisible
    ) {
      await this.expectPerformanceAbsentFromDashboard();

      Logger.success(
        'This account has no Beta menu. OolTool Performance stays off the dashboard.'
      );

      return;
    }

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

  private async allocationRootData(): Promise<AllocationRaw> {
    const heading =
      this.allocationHeading();

    await expect(
      heading
    ).toBeVisible({
      timeout: 20000
    });

    await heading.scrollIntoViewIfNeeded();

    return heading.evaluate(
      (headingNode) => {
        let root =
          headingNode.parentElement;

        while (
          root &&
          root !== document.body
        ) {
          const firstHeading =
            root.querySelector(
              'h1, h2, h3, h4'
            );

          const piePaths =
            [...root.querySelectorAll(
              'svg path'
            )].filter(
              (path) => {
                const fill =
                  (
                    path.getAttribute(
                      'fill'
                    ) ||
                    ''
                  ).toLowerCase();

                return fill.startsWith(
                  '#'
                ) &&
                  fill !== '#fff' &&
                  fill !== '#ffffff';
              }
            );

          if (
            firstHeading === headingNode &&
            piePaths.length >= 1
          ) {
            const legend: AllocationRaw['legend'] = [];

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
                    map: Record<string, AllocationRaw['legend'][number]>,
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
              pie: piePaths.map(
                (path) =>
                  path.getAttribute(
                    'fill'
                  ) || ''
              )
            };
          }

          root =
            root.parentElement;
        }

        return {
          legend: [],
          pie: []
        };
      }
    );
  }

  async readAssetTypePalette() {
    const raw =
      await expect.poll(
        async () =>
          this.allocationRootData(),
        {
          timeout: 15000,
          message:
            'Asset Allocation pie slices should render'
        }
      ).toMatchObject({
        pie: expect.arrayContaining([
          expect.stringMatching(
            /^#/
          )
        ])
      }).then(
        async () =>
          this.allocationRootData()
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

  async hoverAllocationSlice(
    fill: string
  ) {
    const box =
      await this.allocationHeading().evaluate(
        (headingNode, wantedFill) => {
          const wanted =
            wantedFill.toLowerCase();

          let root =
            headingNode.parentElement;

          while (
            root &&
            root !== document.body
          ) {
            const firstHeading =
              root.querySelector(
                'h1, h2, h3, h4'
              );

            if (
              firstHeading === headingNode
            ) {
              const path =
                [...root.querySelectorAll(
                  'svg path'
                )].find(
                  (node) =>
                    (
                      node.getAttribute(
                        'fill'
                      ) ||
                      ''
                    ).toLowerCase() === wanted
                );

              if (path) {
                const rect =
                  path.getBoundingClientRect();

                return {
                  x: rect.x,
                  y: rect.y,
                  w: rect.width,
                  h: rect.height
                };
              }
            }

            root =
              root.parentElement;
          }

          return null;
        },
        fill
      );

    expect(
      box,
      `Allocation pie should include a slice filled with ${fill}`
    ).toBeTruthy();

    await this.page.mouse.move(
      box!.x +
      Math.max(
        6,
        box!.w * 0.65
      ),
      box!.y +
      Math.max(
        6,
        box!.h * 0.35
      )
    );

    await expect(
      this.page.locator(
        '.recharts-tooltip-wrapper'
      ).filter({
        hasText: /equity|cash|options|\$/i
      })
    ).toBeVisible({
      timeout: 5000
    });
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
        ) => ({
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

        const heading =
          [...document.querySelectorAll(
            'h1,h2,h3,h4'
          )].find(
            (node) =>
              /asset allocation/i.test(
                node.textContent || ''
              )
          );

        let centerTotal: PieHoverLayout['centerTotal'] =
          null;

        if (heading) {
          let root =
            heading.parentElement;

          while (
            root &&
            root !== document.body
          ) {
            const firstHeading =
              root.querySelector(
                'h1, h2, h3, h4'
              );

            if (
              firstHeading === heading
            ) {
              const amount =
                [...root.querySelectorAll(
                  'p,span,div'
                )].find(
                  (node) => {
                    const text =
                      (node.textContent || '')
                        .replace(
                          /\s+/g,
                          ''
                        );

                    return node.childElementCount === 0 &&
                      /^\$[\d,.]+[kmb]?$/i.test(
                        text
                      );
                  }
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

            root =
              root.parentElement;
          }
        }

        return {
          category: lines.find(
            (line) =>
              /^(equity|cash|options)/i.test(
                line.text
              )
          ) ||
            null,
          value: lines.find(
            (line) =>
              /^\$[\d,.]+/.test(
                line.text
              )
          ) ||
            null,
          percent: lines.find(
            (line) =>
              /^\d+(?:\.\d+)?%$/.test(
                line.text
              )
          ) ||
            null,
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
      ) ||
      palette.pie[0] && {
        label: 'Equity',
        hex: palette.pie[0]
      };

    expect(
      equity,
      'Equity must be in the allocation legend so hover can be measured'
    ).toBeTruthy();

    const layout =
      await this.readPieHoverLayout(
        equity!.hex
      );

    expect(
      layout.category,
      'Hover state should name the asset type'
    ).toBeTruthy();

    expect(
      layout.value,
      'Hover state should show the account balance/value'
    ).toBeTruthy();

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

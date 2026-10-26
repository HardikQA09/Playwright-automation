/* =============================================================================
HELPER: portfolioRoutes

PURPOSE
-------
UAT routes holdings under /dashboard/positions?account=… as well as legacy
/portfolio/ paths. Shared matchers keep portfolio specs aligned.
============================================================================= */

export const PORTFOLIO_OR_POSITIONS_URL =
  /\/(portfolio|dashboard\/positions|positions)([/?#]|$)/i;

export function isPositionsHoldingsUrl(
  url: string
) {
  return (
    /\/(dashboard\/positions|positions)([/?#]|$)/i.test(
      url
    ) ||
    /\/dashboard\/positions/i.test(
      url
    )
  );
}

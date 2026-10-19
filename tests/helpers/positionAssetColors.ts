/* =============================================================================
HELPER: positionAssetColors

PURPOSE
-------
Rob Lapietra / Pankaj Bhatla asset-type palette for the Positions grid.
Hex values are the requested standard. UAT labels currently use EQUITY /
CALL · Long / PUT · Long rather than "Long Equity" / "Long Call".
============================================================================= */

export const ROB_POSITION_COLORS = {
  cash: {
    label: /^CASH$/i,
    hex: '#15803D'
  },
  longEquity: {
    label: /^EQUITY$/i,
    hex: '#2563EB'
  },
  shortEquity: {
    label: /short equity|equity\s*[·•]\s*short/i,
    hex: '#C2410C'
  },
  longCall: {
    label: /^CALL\s*[·•]\s*Long$/i,
    hex: '#0891B2'
  },
  shortCall: {
    label: /short call|call\s*[·•]\s*short/i,
    hex: '#7C3AED'
  },
  longPut: {
    label: /^PUT\s*[·•]\s*Long$/i,
    hex: '#0F766E'
  },
  shortPut: {
    label: /short put|put\s*[·•]\s*short/i,
    hex: '#BE185D'
  },
  bond: {
    label: /^BOND/i,
    hex: '#A3BE32'
  },
  unclassified: {
    label: /^unclassified$/i,
    hex: '#64748B'
  }
} as const;

export function classHasHex(
  className: string | null,
  hex: string
) {
  if (!className) {
    return false;
  }

  return className.toLowerCase().includes(
    hex.replace(
      '#',
      ''
    ).toLowerCase()
  );
}

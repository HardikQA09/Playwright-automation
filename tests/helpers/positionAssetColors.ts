/* =============================================================================
HELPER: positionAssetColors

PURPOSE
-------
Rob Lapietra / Pankaj Bhatla standard palette for Positions badges.

UAT (19 Oct 2026) applies the hex for types present on plantest, but badge
text still uses EQUITY / CALL · Long / PUT · Long rather than the display
labels below. Short / Bond / Unclassified rows are not in plantest data.
============================================================================= */

export type RobPositionColor = {
  id: string;
  displayLabel: string;
  hex: string;
  label: RegExp;
};

export const ROB_POSITION_COLOR_TABLE: RobPositionColor[] = [
  {
    id: 'cash',
    displayLabel: 'Cash',
    hex: '#15803D',
    label: /^CASH$/i
  },
  {
    id: 'longEquity',
    displayLabel: 'Long Equity',
    hex: '#2563EB',
    label: /^EQUITY$/i
  },
  {
    id: 'shortEquity',
    displayLabel: 'Short Equity',
    hex: '#C2410C',
    label: /short equity|equity\s*[·•]\s*short/i
  },
  {
    id: 'longCall',
    displayLabel: 'Long Call',
    hex: '#0891B2',
    label: /^CALL\s*[·•]\s*Long$/i
  },
  {
    id: 'shortCall',
    displayLabel: 'Short Call',
    hex: '#7C3AED',
    label: /short call|call\s*[·•]\s*short/i
  },
  {
    id: 'longPut',
    displayLabel: 'Long Put',
    hex: '#0F766E',
    label: /^PUT\s*[·•]\s*Long$/i
  },
  {
    id: 'shortPut',
    displayLabel: 'Short Put',
    hex: '#BE185D',
    label: /short put|put\s*[·•]\s*short/i
  },
  {
    id: 'bond',
    displayLabel: 'Bond',
    hex: '#A3BE32',
    label: /^BOND/i
  },
  {
    id: 'unclassified',
    displayLabel: 'Unclassified',
    hex: '#64748B',
    label: /^unclassified$/i
  }
];

export const ROB_POSITION_COLORS = {
  cash: ROB_POSITION_COLOR_TABLE[0],
  longEquity: ROB_POSITION_COLOR_TABLE[1],
  shortEquity: ROB_POSITION_COLOR_TABLE[2],
  longCall: ROB_POSITION_COLOR_TABLE[3],
  shortCall: ROB_POSITION_COLOR_TABLE[4],
  longPut: ROB_POSITION_COLOR_TABLE[5],
  shortPut: ROB_POSITION_COLOR_TABLE[6],
  bond: ROB_POSITION_COLOR_TABLE[7],
  unclassified: ROB_POSITION_COLOR_TABLE[8]
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

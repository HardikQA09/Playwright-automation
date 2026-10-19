/* =============================================================================
HELPER: chartGeometry

PURPOSE
-------
Shared box and color helpers for pie-hover and asset-type palette checks.
============================================================================= */

export type ChartBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export function toHexColor(
  input: string | null | undefined
) {
  if (!input) {
    return '';
  }

  const value =
    input.trim().toLowerCase();

  if (
    value === 'none' ||
    value === 'transparent' ||
    value === 'rgba(0, 0, 0, 0)'
  ) {
    return '';
  }

  if (
    value.startsWith(
      '#'
    )
  ) {
    if (
      value.length === 4
    ) {
      return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
    }

    return value.slice(
      0,
      7
    );
  }

  const rgb =
    value.match(
      /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/
    );

  if (!rgb) {
    return '';
  }

  return `#${[rgb[1], rgb[2], rgb[3]]
    .map(
      (part) =>
        Number(
          part
        )
          .toString(
            16
          )
          .padStart(
            2,
            '0'
          )
    )
    .join(
      ''
    )}`;
}

export function boxesOverlap(
  first: ChartBox,
  second: ChartBox
) {
  return first.x < second.x + second.w &&
    first.x + first.w > second.x &&
    first.y < second.y + second.h &&
    first.y + first.h > second.y;
}

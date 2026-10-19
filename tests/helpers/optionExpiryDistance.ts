/* =============================================================================
HELPER: optionExpiryDistance

PURPOSE
-------
Distance % and OTM/NTM/ATM/ITM buckets for the Option Expiry Overview revamp.
============================================================================= */

export type ExpiryBucket =
  | 'OTM'
  | 'NTM'
  | 'ATM'
  | 'ITM';

export function callDistancePct(
  spot: number,
  strike: number
) {
  return (
    (spot - strike) /
    strike
  ) * 100;
}

export function putDistancePct(
  spot: number,
  strike: number
) {
  return (
    (strike - spot) /
    strike
  ) * 100;
}

export function expiryBucket(
  distancePct: number
): ExpiryBucket {
  if (
    distancePct < -5
  ) {
    return 'OTM';
  }

  if (
    distancePct < -1
  ) {
    return 'NTM';
  }

  if (
    distancePct <= 1
  ) {
    return 'ATM';
  }

  return 'ITM';
}

export function parseMoney(
  value: string
) {
  const match =
    value.replace(
      /,/g,
      ''
    ).match(
      /-?\$?\s*([\d.]+)/
    );

  return match
    ? Number(
      match[1]
    )
    : NaN;
}

export function parseSignedPercent(
  value: string
) {
  const match =
    value.replace(
      /,/g,
      ''
    ).match(
      /([+-]?\d+(?:\.\d+)?)\s*%/
    );

  return match
    ? Number(
      match[1]
    )
    : NaN;
}

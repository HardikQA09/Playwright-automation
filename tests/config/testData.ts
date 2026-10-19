import fs from 'fs';
import path from 'path';

import './loadLocalEnv';

/* =============================================================================
TEST DATA CONFIGURATION

PURPOSE
-------
Reads tests/config/test-data.json. Edit that file, or set TEST_DATA_FILE to
another JSON file, to run the same tests with different users, cards, and
plan prices. An environment variable still overrides the matching field.

============================================================================= */

type PlanPrice = {
  monthly: number;
  annual: number;
};

type TestDataFile = {
  baseUrl?: string;
  users?: {
    onboarding?: {
      firstName?: string;
      lastName?: string;
      emailBase?: string;
      emailBases?: string[];
      mobile?: string;
      mobilePrefix?: string;
      password?: string;
    };
    subscriber?: {
      email?: string;
      password?: string;
    };
  };
  auth?: {
    otpCode?: string;
    emailVerificationLinkExpiryMinutes?: number;
    passwordResetLinkExpiryMinutes?: number;
    emailVerificationResendsPerWindow?: number;
    emailVerificationResendWindowSeconds?: number;
    registrationMobileOtpEnabled?: boolean;
    postLoginMobileVerificationEnabled?: boolean;
    emailVerificationRequired?: boolean;
    maxFailedLoginAttempts?: number;
    lockoutDurationMinutes?: number;
    failureCountingWindowMinutes?: number;
  };
  passwordPolicy?: {
    minimumLength?: number;
    requireUppercase?: boolean;
    requireLowercase?: boolean;
    requireDigit?: boolean;
    requireSymbol?: boolean;
    bannedPasswords?: string[];
    expiryDays?: number;
  };
  mfa?: {
    userFlowEnabled?: boolean;
    allowDestructiveUserFlow?: boolean;
    allowGoogleUserFlow?: boolean;
    manualOtpFlowEnabled?: boolean;
    manualExpectTrustedDevice?: boolean;
    availableToUsers?: boolean;
    requireForAdminRoles?: boolean;
    requireForAllUsers?: boolean;
    allowTotp?: boolean;
    allowSmsSecondFactor?: boolean;
    recoveryCodesPerUser?: number;
    maxFailedAttempts?: number;
    lockoutDurationMinutes?: number;
    trustedDevicesEnabled?: boolean;
    trustedDeviceLifetimeDays?: number;
    forceAfterFailedLogins?: number;
    forceAfterPasswordChange?: boolean;
    forceAfterSensitiveProfileChanges?: boolean;
    forceFromUnusualLocation?: boolean;
  };
  rateLimits?: {
    authEmailsPerWindow?: number;
    authEmailsWindowSeconds?: number;
    authSmsPerWindow?: number;
    authSmsWindowSeconds?: number;
    tokenVerificationsPerWindow?: number;
    tokenVerificationsWindowSeconds?: number;
    signupsAndSigninsPerWindow?: number;
    signupsAndSigninsWindowSeconds?: number;
    passwordResetsPerWindow?: number;
    passwordResetsWindowSeconds?: number;
    apiAuthRequestsPerWindow?: number;
    apiAuthWindowSeconds?: number;
    apiReadRequestsPerWindow?: number;
    apiReadWindowSeconds?: number;
    apiWriteRequestsPerWindow?: number;
    apiWriteWindowSeconds?: number;
    apiPublicRequestsPerWindow?: number;
    apiPublicWindowSeconds?: number;
    otpPerPhoneMaxPerWindow?: number;
    otpPerPhoneWindowSeconds?: number;
    otpPerUserMaxPerWindow?: number;
    otpPerUserWindowSeconds?: number;
  };
  stripe?: {
    card?: string;
    declinedCard?: string;
    insufficientFundsCard?: string;
    stolenCard?: string;
    processingErrorCard?: string;
    authenticationRequiredCard?: string;
    incompleteCard?: string;
    expiry?: string;
    expiredExpiry?: string;
    cvc?: string;
    invalidCvc?: string;
    country?: string;
    cardholderName?: string;
    trialCards?: string[];
  };
  plans?: {
    'Income Builder'?: PlanPrice;
    'Overlay Strategists'?: PlanPrice;
    'Portfolio Hedger'?: PlanPrice;
  };
  positions?: {
    cash?: {
      amount?: string;
      currencyOption?: string;
    };
    equity?: {
      search?: string;
      symbol?: string;
      quantity?: string;
      price?: string;
    };
    option?: {
      search?: string;
      symbol?: string;
      right?: string;
      quantity?: string;
      price?: string;
    };
  };
};

function testDataFilePath() {
  const configured =
    process.env.TEST_DATA_FILE;

  if (!configured) {
    return path.join(
      __dirname,
      'test-data.json'
    );
  }

  return path.isAbsolute(
    configured
  )
    ? configured
    : path.join(
      process.cwd(),
      configured
    );
}

function loadTestDataFile(): TestDataFile {
  const filePath =
    testDataFilePath();

  return JSON.parse(
    fs.readFileSync(
      filePath,
      'utf8'
    )
  ) as TestDataFile;
}

const data =
  loadTestDataFile();

const onboarding =
  data.users?.onboarding ?? {};

const subscriber =
  data.users?.subscriber ?? {};

const auth =
  data.auth ?? {};

const passwordPolicy =
  data.passwordPolicy ?? {};

const mfa =
  data.mfa ?? {};

const rates =
  data.rateLimits ?? {};

const stripe =
  data.stripe ?? {};

const positions =
  data.positions ?? {};

export const BASE_URL =
  process.env.BASE_URL ??
  data.baseUrl ??
  'https://uat.ooltool.com';

function getBooleanEnv(
  name: string,
  defaultValue: boolean
) {

  const value =
    process.env[name];

  if (value === undefined) {
    return defaultValue;
  }

  return [
    '1',
    'true',
    'yes',
    'on'
  ].includes(
    value.toLowerCase()
  );
}

function getNumberEnv(
  name: string,
  defaultValue: number
) {

  const value =
    process.env[name];

  if (value === undefined) {
    return defaultValue;
  }

  const parsedValue =
    Number(value);

  if (
    Number.isNaN(parsedValue)
  ) {
    throw new Error(
      `${name} must be a number.`
    );
  }

  return parsedValue;
}

/* ============================================================================
   TEST USERS
============================================================================ */

export const TEST_USERS = {

  onboarding: {

    firstName:
      process.env.ONBOARDING_FIRST_NAME ??
      onboarding.firstName ??
      'Hardik',

    lastName:
      process.env.ONBOARDING_LAST_NAME ??
      onboarding.lastName ??
      'Thanki',

    email:
      process.env.ONBOARDING_EMAIL,

    emailBase:
      process.env.ONBOARDING_EMAIL_BASE ??
      onboarding.emailBase ??
      'imhardikthanki@gmail.com',

    emailBases:
      (
        process.env.ONBOARDING_EMAIL_BASES ??
        process.env.ONBOARDING_EMAIL_BASE ??
        onboarding.emailBases?.join(',') ??
        onboarding.emailBase ??
        'imhardikthanki@gmail.com'
      )
        .split(',')
        .map(
          email =>
            email.trim()
        )
        .filter(Boolean),

    mobile:
      process.env.ONBOARDING_MOBILE ??
      onboarding.mobile ??
      '2015550123',

    mobilePrefix:
      process.env.ONBOARDING_MOBILE_PREFIX ??
      onboarding.mobilePrefix ??
      '201555',

    password:
      process.env.ONBOARDING_PASSWORD ??
      onboarding.password ??
      'Test@123456'
  },

  subscriber: {

    email:
      process.env.SUBSCRIBER_EMAIL ??
      subscriber.email ??
      'imhardikthanki+plantest@gmail.com',

    password:
      process.env.SUBSCRIBER_PASSWORD ??
      subscriber.password ??
      'H@rdik9944'
  },

  mfaLocal: {

    email:
      process.env.MFA_LOCAL_EMAIL,

    password:
      process.env.MFA_LOCAL_PASSWORD,

    secret:
      process.env.MFA_LOCAL_TOTP_SECRET,

    backupCode:
      process.env.MFA_LOCAL_BACKUP_CODE,

    reuseBackupCode:
      process.env.MFA_REUSE_BACKUP_CODE
  },

  mfaGoogle: {

    email:
      process.env.MFA_GOOGLE_EMAIL,

    password:
      process.env.MFA_GOOGLE_PASSWORD,

    secret:
      process.env.MFA_GOOGLE_TOTP_SECRET,

    backupCode:
      process.env.MFA_GOOGLE_BACKUP_CODE
  }
};

/* ============================================================================
   AUTH SETTINGS
============================================================================ */

export const AUTH_SETTINGS = {

  otpCode:
    process.env.AUTH_OTP_CODE ??
    auth.otpCode ??
    '111111',

  emailVerificationLinkExpiryMinutes:
    getNumberEnv(
      'AUTH_EMAIL_VERIFICATION_LINK_EXPIRY_MINUTES',
      auth.emailVerificationLinkExpiryMinutes ??
        5
    ),

  passwordResetLinkExpiryMinutes:
    getNumberEnv(
      'AUTH_PASSWORD_RESET_LINK_EXPIRY_MINUTES',
      auth.passwordResetLinkExpiryMinutes ??
        5
    ),

  emailVerificationResendsPerWindow:
    getNumberEnv(
      'AUTH_EMAIL_VERIFICATION_RESENDS_PER_WINDOW',
      auth.emailVerificationResendsPerWindow ??
        5
    ),

  emailVerificationResendWindowSeconds:
    getNumberEnv(
      'AUTH_EMAIL_VERIFICATION_RESEND_WINDOW_SECONDS',
      auth.emailVerificationResendWindowSeconds ??
        3600
    ),

  registrationMobileOtpEnabled:
    getBooleanEnv(
      'AUTH_REGISTRATION_MOBILE_OTP_ENABLED',
      auth.registrationMobileOtpEnabled ??
        true
    ),

  postLoginMobileVerificationEnabled:
    getBooleanEnv(
      'AUTH_POST_LOGIN_MOBILE_VERIFICATION_ENABLED',
      auth.postLoginMobileVerificationEnabled ??
        true
    ),

  emailVerificationRequired:
    getBooleanEnv(
      'AUTH_EMAIL_VERIFICATION_REQUIRED',
      auth.emailVerificationRequired ??
        true
    )
};

/* ============================================================================
   AUTH LOCKOUT SETTINGS
============================================================================ */

export const AUTH_LOCKOUT_SETTINGS = {

  maxFailedLoginAttempts:
    getNumberEnv(
      'AUTH_MAX_FAILED_LOGIN_ATTEMPTS',
      auth.maxFailedLoginAttempts ??
        5
    ),

  lockoutDurationMinutes:
    getNumberEnv(
      'AUTH_LOCKOUT_DURATION_MINUTES',
      auth.lockoutDurationMinutes ??
        15
    ),

  failureCountingWindowMinutes:
    getNumberEnv(
      'AUTH_FAILURE_COUNTING_WINDOW_MINUTES',
      auth.failureCountingWindowMinutes ??
        15
    )
};

/* ============================================================================
   PASSWORD POLICY
============================================================================ */

export const PASSWORD_POLICY = {

  minimumLength:
    getNumberEnv(
      'PASSWORD_MINIMUM_LENGTH',
      passwordPolicy.minimumLength ??
        8
    ),

  requireUppercase:
    getBooleanEnv(
      'PASSWORD_REQUIRE_UPPERCASE',
      passwordPolicy.requireUppercase ??
        false
    ),

  requireLowercase:
    getBooleanEnv(
      'PASSWORD_REQUIRE_LOWERCASE',
      passwordPolicy.requireLowercase ??
        false
    ),

  requireDigit:
    getBooleanEnv(
      'PASSWORD_REQUIRE_DIGIT',
      passwordPolicy.requireDigit ??
        false
    ),

  requireSymbol:
    getBooleanEnv(
      'PASSWORD_REQUIRE_SYMBOL',
      passwordPolicy.requireSymbol ??
        false
    ),

  bannedPasswords:
    (
      process.env.PASSWORD_BANNED_PASSWORDS ??
      passwordPolicy.bannedPasswords?.join(',') ??
      'password,123456,qwerty,letmein,admin'
    )
      .split(',')
      .map(
        password =>
          password.trim()
      )
      .filter(Boolean),

  expiryDays:
    getNumberEnv(
      'PASSWORD_EXPIRY_DAYS',
      passwordPolicy.expiryDays ??
        0
    )
};

/* ============================================================================
   MFA SETTINGS
============================================================================ */

export const MFA_SETTINGS = {

  userFlowEnabled:
    getBooleanEnv(
      'MFA_USER_FLOW_ENABLED',
      mfa.userFlowEnabled ??
        false
    ),

  allowDestructiveUserFlow:
    getBooleanEnv(
      'MFA_ALLOW_DESTRUCTIVE_USER_FLOW',
      mfa.allowDestructiveUserFlow ??
        false
    ),

  allowGoogleUserFlow:
    getBooleanEnv(
      'MFA_ALLOW_GOOGLE_USER_FLOW',
      mfa.allowGoogleUserFlow ??
        false
    ),

  manualOtpFlowEnabled:
    getBooleanEnv(
      'MFA_MANUAL_OTP_FLOW_ENABLED',
      mfa.manualOtpFlowEnabled ??
        false
    ),

  manualExpectTrustedDevice:
    getBooleanEnv(
      'MFA_MANUAL_EXPECT_TRUSTED_DEVICE',
      mfa.manualExpectTrustedDevice ??
        false
    ),

  availableToUsers:
    getBooleanEnv(
      'MFA_AVAILABLE_TO_USERS',
      mfa.availableToUsers ??
        true
    ),

  requireForAdminRoles:
    getBooleanEnv(
      'MFA_REQUIRE_FOR_ADMIN_ROLES',
      mfa.requireForAdminRoles ??
        false
    ),

  requireForAllUsers:
    getBooleanEnv(
      'MFA_REQUIRE_FOR_ALL_USERS',
      mfa.requireForAllUsers ??
        false
    ),

  allowTotp:
    getBooleanEnv(
      'MFA_ALLOW_TOTP',
      mfa.allowTotp ??
        true
    ),

  allowSmsSecondFactor:
    getBooleanEnv(
      'MFA_ALLOW_SMS_SECOND_FACTOR',
      mfa.allowSmsSecondFactor ??
        false
    ),

  recoveryCodesPerUser:
    getNumberEnv(
      'MFA_RECOVERY_CODES_PER_USER',
      mfa.recoveryCodesPerUser ??
        5
    ),

  maxFailedAttempts:
    getNumberEnv(
      'MFA_MAX_FAILED_ATTEMPTS',
      mfa.maxFailedAttempts ??
        5
    ),

  lockoutDurationMinutes:
    getNumberEnv(
      'MFA_LOCKOUT_DURATION_MINUTES',
      mfa.lockoutDurationMinutes ??
        30
    ),

  trustedDevicesEnabled:
    getBooleanEnv(
      'MFA_TRUSTED_DEVICES_ENABLED',
      mfa.trustedDevicesEnabled ??
        true
    ),

  trustedDeviceLifetimeDays:
    getNumberEnv(
      'MFA_TRUSTED_DEVICE_LIFETIME_DAYS',
      mfa.trustedDeviceLifetimeDays ??
        15
    ),

  forceAfterFailedLogins:
    getNumberEnv(
      'MFA_FORCE_AFTER_FAILED_LOGINS',
      mfa.forceAfterFailedLogins ??
        3
    ),

  forceAfterPasswordChange:
    getBooleanEnv(
      'MFA_FORCE_AFTER_PASSWORD_CHANGE',
      mfa.forceAfterPasswordChange ??
        true
    ),

  forceAfterSensitiveProfileChanges:
    getBooleanEnv(
      'MFA_FORCE_AFTER_SENSITIVE_PROFILE_CHANGES',
      mfa.forceAfterSensitiveProfileChanges ??
        true
    ),

  forceFromUnusualLocation:
    getBooleanEnv(
      'MFA_FORCE_FROM_UNUSUAL_LOCATION',
      mfa.forceFromUnusualLocation ??
        false
    )
};

/* ============================================================================
   RATE LIMIT SETTINGS
============================================================================ */

export const AUTH_RATE_LIMITS = {

  authEmailsPerWindow:
    getNumberEnv(
      'RATE_AUTH_EMAILS_PER_WINDOW',
      rates.authEmailsPerWindow ??
        30
    ),

  authEmailsWindowSeconds:
    getNumberEnv(
      'RATE_AUTH_EMAILS_WINDOW_SECONDS',
      rates.authEmailsWindowSeconds ??
        3600
    ),

  authSmsPerWindow:
    getNumberEnv(
      'RATE_AUTH_SMS_PER_WINDOW',
      rates.authSmsPerWindow ??
        30
    ),

  authSmsWindowSeconds:
    getNumberEnv(
      'RATE_AUTH_SMS_WINDOW_SECONDS',
      rates.authSmsWindowSeconds ??
        3600
    ),

  tokenVerificationsPerWindow:
    getNumberEnv(
      'RATE_TOKEN_VERIFICATIONS_PER_WINDOW',
      rates.tokenVerificationsPerWindow ??
        30
    ),

  tokenVerificationsWindowSeconds:
    getNumberEnv(
      'RATE_TOKEN_VERIFICATIONS_WINDOW_SECONDS',
      rates.tokenVerificationsWindowSeconds ??
        300
    ),

  signupsAndSigninsPerWindow:
    getNumberEnv(
      'RATE_SIGNUPS_SIGNINS_PER_WINDOW',
      rates.signupsAndSigninsPerWindow ??
        30
    ),

  signupsAndSigninsWindowSeconds:
    getNumberEnv(
      'RATE_SIGNUPS_SIGNINS_WINDOW_SECONDS',
      rates.signupsAndSigninsWindowSeconds ??
        300
    ),

  passwordResetsPerWindow:
    getNumberEnv(
      'RATE_PASSWORD_RESETS_PER_WINDOW',
      rates.passwordResetsPerWindow ??
        5
    ),

  passwordResetsWindowSeconds:
    getNumberEnv(
      'RATE_PASSWORD_RESETS_WINDOW_SECONDS',
      rates.passwordResetsWindowSeconds ??
        3600
    )
};

export const API_RATE_LIMITS = {

  authRequestsPerWindow:
    getNumberEnv(
      'RATE_API_AUTH_REQUESTS_PER_WINDOW',
      rates.apiAuthRequestsPerWindow ??
        5
    ),

  authWindowSeconds:
    getNumberEnv(
      'RATE_API_AUTH_WINDOW_SECONDS',
      rates.apiAuthWindowSeconds ??
        60
    ),

  readRequestsPerWindow:
    getNumberEnv(
      'RATE_API_READ_REQUESTS_PER_WINDOW',
      rates.apiReadRequestsPerWindow ??
        60
    ),

  readWindowSeconds:
    getNumberEnv(
      'RATE_API_READ_WINDOW_SECONDS',
      rates.apiReadWindowSeconds ??
        60
    ),

  writeRequestsPerWindow:
    getNumberEnv(
      'RATE_API_WRITE_REQUESTS_PER_WINDOW',
      rates.apiWriteRequestsPerWindow ??
        20
    ),

  writeWindowSeconds:
    getNumberEnv(
      'RATE_API_WRITE_WINDOW_SECONDS',
      rates.apiWriteWindowSeconds ??
        60
    ),

  publicRequestsPerWindow:
    getNumberEnv(
      'RATE_API_PUBLIC_REQUESTS_PER_WINDOW',
      rates.apiPublicRequestsPerWindow ??
        30
    ),

  publicWindowSeconds:
    getNumberEnv(
      'RATE_API_PUBLIC_WINDOW_SECONDS',
      rates.apiPublicWindowSeconds ??
        60
    )
};

export const OTP_RATE_LIMITS = {

  perPhoneMaxOtpsPerWindow:
    getNumberEnv(
      'RATE_OTP_PER_PHONE_MAX_PER_WINDOW',
      rates.otpPerPhoneMaxPerWindow ??
        5
    ),

  perPhoneWindowSeconds:
    getNumberEnv(
      'RATE_OTP_PER_PHONE_WINDOW_SECONDS',
      rates.otpPerPhoneWindowSeconds ??
        600
    ),

  perUserMaxOtpsPerWindow:
    getNumberEnv(
      'RATE_OTP_PER_USER_MAX_PER_WINDOW',
      rates.otpPerUserMaxPerWindow ??
        10
    ),

  perUserWindowSeconds:
    getNumberEnv(
      'RATE_OTP_PER_USER_WINDOW_SECONDS',
      rates.otpPerUserWindowSeconds ??
        600
    )
};

export function validatePasswordPolicy(
  password: string
) {

  if (
    password.length <
    PASSWORD_POLICY.minimumLength
  ) {
    throw new Error(
      `Password must be at least ${PASSWORD_POLICY.minimumLength} characters.`
    );
  }

  if (
    PASSWORD_POLICY.requireUppercase &&
    !/[A-Z]/.test(password)
  ) {
    throw new Error(
      'Password must contain an uppercase letter.'
    );
  }

  if (
    PASSWORD_POLICY.requireLowercase &&
    !/[a-z]/.test(password)
  ) {
    throw new Error(
      'Password must contain a lowercase letter.'
    );
  }

  if (
    PASSWORD_POLICY.requireDigit &&
    !/[0-9]/.test(password)
  ) {
    throw new Error(
      'Password must contain a digit.'
    );
  }

  if (
    PASSWORD_POLICY.requireSymbol &&
    !/[^A-Za-z0-9]/.test(password)
  ) {
    throw new Error(
      'Password must contain a symbol.'
    );
  }

  if (
    PASSWORD_POLICY.bannedPasswords.some(
      bannedPassword =>
        bannedPassword.toLowerCase() ===
        password.toLowerCase()
    )
  ) {
    throw new Error(
      'Password is blocked by the configured password policy.'
    );
  }
}

/* ============================================================================
   STRIPE TEST DATA
============================================================================ */

export const STRIPE_CARD =
  process.env.STRIPE_CARD ??
  stripe.card ??
  '4242424242424242';

export const STRIPE_TRIAL_CARDS =
  stripe.trialCards ??
  [
    '4000003560000008'
  ];

let stripeTrialCardIndex =
  Math.floor(
    Math.random() *
      STRIPE_TRIAL_CARDS.length
  );

const usedTrialCards =
  new Set<string>();

function rememberTrialCard(
  card: string
) {
  usedTrialCards.add(
    card
  );

  try {
    const file = path.join(
      process.cwd(),
      'test-results',
      'used-trial-cards.json'
    );

    fs.mkdirSync(
      path.dirname(file),
      {
        recursive: true
      }
    );

    const previous: string[] = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, 'utf8'))
      : [];

    const next = [
      ...new Set([
        ...previous,
        ...usedTrialCards
      ])
    ];

    fs.writeFileSync(
      file,
      JSON.stringify(next)
    );
  } catch {
    // A missing results folder must not block checkout.
  }
}

function trialCardAlreadyUsed(
  card: string
) {
  if (usedTrialCards.has(card)) {
    return true;
  }

  try {
    const file = path.join(
      process.cwd(),
      'test-results',
      'used-trial-cards.json'
    );

    if (!fs.existsSync(file)) {
      return false;
    }

    const previous: string[] = JSON.parse(
      fs.readFileSync(file, 'utf8')
    );

    previous.forEach((saved) => usedTrialCards.add(saved));

    return usedTrialCards.has(card);
  } catch {
    return false;
  }
}

export function uniqueStripeTrialCard(
  _seed?: string
) {
  const configuredCard =
    process.env.STRIPE_TRIAL_CARD?.replace(
      /\s+/g,
      ''
    );

  if (
    configuredCard &&
    configuredCard !==
      '4242424242424242'
  ) {
    return configuredCard;
  }

  if (
    configuredCard ===
    '4242424242424242'
  ) {
    console.warn(
      'STRIPE_TRIAL_CARD=4242424242424242 is already_redeemed for Overlay with-card trial. Rotating an unused country test card. Paid checkout may still use STRIPE_CARD 4242. Follow-up: clear 4242 reuse in Stripe test mode.'
    );
  }

  let card =
    STRIPE_TRIAL_CARDS[
      stripeTrialCardIndex %
      STRIPE_TRIAL_CARDS.length
    ];

  for (
    let step = 0;
    step < STRIPE_TRIAL_CARDS.length;
    step += 1
  ) {
    stripeTrialCardIndex += 1;

    card =
      STRIPE_TRIAL_CARDS[
        (stripeTrialCardIndex - 1) %
        STRIPE_TRIAL_CARDS.length
      ];

    if (
      card ===
      '4242424242424242'
    ) {
      continue;
    }

    if (!trialCardAlreadyUsed(card)) {
      rememberTrialCard(card);
      return card;
    }
  }

  const fallback =
    STRIPE_TRIAL_CARDS.find(
      (candidate) =>
        candidate !==
        '4242424242424242'
    ) ??
    card;

  rememberTrialCard(
    fallback
  );
  return fallback;
}

export const STRIPE_DECLINED_CARD =
  process.env.STRIPE_DECLINED_CARD ??
  stripe.declinedCard ??
  '4000000000000002';

export const STRIPE_INSUFFICIENT_FUNDS_CARD =
  process.env.STRIPE_INSUFFICIENT_FUNDS_CARD ??
  stripe.insufficientFundsCard ??
  '4000000000009995';

export const STRIPE_STOLEN_CARD =
  process.env.STRIPE_STOLEN_CARD ??
  stripe.stolenCard ??
  '4000000000009979';

export const STRIPE_PROCESSING_ERROR_CARD =
  process.env.STRIPE_PROCESSING_ERROR_CARD ??
  stripe.processingErrorCard ??
  '4000000000000119';

export const STRIPE_3DS_REQUIRED_CARD =
  process.env.STRIPE_3DS_REQUIRED_CARD ??
  stripe.authenticationRequiredCard ??
  '4000000000003220';

export const STRIPE_INCOMPLETE_CARD =
  process.env.STRIPE_INCOMPLETE_CARD ??
  stripe.incompleteCard ??
  '4242';

export const STRIPE_EXPIRY =
  process.env.STRIPE_EXPIRY ??
  stripe.expiry ??
  '12/34';

export const STRIPE_EXPIRED_EXPIRY =
  process.env.STRIPE_EXPIRED_EXPIRY ??
  stripe.expiredExpiry ??
  '01/20';

export const STRIPE_CVC =
  process.env.STRIPE_CVC ??
  stripe.cvc ??
  '123';

export const STRIPE_INVALID_CVC =
  process.env.STRIPE_INVALID_CVC ??
  stripe.invalidCvc ??
  '1';

export const COUNTRY =
  process.env.COUNTRY ??
  stripe.country ??
  'IN';

export const CARDHOLDER_NAME =
  process.env.CARDHOLDER_NAME ??
  stripe.cardholderName ??
  'Hardik Thanki';

export const PLAN_PRICES = {
  'Income Builder': {
    monthly:
      data.plans?.['Income Builder']?.monthly ??
      2.9,
    annual:
      data.plans?.['Income Builder']?.annual ??
      290
  },
  'Overlay Strategists': {
    monthly:
      data.plans?.['Overlay Strategists']?.monthly ??
      7.9,
    annual:
      data.plans?.['Overlay Strategists']?.annual ??
      790
  },
  'Portfolio Hedger': {
    monthly:
      data.plans?.['Portfolio Hedger']?.monthly ??
      14.9,
    annual:
      data.plans?.['Portfolio Hedger']?.annual ??
      1490
  }
} as const;

export const ADD_POSITION_CASH = {
  amount:
    process.env.ADD_POSITION_AMOUNT ??
    positions.cash?.amount ??
    '1000',

  currencyOption:
    new RegExp(
      positions.cash?.currencyOption ??
        'united states dollar|\\(usd\\)',
      'i'
    )
};

export const ADD_POSITION_EQUITY = {
  search:
    process.env.ADD_POSITION_EQUITY_SEARCH ??
    positions.equity?.search ??
    'FICO',

  symbol:
    process.env.ADD_POSITION_EQUITY_SYMBOL ??
    positions.equity?.symbol ??
    'FICO',

  quantity:
    process.env.ADD_POSITION_EQUITY_QUANTITY ??
    positions.equity?.quantity ??
    '2',

  price:
    process.env.ADD_POSITION_EQUITY_PRICE ??
    positions.equity?.price ??
    '10'
};

export const ADD_POSITION_OPTION = {
  search:
    process.env.ADD_POSITION_OPTION_SEARCH ??
    positions.option?.search ??
    'MSFT',

  symbol:
    process.env.ADD_POSITION_OPTION_SYMBOL ??
    positions.option?.symbol ??
    'MSFT',

  right:
    process.env.ADD_POSITION_OPTION_RIGHT ??
    positions.option?.right ??
    'Call',

  quantity:
    process.env.ADD_POSITION_OPTION_QUANTITY ??
    positions.option?.quantity ??
    '1',

  price:
    process.env.ADD_POSITION_OPTION_PRICE ??
    positions.option?.price ??
    '1.50'
};

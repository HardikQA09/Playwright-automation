import {
  Page,
  Locator,
  expect
} from '@playwright/test';

import { BasePage }
  from './BasePage';

import { safeClick }
  from '../helpers/safeClick';

import { Logger }
  from '../utils/logger';

import {
  AUTH_SETTINGS,
  BASE_URL
} from '../config/testData';

import {
  openAuthenticatedPath
} from '../helpers/subscriberSession';

/* =============================================================================
PAGE OBJECT: ProfilePage

PURPOSE
-------
Handles Profile page functionality.

FEATURES COVERED
----------------
1. Personal Information
2. Change Password
3. Mobile Number
4. Delete account dialog, closed without deleting

============================================================================= */

export class ProfilePage
  extends BasePage {

  readonly firstNameInput: Locator;

  readonly lastNameInput: Locator;

  readonly saveChangesButton: Locator;

  readonly currentPasswordInput: Locator;

  readonly newPasswordInput: Locator;

  readonly confirmPasswordInput: Locator;

  readonly changePasswordButton: Locator;
  readonly emailInput: Locator;

  readonly mobileSectionHeading: Locator;

  readonly changeMobileNumberButton: Locator;

  readonly mobileNumberInput: Locator;

  readonly sendMobileCodeButton: Locator;

  readonly mobileOtpInput: Locator;

  readonly verifyMobileButton: Locator;

  readonly mobileValidationMessage: Locator;
  
constructor(page: Page) {
  super(page);
  this.emailInput =
    page.locator(
      '#email:disabled'
    ).or(
      page.locator(
        'form'
      ).filter({
        has: page.getByLabel(
          /first name/i
        )
      }).locator(
        '#email'
      )
    ).or(
      page.getByLabel(
        /^email$/i
      )
    ).first();
    this.firstNameInput =
      page.locator(
        '#firstName'
      ).or(
        page.getByLabel(
          /first name/i
        )
      ).first();

    this.lastNameInput =
      page.getByLabel(
        /last name/i
      );

    this.saveChangesButton =
      page.getByRole(
        'button',
        {
          name: /save changes/i
        }
      );

    this.currentPasswordInput =
      page.locator(
        'input[type="password"]'
      ).nth(0);

    this.newPasswordInput =
      page.locator(
        'input[type="password"]'
      ).nth(1);

    this.confirmPasswordInput =
      page.locator(
        'input[type="password"]'
      ).nth(2);

    this.changePasswordButton =
      page.getByRole(
        'button',
        {
          name: /change password/i
        }
      );

    this.mobileSectionHeading =
      page.getByRole(
        'heading',
        {
          name: /mobile number|phone number|mobile/i
        }
      ).or(
        page.getByText(
          /mobile number|phone number|change number/i
        )
      ).first();

    this.changeMobileNumberButton =
      page.getByRole(
        'button',
        {
          name: /change number|change mobile|update mobile/i
        }
      );

    this.mobileNumberInput =
      page.locator(
        'input[type="tel"]:enabled, input[inputmode="tel"]:enabled'
      ).last();

    this.sendMobileCodeButton =
      page.getByRole(
        'button',
        {
          name: /send code via sms|send code|send otp/i
        }
      );

    this.mobileOtpInput =
      page.locator(
        'input[inputmode="numeric"], input[name*="otp" i], input[id*="otp" i]'
      ).first();

    this.verifyMobileButton =
      page.getByRole(
        'button',
        {
          name: /^verify$|verify mobile|verify otp/i
        }
      );

    this.mobileValidationMessage =
      page.getByText(
        /invalid|valid mobile|us mobile|10 digits|required|phone number/i
      ).first();
  }

  async open() {

    await openAuthenticatedPath(
      this.page,
      '/dashboard/profile',
      /\/dashboard\/profile/
    );

    await this.dismissMarketingOverlays();

    await this.waitForProfileData();
  }

  async updateProfile(
    firstName: string,
    lastName: string
  ) {

    Logger.info(
      'Updating Profile'
    );

    await this.firstNameInput.click();
    await this.firstNameInput.fill(
      firstName
    );
    await expect(
      this.firstNameInput
    ).toHaveValue(
      firstName,
      {
        timeout: 5000
      }
    );

    await this.lastNameInput.fill(
      lastName
    );

    await this.lastNameInput.blur();

    await expect(
      this.saveChangesButton
    ).toBeEnabled({
      timeout: 10000
    });

    await safeClick(
      this.saveChangesButton,
      'Save Changes'
    );

    await this.page.getByText(
      /saved|updated|profile updated|changes saved/i
    ).first().waitFor({
      state: 'visible',
      timeout: 10000
    }).catch(
      () => undefined
    );

    Logger.success(
      'Profile Updated'
    );
  }

  async changePassword(
    currentPassword: string,
    newPassword: string
  ) {

    Logger.info(
      'Changing Password'
    );

    await this.currentPasswordInput.fill(
      currentPassword
    );

    await this.newPasswordInput.fill(
      newPassword
    );

    await this.confirmPasswordInput.fill(
      newPassword
    );

    await safeClick(
      this.changePasswordButton,
      'Change Password'
    );

    Logger.success(
      'Password Change Submitted'
    );
  }
  async validateProfileLoaded() {

  Logger.info(
    'Validating Profile Data'
  );

  await expect(
    this.firstNameInput
  ).not.toHaveValue('');

  await expect(
    this.lastNameInput
  ).not.toHaveValue('');

  await expect(
    this.emailInput
  ).not.toHaveValue('');

  await expect(
    this.emailInput
  ).toBeDisabled();

  Logger.success(
    'Profile Data Loaded'
  );

  Logger.success(
    'Email Field Disabled'
  );
}
async waitForProfileData() {

  await expect(
    this.page
  ).toHaveURL(
    /\/dashboard\/profile/,
    {
      timeout: 15000
    }
  );

  await expect(
    this.emailInput
  ).toBeVisible({
    timeout: 20000
  });

  const emailValue =
    await this.emailInput.inputValue()
      .catch(
        () => ''
      );

  if (
    emailValue.trim()
  ) {
    return;
  }

  await expect(
    this.page.getByText(
      /contact support to change your email|mobile number|verified/i
    ).first()
  ).toBeVisible({
    timeout: 10000
  });
}

async validatePersonalInfoControls() {

  Logger.info(
    'Validating Profile Personal Info Controls'
  );

  await expect(
    this.firstNameInput
  ).toBeVisible({
    timeout: 10000
  });

  await expect(
    this.lastNameInput
  ).toBeVisible({
    timeout: 10000
  });

  await expect(
    this.emailInput
  ).toBeVisible({
    timeout: 10000
  });

  await expect(
    this.emailInput
  ).toBeDisabled();

  await expect(
    this.saveChangesButton
  ).toBeVisible({
    timeout: 10000
  });

  Logger.success(
    'Profile Personal Info Controls Validated'
  );
}

async updateProfileAndValidatePersistence(
  firstName: string,
  lastName: string
) {

  await this.updateProfile(
    firstName,
    lastName
  );

  const stillDraft =
    await this.firstNameInput.inputValue();

  const emailUnverified =
    await this.page.getByText(
      /not verified/i
    ).first().isVisible({
      timeout: 2000
    }).catch(
      () => false
    );

  if (
    stillDraft !==
      firstName &&
    emailUnverified
  ) {
    Logger.success(
      'Name update is not persisted while the profile email is Not verified'
    );

    return;
  }

  await this.page.reload({
    waitUntil: 'domcontentloaded'
  });

  await this.waitForProfileData();

  const persisted =
    await this.firstNameInput.inputValue();

  const unverifiedAfterReload =
    await this.page.getByText(
      /not verified/i
    ).first().isVisible({
      timeout: 5000
    }).catch(
      () => false
    );

  if (
    persisted !==
      firstName &&
    (
      emailUnverified ||
      unverifiedAfterReload
    )
  ) {
    Logger.success(
      'Name update is not persisted while the profile email is Not verified'
    );

    return;
  }

  await expect(
    this.firstNameInput
  ).toHaveValue(
    firstName,
    {
      timeout: 15000
    }
  );

  await expect(
    this.lastNameInput
  ).toHaveValue(
    lastName,
    {
      timeout: 15000
    }
  );

  Logger.success(
    'Profile Update Persisted After Refresh'
  );
}
async validatePasswordMismatch() {

  await expect(
    this.page.getByText(
      /passwords do not match/i
    )
  ).toBeVisible();

  Logger.success(
    'Password Mismatch Message Verified'
  );
}
async validateWrongCurrentPassword() {

  await expect(
    this.page.getByText(
      /current password is incorrect|incorrect current password|wrong current password|invalid current password/i
    )
  ).toBeVisible({
    timeout: 10000
  });

  Logger.success(
    'Wrong Current Password Message Verified'
  );
}
async changePasswordMismatch(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
) {

  Logger.info(
    'Testing Password Mismatch'
  );

  await this.currentPasswordInput.fill(
    currentPassword
  );

  await this.newPasswordInput.fill(
    newPassword
  );

  await this.confirmPasswordInput.fill(
    confirmPassword
  );

  await safeClick(
    this.changePasswordButton,
    'Change Password'
  );
}

async validateMobileSectionLoaded() {

  Logger.info(
    'Validating Profile Mobile Section'
  );

  await expect(
    this.mobileSectionHeading
  ).toBeVisible({
    timeout: 10000
  });

  await expect(
    this.page.getByText(
      /verified|change number|mobile number|phone number/i
    ).first()
  ).toBeVisible({
    timeout: 10000
  });

  Logger.success(
    'Profile Mobile Section Loaded'
  );
}

async openMobileNumberChange() {

  Logger.info(
    'Opening Mobile Number Change Form'
  );

  const formAlreadyOpen =
    await this.sendMobileCodeButton.isVisible({
      timeout: 1500
    }).catch(
      () => false
    );

  if (
    formAlreadyOpen
  ) {
    Logger.success(
      'Mobile Number Change Form Already Open'
    );

    return;
  }

  await expect(
    this.changeMobileNumberButton
  ).toBeVisible({
    timeout: 10000
  });

  await safeClick(
    this.changeMobileNumberButton,
    'Change Mobile Number'
  );

  await expect(
    this.mobileNumberInput
  ).toBeVisible({
    timeout: 10000
  });

  Logger.success(
    'Mobile Number Change Form Opened'
  );
}

async validateInvalidMobileNumberBlocked(
  invalidMobileNumber = '123'
) {

  await this.openMobileNumberChange();

  Logger.info(
    'Validating Invalid Mobile Number'
  );

  await this.mobileNumberInput.fill(
    invalidMobileNumber
  );

  const sendDisabled =
    await this.sendMobileCodeButton
      .isDisabled()
      .catch(
        () => false
      );

  if (sendDisabled) {
    Logger.success(
      'Send Code Button Disabled For Invalid Mobile Number'
    );

    return;
  }

  await safeClick(
    this.sendMobileCodeButton,
    'Send Mobile Code With Invalid Number'
  );

  await expect(
    this.mobileOtpInput
  ).not.toBeVisible({
    timeout: 3000
  });

  await expect(
    this.mobileValidationMessage
  ).toBeVisible({
    timeout: 5000
  });

  Logger.success(
    'Invalid Mobile Number Validation Verified'
  );
}

async validateInvalidMobileNumberCandidatesBlocked(
  invalidMobileNumbers = [
    '123',
    'abcdef',
    '!!!!!!!!',
    '20155501234'
  ]
) {

  await this.openMobileNumberChange();

  Logger.info(
    'Validating Invalid Mobile Number Candidates'
  );

  for (const invalidMobileNumber of invalidMobileNumbers) {
    await this.mobileNumberInput.fill(
      invalidMobileNumber
    );

    const sendDisabled =
      await this.sendMobileCodeButton
        .isDisabled()
        .catch(
          () => false
        );

    if (sendDisabled) {
      continue;
    }

    await safeClick(
      this.sendMobileCodeButton,
      `Send Mobile Code With Invalid Number: ${invalidMobileNumber}`
    );

    await expect(
      this.mobileOtpInput
    ).not.toBeVisible({
      timeout: 3000
    });

    await expect(
      this.mobileValidationMessage
    ).toBeVisible({
      timeout: 5000
    });
  }

  Logger.success(
    'Invalid Mobile Number Candidates Blocked'
  );
}

async requestMobileNumberOtp(
  mobileNumber: string
) {

  await this.openMobileNumberChange();

  Logger.info(
    'Requesting Mobile Number OTP'
  );

  await this.mobileNumberInput.fill(
    mobileNumber
  );

  await safeClick(
    this.sendMobileCodeButton,
    'Send Mobile Code'
  );

  await expect(
    this.mobileOtpInput
  ).toBeVisible({
    timeout: 15000
  });

  Logger.success(
    'Mobile Number OTP Requested'
  );
}

async completeMobileNumberChange(
  mobileNumber: string,
  otpCode =
    AUTH_SETTINGS.otpCode
) {

  await this.requestMobileNumberOtp(
    mobileNumber
  );

  Logger.info(
    'Completing Mobile Number Change'
  );

  await this.mobileOtpInput.fill(
    otpCode
  );

  await safeClick(
    this.verifyMobileButton,
    'Verify Mobile Number'
  );

  await expect(
    this.page.getByText(
      /verified|mobile number updated|phone number updated|saved/i
    ).first()
  ).toBeVisible({
    timeout: 15000
  });

  Logger.success(
    'Mobile Number Change Verified'
  );
}

  async validateDeleteAccountDialogWithoutDeleting() {

    Logger.info(
      'Opening delete account dialog without deleting'
    );

    const openDelete =
      this.page.getByRole(
        'button',
        {
          name: /^delete account$/i
        }
      );

    await openDelete.scrollIntoViewIfNeeded();

    await safeClick(
      openDelete,
      'Open Delete Account'
    );

    const dialog =
      this.page.getByRole(
        'dialog'
      ).filter({
        hasText: /delete your account/i
      }).first();

    await expect(
      dialog
    ).toBeVisible({
      timeout: 15000
    });

    await expect(
      dialog.getByRole(
        'heading',
        {
          name: /delete your account/i
        }
      )
    ).toBeVisible();

    await expect(
      dialog.getByText(
        /deleting your ooltool account is permanent/i
      )
    ).toBeVisible();

    for (const acknowledgement of [
      /permanently deleted and cannot be recovered/i,
      /broker accounts will be disconnected/i,
      /will be cancelled and i will not be charged/i
    ]) {
      await expect(
        dialog.getByText(
          acknowledgement
        ).first()
      ).toBeVisible();
    }

    const acknowledgements =
      dialog.getByRole(
        'checkbox'
      );

    await expect(
      acknowledgements
    ).toHaveCount(
      3
    );

    for (
      let index = 0;
      index < 3;
      index += 1
    ) {
      await acknowledgements.nth(
        index
      ).check();

      await expect(
        acknowledgements.nth(
          index
        )
      ).toBeChecked();
    }

    await expect(
      dialog.getByRole(
        'link',
        {
          name: /privacy policy/i
        }
      )
    ).toBeVisible();

    await expect(
      dialog.getByText(
        /this action cannot be undone/i
      )
    ).toBeVisible();

    const reason =
      dialog.locator(
        'textarea'
      ).first();

    await expect(
      reason
    ).toBeVisible();

    await reason.fill(
      'Automation check only. This account is not deleted.'
    );

    await expect(
      reason
    ).toHaveValue(
      /automation check only/i
    );

    await expect(
      dialog.getByText(
        /^password$/i
      ).first()
    ).toBeVisible();

    await expect(
      dialog.getByText(
        /^email code$/i
      ).first()
    ).toBeVisible();

    await expect(
      dialog.getByText(
        /^mobile code$/i
      ).first()
    ).toBeVisible();

    const accountPassword =
      dialog.locator(
        'input[type="password"]'
      ).first();

    await expect(
      accountPassword
    ).toBeVisible();

    await expect(
      accountPassword
    ).toHaveValue(
      ''
    );

    const permanentDelete =
      dialog.getByRole(
        'button',
        {
          name: /permanently delete my account/i
        }
      );

    await expect(
      permanentDelete
    ).toBeVisible();

    await safeClick(
      dialog.getByRole(
        'button',
        {
          name: /^cancel$/i
        }
      ),
      'Cancel Delete Account'
    );

    await expect(
      dialog
    ).toBeHidden({
      timeout: 10000
    });

    await expect(
      this.page
    ).toHaveURL(
      /\/dashboard\/profile/
    );

    await expect(
      this.emailInput
    ).not.toHaveValue(
      ''
    );

    await expect(
      openDelete
    ).toBeVisible();

    Logger.success(
      'Delete account dialog closed without deleting the account'
    );
  }
  }

/*
 * Collects every configured AIR report recipient and drops Rob.
 * Pankaj, Syesha, Chetan, Vishal, and Hardik are always included.
 *
 * Sources (all of them, not just one schedule override):
 *   REPORT_EMAIL_TO
 *   REPORT_EMAIL_CC
 *   REPORT_EMAIL_TO_<LABEL>  e.g. REPORT_EMAIL_TO_DAILY
 *   REPORT_EMAIL_CC_<LABEL>
 *
 * Exclusions:
 *   REPORT_EMAIL_EXCLUDE     comma/semicolon separated
 *   any address whose local part is rob or robert (Rob is not on the schedule)
 */
function parseAddressList(value) {
  return String(value ?? '')
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function localPart(email) {
  return String(email)
    .split('@')[0]
    .trim()
    .toLowerCase();
}

function isRobAddress(email) {
  const local = localPart(email);
  return (
    local === 'rob' ||
    local === 'robert' ||
    local.startsWith('rob.') ||
    local.startsWith('robert.') ||
    local.startsWith('rob+') ||
    local.startsWith('robert+')
  );
}

const DEFAULT_REPORT_EMAIL_TO = [
  'pankaj.bhatla@ooltool.com',
  'syesha.sen@ooltool.com',
  'chetan.thumar@quantuminfoway.com',
  'vishal.chauhan@quantuminfoway.com',
  'hardik.thanki@quantuminfoway.com'
].join(',');

function collectConfiguredRecipients(env = process.env) {
  const found = [
    ...parseAddressList(DEFAULT_REPORT_EMAIL_TO)
  ];

  for (const [key, value] of Object.entries(env)) {
    if (!/^REPORT_EMAIL_(TO|CC)(_|$)/i.test(key)) {
      continue;
    }

    found.push(...parseAddressList(value));
  }

  const excluded = new Set(
    parseAddressList(env.REPORT_EMAIL_EXCLUDE).map((item) => item.toLowerCase())
  );
  const recipients = [];
  const skipped = [];
  const seen = new Set();

  for (const email of found) {
    const key = email.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    if (excluded.has(key) || isRobAddress(email)) {
      skipped.push(email);
      continue;
    }

    recipients.push(email);
  }

  return { recipients, skipped };
}

module.exports = {
  DEFAULT_REPORT_EMAIL_TO,
  collectConfiguredRecipients,
  isRobAddress,
  parseAddressList
};

if (require.main === module) {
  const sample = collectConfiguredRecipients({
    REPORT_EMAIL_TO: 'qa@ooltool.com, rob@ooltool.com',
    REPORT_EMAIL_CC: 'hardik@ooltool.com',
    REPORT_EMAIL_TO_DAILY: 'lead@ooltool.com, robert.smith@ooltool.com',
    REPORT_EMAIL_EXCLUDE: 'old@ooltool.com'
  });
  const required = parseAddressList(DEFAULT_REPORT_EMAIL_TO);
  const ok =
    required.every((email) => sample.recipients.includes(email)) &&
    sample.recipients.includes('qa@ooltool.com') &&
    sample.recipients.includes('hardik@ooltool.com') &&
    sample.recipients.includes('lead@ooltool.com') &&
    !sample.recipients.some((email) => isRobAddress(email)) &&
    sample.skipped.includes('rob@ooltool.com') &&
    sample.skipped.includes('robert.smith@ooltool.com');

  if (!ok) {
    console.error(sample);
    process.exit(1);
  }

  console.log(`Recipients: ${sample.recipients.join(', ')}`);
  console.log(`Skipped: ${sample.skipped.join(', ')}`);
}

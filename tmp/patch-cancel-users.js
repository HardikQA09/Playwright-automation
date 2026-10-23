const fs = require('fs');
const p = 'tests/config/testData.ts';
let s = fs.readFileSync(p, 'utf8');

if (!s.includes('const cancelYearly =')) {
  s = s.replace(
    'const e2e =\n  data.users?.e2e ?? {};\n\nconst auth =',
    [
      'const e2e =',
      '  data.users?.e2e ?? {};',
      '',
      'const cancelYearly =',
      '  data.users?.cancelYearly ?? {};',
      '',
      'const cancelMonthly =',
      '  data.users?.cancelMonthly ?? {};',
      '',
      'const auth ='
    ].join('\n')
  );
}

if (!s.includes('cancelYearly: {')) {
  const insert = [
    '  cancelYearly: {',
    '',
    '    email:',
    '      process.env.SUB_LIFECYCLE_YEARLY_CANCEL_EMAIL ??',
    '      process.env.CANCEL_YEARLY_EMAIL ??',
    '      cancelYearly.email ??',
    '      e2e.email ??',
    "      'imhardikthanki+e2e@gmail.com',",
    '',
    '    password:',
    '      process.env.SUB_LIFECYCLE_YEARLY_CANCEL_PASSWORD ??',
    '      process.env.CANCEL_YEARLY_PASSWORD ??',
    '      cancelYearly.password ??',
    '      e2e.password ??',
    "      'H@rdik9944'",
    '  },',
    '',
    '  cancelMonthly: {',
    '',
    '    email:',
    '      process.env.SUB_LIFECYCLE_MONTHLY_CANCEL_EMAIL ??',
    '      process.env.CANCEL_MONTHLY_EMAIL ??',
    '      cancelMonthly.email ??',
    "      'imhardikthanki+monthly-to-a-mvjn15yr@gmail.com',",
    '',
    '    password:',
    '      process.env.SUB_LIFECYCLE_MONTHLY_CANCEL_PASSWORD ??',
    '      process.env.CANCEL_MONTHLY_PASSWORD ??',
    '      cancelMonthly.password ??',
    '      e2e.password ??',
    "      'H@rdik9944'",
    '  },',
    '',
    ''
  ].join('\n');

  s = s.replace(
    '  mfaLocal: {\n\n    email:\n      process.env.MFA_LOCAL_EMAIL,',
    insert + '  mfaLocal: {\n\n    email:\n      process.env.MFA_LOCAL_EMAIL,'
  );
}

fs.writeFileSync(p, s);
console.log(
  JSON.stringify({
    consts: s.includes('const cancelYearly ='),
    users: s.includes('cancelYearly: {')
  })
);

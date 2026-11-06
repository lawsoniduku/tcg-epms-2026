export class DomainError extends Error {
  constructor(message, status = 422) { super(message); this.status = status; }
}
export function requireThat(ok, message, status = 422) {
  if (!ok) throw new DomainError(message, status);
}
export const ratingLabels = { 1: 'Does not meet expectations', 2: 'Improvement required', 3: 'Meets expectations', 4: 'Exceeds expectations', 5: 'Exceptional' };
export function hundredths(value, name = 'Score') {
  requireThat(typeof value === 'number' || typeof value === 'string', `${name} must be numeric.`);
  const input = String(value);
  requireThat(/^(\d+|\d*\.\d{1,2})$/.test(input), `${name} must be a non-negative number with up to two decimal places.`);
  const [whole, frac = ''] = input.split('.');
  const result = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  requireThat(Number.isSafeInteger(result), `${name} is too large.`);
  return result;
}
export function scoreValue(value, name = 'Score') {
  const n = hundredths(value, name);
  requireThat(n >= 100 && n <= 500, `${name} must be between 1.00 and 5.00.`);
  return n;
}
export function ratingFor(score) {
  const n = scoreValue(score);
  return n >= 450 ? 5 : n >= 375 ? 4 : n >= 275 ? 3 : n >= 200 ? 2 : 1;
}
export function trackFor(employee) {
  return !employee.confirmed ? 'C' : employee.commercial ? 'B' : 'A';
}
export function trackAScore(bsc, behaviour) {
  return Math.round((scoreValue(bsc) * 70 + scoreValue(behaviour) * 30) / 100) / 100;
}
export function visibleTo(actor, employee) {
  if (!actor || !employee) return false;
  if (['pm', 'executive', 'auditor'].includes(actor.role)) return true;
  if (actor.role === 'hod') return actor.department === employee.department;
  if (actor.role === 'manager') return employee.managerId === actor.id || employee.id === actor.employeeId;
  return employee.id === actor.employeeId;
}
export const canFinalise = actor => actor?.role === 'pm';
export const canCalibrate = actor => ['pm', 'hod'].includes(actor?.role);
export function finalisationPreview(appraisal, input, policy) {
  const allowed = new Set(['deductionPoints', 'reason', 'evidence', 'basis', 'expectedVersion']);
  requireThat(Object.keys(input).every(k => allowed.has(k)), 'Submitted supervisor or final scores cannot be overridden.');
  requireThat(appraisal.track === 'A', 'This quarterly finalisation workflow is available only for Track A.');
  requireThat(appraisal.status !== 'locked', 'This score is locked. An authorised reopening is required.', 409);
  requireThat(appraisal.supervisorScore != null, 'A supervisor submission is required.');
  requireThat(appraisal.calibrationComplete, 'Complete calibration before finalisation.');
  requireThat(input.expectedVersion === appraisal.version, 'The record changed. Reload before trying again.', 409);
  const base = scoreValue(appraisal.calibratedScore ?? appraisal.supervisorScore);
  const deduction = hundredths(input.deductionPoints ?? 0, 'Deduction');
  if (deduction > 0) {
    requireThat(policy.mode === 'controlled', 'Deductions are disabled pending management authorisation.');
    requireThat(policy.approvalReference && policy.approvedBy && policy.tracks?.includes(appraisal.track), 'A complete approved deduction configuration is required.');
    requireThat(typeof policy.maxPoints === 'number' && typeof policy.floor === 'number', 'Approved deduction limits are missing.');
    requireThat(deduction <= hundredths(policy.maxPoints), 'Deduction exceeds the approved cap.');
    requireThat(String(input.reason ?? '').trim().length > 0, 'A reason is required for a nonzero deduction.');
    requireThat(String(input.basis ?? '').trim().length > 0, 'A policy or provisional event basis is required.');
    if (policy.evidenceRequired) requireThat(String(input.evidence ?? '').trim(), 'An evidence reference is required.');
    requireThat(base - deduction >= scoreValue(policy.floor), 'Deduction would take the score below the approved floor.');
  }
  const finalScore = (base - deduction) / 100;
  return { baseScore: base / 100, deductionPoints: deduction / 100, finalScore, finalRating: ratingFor(finalScore) };
}
export function aggregateFeedback(categories, rule) {
  requireThat(rule?.approved, '360 redistribution rules require approval before scoring.');
  const valid = categories.filter(c => !['peer', 'direct_report'].includes(c.type) || c.count >= 3);
  requireThat(valid.length > 0 && valid.reduce((s,c) => s+c.weight,0) > 0, 'No valid observer categories.');
  const total = valid.reduce((s,c) => s+c.weight,0);
  return { score: Math.round(valid.reduce((s,c) => s + scoreValue(c.score) * c.weight,0)/total)/100, suppressed: categories.filter(c => !valid.includes(c)).map(c=>c.type) };
}

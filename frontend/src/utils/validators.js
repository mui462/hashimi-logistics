const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^[+()\-.\s\d]{7,20}$/;

export const isBlank = (value) => value === undefined || value === null || String(value).trim() === '';

export const required = (value, label) => (isBlank(value) ? `${label} is required.` : '');

export function validEmail(value, label = 'Email') {
  if (isBlank(value)) return `${label} is required.`;
  return EMAIL_PATTERN.test(String(value).trim()) ? '' : 'Enter a valid email address.';
}

export function validPhone(value, label = 'Phone', { optional = false } = {}) {
  if (isBlank(value)) return optional ? '' : `${label} is required.`;
  return PHONE_PATTERN.test(String(value).trim()) && String(value).replace(/\D/g, '').length >= 7
    ? ''
    : 'Enter a valid phone number.';
}

export function positiveNumber(value, label, { optional = false } = {}) {
  if (isBlank(value)) return optional ? '' : `${label} is required.`;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? '' : `${label} must be a number greater than zero.`;
}

export function maxLength(value, max, label) {
  return !isBlank(value) && String(value).length > max ? `${label} must be ${max} characters or fewer.` : '';
}

export function digitsOnly(value, label, { optional = false } = {}) {
  if (isBlank(value)) return optional ? '' : `${label} is required.`;
  return /^\d{3,10}$/.test(String(value).trim()) ? '' : `${label} must contain 3 to 10 digits.`;
}

export function dateNotInPast(value, label) {
  if (isBlank(value)) return `${label} is required.`;
  const chosen = new Date(`${value}T00:00:00`);
  if (Number.isNaN(chosen.getTime())) return `Enter a valid ${label.toLowerCase()}.`;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return chosen < today ? `${label} cannot be in the past.` : '';
}

export function dateNotBefore(value, earlier, label, earlierLabel) {
  if (isBlank(value) || isBlank(earlier)) return '';
  return new Date(`${value}T00:00:00`) < new Date(`${earlier}T00:00:00`) ? `${label} cannot be before ${earlierLabel.toLowerCase()}.` : '';
}

// Client-side attachment limits (a convenience; the server must enforce its own).
export const FILE_RULES = { maxBytes: 10 * 1024 * 1024, maxFiles: 5, extensions: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'] };

export function validateFiles(files = [], rules = FILE_RULES) {
  if (files.length > rules.maxFiles) return `Attach no more than ${rules.maxFiles} files.`;
  for (const file of files) {
    const extension = file.name.split('.').pop().toLowerCase();
    if (!rules.extensions.includes(extension)) return `${file.name}: allowed file types are ${rules.extensions.join(', ').toUpperCase()}.`;
    if (file.size > rules.maxBytes) return `${file.name} is larger than ${Math.round(rules.maxBytes / 1024 / 1024)} MB.`;
  }
  return '';
}

export const hasErrors = (errors) => Object.values(errors).some(Boolean);

import { ApiError } from '../utils/ApiError.js';
import { ALLOWED_TYPES, MIME_EXTENSION } from './fileTypes.js';

/**
 * Validates an uploaded file by what it actually is, never by what it claims to be.
 *  1. the declared Content-Type must be on the allow-list for this upload (media library or private documents);
 *  2. the file name extension must belong to that type (so "invoice.pdf.exe" and "photo.php" are refused);
 *  3. the leading bytes must be a real file of that type (so a script renamed ".png" is refused);
 *  4. text that looks like HTML, script, PHP or a shell script is refused even if a header slips through.
 * There is no malware scanning in this phase (see docs/STORAGE_AND_DOCUMENTS.md).
 */

const CONTROL = /[\u0000-\u001f\u007f]/g;
const UNSAFE_NAME = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const BLOCKED_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'dll', 'sh', 'bash', 'ps1', 'vbs', 'js', 'mjs', 'jar', 'php', 'phtml', 'asp', 'aspx', 'jsp',
  'py', 'rb', 'pl', 'cgi', 'html', 'htm', 'xhtml', 'svg', 'xml', 'swf', 'hta', 'lnk', 'apk', 'dmg', 'iso', 'zip', 'rar', '7z', 'docm', 'xlsm',
]);

const unsupported = (message = 'That file type is not supported.') => new ApiError(415, message, [], 'UNSUPPORTED_FILE_TYPE');
const mismatch = () => new ApiError(422, 'The file contents do not match its type, so it was not uploaded.', [], 'FILE_CONTENT_MISMATCH');

/** A display-safe file name: no path, no control or markup characters, bounded length. Never used to build a storage path. */
export function sanitizeFileName(value, fallback = 'file') {
  const base = String(value ?? '').normalize('NFKC').split(/[\\/]/).pop().replace(CONTROL, '').replace(UNSAFE_NAME, '').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  if (!base) return fallback;
  if (base.length <= 150) return base;
  const dot = base.lastIndexOf('.');
  const extension = dot > 0 ? base.slice(dot).slice(0, 10) : '';
  return `${base.slice(0, 150 - extension.length)}${extension}`;
}

function extensionsOf(name) {
  // Every dot-separated part after the first counts, so "report.php.png" is judged on "php" too.
  return name.toLowerCase().split('.').slice(1);
}

const startsWith = (buffer, bytes, offset = 0) => bytes.every((byte, index) => buffer[offset + index] === byte);
const ascii = (buffer, start, end) => buffer.toString('latin1', start, end);

function detectType(buffer) {
  if (buffer.length < 12) return null;
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (ascii(buffer, 0, 6) === 'GIF87a' || ascii(buffer, 0, 6) === 'GIF89a') return 'image/gif';
  if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WEBP') return 'image/webp';
  if (ascii(buffer, 0, 5) === '%PDF-') return 'application/pdf';
  if (ascii(buffer, 4, 8) === 'ftyp') return ['heic', 'heix', 'mif1', 'msf1', 'avif', 'avis', 'crx '].includes(ascii(buffer, 8, 12)) ? null : 'video/mp4';
  if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return ascii(buffer, 0, Math.min(buffer.length, 64)).includes('webm') ? 'video/webm' : null;
  return null;
}

const SCRIPTY = /^\s*(?:<!doctype|<html|<head|<body|<script|<svg|<\?php|<\?xml|#!\/|<%)/i;

function pngSize(buffer) {
  return buffer.length >= 24 && ascii(buffer, 12, 16) === 'IHDR' ? { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) } : {};
}
function gifSize(buffer) {
  return buffer.length >= 10 ? { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) } : {};
}
function jpegSize(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    const length = buffer.readUInt16BE(offset + 2);
    if ((marker >= 0xc0 && marker <= 0xcf) && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    if (length < 2) break;
    offset += 2 + length;
  }
  return {};
}
function webpSize(buffer) {
  const chunk = ascii(buffer, 12, 16);
  if (chunk === 'VP8X' && buffer.length >= 30) return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  if (chunk === 'VP8L' && buffer.length >= 25) { const bits = buffer.readUInt32LE(21); return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }; }
  if (chunk === 'VP8 ' && buffer.length >= 30) return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  return {};
}
function mp4Duration(buffer) {
  const at = buffer.indexOf('mvhd');
  if (at < 0 || at + 28 > buffer.length) return {};
  const version = buffer[at + 4];
  const timescale = version === 1 ? buffer.readUInt32BE(at + 24) : buffer.readUInt32BE(at + 16);
  const duration = version === 1 ? Number(buffer.readBigUInt64BE(at + 28)) : buffer.readUInt32BE(at + 20);
  return timescale > 0 ? { duration: Math.round((duration / timescale) * 10) / 10 } : {};
}

/**
 * @param {Buffer} buffer
 * @param {{ declaredType: string, fileName: string, purpose: 'media' | 'document' }} input
 * @returns {{ mimeType: string, kind: string, extension: string, fileName: string, width?: number, height?: number, duration?: number }}
 */
export function inspectFile(buffer, { declaredType, fileName, purpose }) {
  const allowed = ALLOWED_TYPES[purpose];
  const rule = allowed?.[String(declaredType ?? '').toLowerCase()];
  if (!rule) throw unsupported();
  const safeName = sanitizeFileName(fileName);
  const parts = extensionsOf(safeName);
  if (parts.length === 0) throw unsupported('The file name needs an extension such as .pdf or .jpg.');
  if (parts.some((part) => BLOCKED_EXTENSIONS.has(part))) throw unsupported('Executable, script and web files cannot be uploaded.');
  if (!rule.extensions.includes(parts[parts.length - 1])) throw unsupported('The file name extension does not match the file type.');
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new ApiError(400, 'The uploaded file is empty.', [], 'EMPTY_FILE');
  if (SCRIPTY.test(buffer.toString('latin1', 0, 512))) throw unsupported('Web pages, scripts and markup cannot be uploaded.');
  const detected = detectType(buffer);
  if (detected !== declaredType.toLowerCase()) throw mismatch();

  const dimensions =
    detected === 'image/png' ? pngSize(buffer) : detected === 'image/gif' ? gifSize(buffer) : detected === 'image/jpeg' ? jpegSize(buffer) : detected === 'image/webp' ? webpSize(buffer) : {};
  const extra = detected === 'video/mp4' ? mp4Duration(buffer) : {};
  const clean = (value) => (Number.isFinite(value) && value > 0 && value <= 20000 ? Math.round(value) : undefined);
  return {
    mimeType: detected,
    kind: rule.kind,
    extension: MIME_EXTENSION[detected],
    fileName: safeName,
    ...(clean(dimensions.width) ? { width: clean(dimensions.width) } : {}),
    ...(clean(dimensions.height) ? { height: clean(dimensions.height) } : {}),
    ...(extra.duration ? { duration: extra.duration } : {}),
  };
}

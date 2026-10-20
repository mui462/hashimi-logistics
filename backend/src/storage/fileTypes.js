/**
 * The only file types this system accepts, in one place. Anything not listed here (executables, scripts, HTML, SVG,
 * archives, Office macros, unknown binaries) is refused. A file is accepted only when its declared type, its file name
 * extension AND its actual leading bytes all agree (see fileValidation.js).
 */
export const FILE_KINDS = Object.freeze({
  image: 'image',
  video: 'video',
  document: 'document',
});

const IMAGE_TYPES = {
  'image/jpeg': { kind: 'image', extensions: ['jpg', 'jpeg'] },
  'image/png': { kind: 'image', extensions: ['png'] },
  'image/webp': { kind: 'image', extensions: ['webp'] },
  'image/gif': { kind: 'image', extensions: ['gif'] },
};
const VIDEO_TYPES = {
  'video/mp4': { kind: 'video', extensions: ['mp4'] },
  'video/webm': { kind: 'video', extensions: ['webm'] },
};
// Operational documents: PDFs and photos/scans. No GIF, no video.
const DOCUMENT_TYPES = {
  'application/pdf': { kind: 'document', extensions: ['pdf'] },
  'image/jpeg': { kind: 'document', extensions: ['jpg', 'jpeg'] },
  'image/png': { kind: 'document', extensions: ['png'] },
  'image/webp': { kind: 'document', extensions: ['webp'] },
};

/** `media` = website library (images and video). `document` = private operational documents. */
export const ALLOWED_TYPES = Object.freeze({
  media: Object.freeze({ ...IMAGE_TYPES, ...VIDEO_TYPES }),
  document: Object.freeze(DOCUMENT_TYPES),
});

export const MIME_EXTENSION = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
});

export const mediaTypeOf = (mimeType) => (mimeType?.startsWith('video/') ? 'video' : mimeType?.startsWith('image/') ? 'image' : 'document');

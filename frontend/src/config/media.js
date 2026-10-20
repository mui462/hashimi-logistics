// Media placeholder system. The final hero video and photography will be supplied by the client
// through the Phase 9 CMS. Until then every field is empty and the site renders original
// illustrated scenes (see components/media/FreightScene.jsx). No third-party video or image is hard-coded.
export const heroMedia = {
  // e.g. an MP4/WebM URL. Leave empty to use the illustrated fallback.
  videoSrc: '',
  videoType: 'video/mp4',
  // Poster / fallback photograph shown before the video plays or if it fails.
  posterSrc: '',
  posterAlt: '',
};

// Optional per-slot image overrides keyed by industry/service slug (empty = illustrated scene).
export const imageOverrides = {};

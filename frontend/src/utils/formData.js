// Builds multipart FormData from plain fields plus named file lists. Arrays are sent as repeated keys.
export function buildFormData(fields = {}, files = {}) {
  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) value.forEach((item) => formData.append(key, item));
    else formData.append(key, value);
  });
  Object.entries(files).forEach(([key, list]) => {
    (Array.isArray(list) ? list : [list]).filter(Boolean).forEach((file) => formData.append(key, file));
  });
  return formData;
}

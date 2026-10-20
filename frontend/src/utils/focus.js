// After a failed validation, move keyboard and screen-reader focus to the first invalid control so the
// problem is announced (the field's error message is linked through aria-describedby).
export function focusFirstInvalid() {
  setTimeout(() => {
    const target = document.querySelector('[aria-invalid="true"], fieldset[data-invalid="true"] input');
    target?.focus();
  }, 0);
}

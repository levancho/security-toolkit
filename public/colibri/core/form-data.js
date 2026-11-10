/** Native form payload plus a convenience object: repeated names become arrays. */
export function formSubmission(form, submitter) {
  const FormData = form.ownerDocument.defaultView.FormData;
  const formData = new FormData(form, submitter || undefined);
  const values = Object.create(null);
  for (const [name, value] of formData) {
    if (!(name in values)) values[name] = value;
    else if (Array.isArray(values[name])) values[name].push(value);
    else values[name] = [values[name], value];
  }
  return { formData, values, submitter: submitter || null };
}

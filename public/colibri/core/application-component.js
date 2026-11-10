import { cleanupController } from "./util.js";
import { formSubmission } from "./form-data.js";
/** Wire application actions without prescribing a backend or persistence layer.
 * Native links/forms retain browser behavior unless the consumer supplies handlers.
 */
export function createApplicationComponent(root, { onAction, onSubmit } = {}) {
  if(root.__colibriApplicationComponent)return root.__colibriApplicationComponent;
  const abort = new root.ownerDocument.defaultView.AbortController();
  root.addEventListener('click', event => {
    const element = event.target.closest('[data-app-action]');
    if (!element || !root.contains(element) || !onAction) return;
    event.preventDefault();
    onAction({ action: element.dataset.appAction, id: element.dataset.id, element, originalEvent: event });
  }, {signal:abort.signal});
  root.addEventListener('submit', event => {
    if (!onSubmit) return;
    event.preventDefault();
    onSubmit({form:event.target.dataset.appForm,...formSubmission(event.target, event.submitter),element:event.target,originalEvent:event});
  }, {signal:abort.signal});
  root.addEventListener('input', event => {
    if (!event.target.matches('[data-app-filter]')) return;
    const term=event.target.value.trim().toLowerCase();
    for (const row of root.querySelectorAll('tbody tr')) row.hidden=!row.textContent.toLowerCase().includes(term);
  }, {signal:abort.signal});
  return cleanupController(root,'__colibriApplicationComponent',()=>abort.abort());
}

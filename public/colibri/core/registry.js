// Colibri UI: data-ui name -> factory. Shared by auto.js (plain HTML/FreeMarker) and react/ (React wrappers).
import { createTabs } from "./tabs.js";
import { createButtonGroup, createSpinner } from "./button-group.js";
import { createDialog } from "./dialog.js";
import { createCollapsible, createAccordion } from "./collapsible.js";
import { createToggle, createToggleGroup } from "./toggle.js";
import { createCheckbox, createSwitch, createRadioGroup } from "./checkbox.js";
import { createPopover, createTooltip, createHoverCard } from "./popover.js";
import { createDropdownMenu, createContextMenu, createMenubar, createNavigationMenu } from "./menu.js";
import { createSelect, createCombobox, createCommand } from "./listbox.js";
import { createField, createSlider, createPinInput, createTogglePassword, createFileInput, createImageInput, createRepeater, createRating, createTextarea, createColorPicker, createSortable } from "./forms.js";
import { createCalendar, createDatePicker } from "./calendar.js";
import { createPagination, createStepper, createScrollspy, createScrollTo, createSticky, createSidebar } from "./navigation.js";
import * as AI from "./ai.js";
import { createToolbar, createSegmentedControl, createCheckboxCards, createRadioCards, createCheckboxGroup, createTabNav, createAccessibleIcon } from "./extras.js";
import { createAuthForm } from "./blocks.js";
import { createDismiss, createToaster, createProgress, createCarousel, createAvatar, createThemeSwitch, createDataTable, createResizable, createReparent, createScrollArea, createMessageScroller, createClipboard, createButton, createSeparator, createItemGroup, createBadge } from "./base.js";

export const registry = {
  toolbar: createToolbar, "segmented-control": createSegmentedControl, "checkbox-cards": createCheckboxCards, "radio-cards": createRadioCards,
  "checkbox-group": createCheckboxGroup, "tab-nav": createTabNav, "accessible-icon": createAccessibleIcon,
  tabs: createTabs, dialog: createDialog, "alert-dialog": createDialog, sheet: AI.withDragDismiss(createDialog), drawer: AI.withDragDismiss(createDialog),
  collapsible: createCollapsible, accordion: createAccordion,
  toggle: createToggle, "toggle-group": createToggleGroup, "button-group": createButtonGroup, spinner: createSpinner,
  checkbox: createCheckbox, switch: createSwitch, "radio-group": createRadioGroup,
  popover: createPopover, tooltip: createTooltip, "hover-card": createHoverCard,
  "dropdown-menu": createDropdownMenu, "context-menu": createContextMenu, menubar: createMenubar, "navigation-menu": createNavigationMenu,
  select: createSelect, combobox: createCombobox, command: createCommand,
  field: createField, slider: createSlider, "pin-input": createPinInput, "input-otp": createPinInput, "toggle-password": createTogglePassword,
  "file-input": createFileInput, "image-input": createImageInput, repeater: createRepeater, rating: createRating, textarea: createTextarea,
  "color-picker": createColorPicker, sortable: createSortable,
  calendar: createCalendar, "date-picker": createDatePicker,
  pagination: createPagination, stepper: createStepper, scrollspy: createScrollspy, scrollto: createScrollTo, sticky: createSticky, sidebar: createSidebar,
  dismiss: createDismiss, alert: createDismiss, toaster: createToaster, progress: createProgress, carousel: createCarousel, avatar: createAvatar,
  "theme-switch": createThemeSwitch, datatable: createDataTable, "data-table": createDataTable, resizable: createResizable, reparent: createReparent,
  "scroll-area": createScrollArea, scrollable: createScrollArea, "message-scroller": createMessageScroller, clipboard: createClipboard,
  button: createButton, separator: createSeparator, "item-group": createItemGroup, badge: createBadge,
  bubble: AI.createBubble, message: AI.createMessage, marker: AI.createMarker, trace: AI.createTrace,
  attachment: AI.createAttachment, questionnaire: AI.createQuestionnaire, chart: AI.createChart,
  "chain-of-thought": AI.createChainOfThought, task: AI.createTask, plan: AI.createPlan, tool: AI.createTool, reasoning: AI.createReasoning,
  sources: AI.createSources, subagent: AI.createSubagent, "stack-trace": AI.createStackTrace, "test-results": AI.createTestResults, terminal: AI.createTerminal,
  checkpoint: AI.createCheckpoint, confirmation: AI.createConfirmation, context: AI.createContextUsage, "file-tree": AI.createFileTree,
  "prompt-input": AI.createPromptInput, queue: AI.createQueue, suggestion: AI.createSuggestion, "auth-form": createAuthForm,
};

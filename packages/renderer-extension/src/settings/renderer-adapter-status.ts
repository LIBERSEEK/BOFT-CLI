import type { RendererAdapterStatus } from "../versioned-renderer-adapter.js";
import { connectionStatusLabel, connectionStatusTone } from "./connection-row.js";
import { createRendererSettingsBrandIcon } from "./icons.js";
import type { RendererSettingsMessages } from "./localization.js";

export function createRendererAdapterStatusSection(
  document: Document,
  messages: RendererSettingsMessages,
) {
  const element = document.createElement("section");
  element.className = "settings-renderer-adapter";
  element.hidden = true;

  const title = document.createElement("h2");
  title.textContent = messages.connectionDesktopIntegration;

  const row = document.createElement("div");
  row.className = "settings-connection-list settings-renderer-adapter__row";
  const identity = document.createElement("div");
  identity.className = "settings-connection-row__identity";
  const mark = document.createElement("span");
  mark.className = "settings-connection-row__mark settings-connection-row__mark--logo";
  mark.setAttribute("aria-hidden", "true");
  mark.append(createRendererSettingsBrandIcon(22));
  const label = document.createElement("strong");
  label.textContent = messages.connectionAdapter;
  identity.append(mark, label);

  const status = document.createElement("span");
  status.className = "settings-connection-row__status";
  status.setAttribute("role", "status");
  row.append(identity, status);
  element.append(title, row);

  let state: RendererAdapterStatus["state"] | undefined;
  return {
    element,
    update(adapter: RendererAdapterStatus | undefined): void {
      if (state === adapter?.state) return;
      state = adapter?.state;
      element.hidden = state === undefined;
      if (state === undefined) return;
      status.dataset.connectionTone = connectionStatusTone(state);
      status.textContent = connectionStatusLabel(state, messages);
    },
  };
}

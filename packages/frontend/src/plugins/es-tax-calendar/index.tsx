// Spanish Fiscal Calendar frontend registration: a protected route guarded by
// PluginGuard, a sidebar entry under the Extensions section, its i18n and the
// display metadata for the admin Plugins tab.

import { CalendarClock } from "lucide-react";
import { registerNavItem } from "@/nav-registry";
import { registerRoute } from "@/route-registry";
import { PluginGuard } from "../PluginGuard";
import { registerPlugin } from "../registry";
import "./i18n";
import FiscalCalendarPage from "./FiscalCalendarPage";

const PLUGIN_ID = "es-tax-calendar";

registerRoute({
  path: "/fiscal-calendar",
  element: (
    <PluginGuard pluginId={PLUGIN_ID}>
      <FiscalCalendarPage />
    </PluginGuard>
  ),
  scope: "protected",
});

registerNavItem({
  to: "/fiscal-calendar",
  labelKey: "es_tax.nav",
  icon: CalendarClock,
  section: "nav.plugins",
  pluginId: PLUGIN_ID,
});

registerPlugin({
  id: PLUGIN_ID,
  nameKey: "es_tax.name",
  descriptionKey: "es_tax.description",
  icon: CalendarClock,
});

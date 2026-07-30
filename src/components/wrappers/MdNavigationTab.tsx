import { createComponent } from "@lit/react";
import { MdNavigationTab as _MdNavigationTab } from "@material/web/labs/navigationtab/navigation-tab.js";
import React from "react";

export const MdNavigationTab = createComponent({
  tagName: "md-navigation-tab",
  elementClass: _MdNavigationTab,
  react: React,
  events: {
    onNavigationTabInteraction: "navigation-tab-interaction",
  },
});

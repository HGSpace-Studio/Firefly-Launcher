import { createComponent } from "@lit/react";
import { MdNavigationBar as _MdNavigationBar } from "@material/web/labs/navigationbar/navigation-bar.js";
import React from "react";

export const MdNavigationBar = createComponent({
  tagName: "md-navigation-bar",
  elementClass: _MdNavigationBar,
  react: React,
  events: {
    onNavigationBarActivated: "navigation-bar-activated",
  },
});

import { createComponent } from "@lit/react";
import { MdIconButton as _MdIconButton } from "@material/web/iconbutton/icon-button.js";
import React from "react";

export const MdIconButton = createComponent({
  tagName: "md-icon-button",
  elementClass: _MdIconButton,
  react: React,
  events: {
    onClick: "click",
  },
});

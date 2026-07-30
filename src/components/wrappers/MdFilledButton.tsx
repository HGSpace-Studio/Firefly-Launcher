import { createComponent } from "@lit/react";
import { MdFilledButton as _MdFilledButton } from "@material/web/button/filled-button.js";
import React from "react";

export const MdFilledButton = createComponent({
  tagName: "md-filled-button",
  elementClass: _MdFilledButton,
  react: React,
  events: {
    onClick: "click",
  },
});

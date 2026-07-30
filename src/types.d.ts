import "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "md-navigation-bar": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        activedex?: number;
        hideinactivelabels?: boolean;
      };
      "md-navigation-tab": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        label?: string;
        active?: boolean;
        disabled?: boolean;
        badgevalue?: string;
        showbadge?: boolean;
      };
      "md-icon": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {};
      "md-icon-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {};
      "md-filled-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {};
      "md-text-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {};
      "md-fab": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        variant?: "surface" | "primary" | "secondary" | "tertiary";
        size?: "medium" | "small" | "large";
        label?: string;
        lowered?: boolean;
      };
      "md-tabs": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        activeTabIndex?: number;
        autoActivate?: boolean;
      };
      "md-primary-tab": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        inlineIcon?: boolean;
        hasIcon?: boolean;
      };
      "md-ripple": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {};
      "md-outlined-text-field": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        value?: string;
        placeholder?: string;
        label?: string;
        disabled?: boolean;
        required?: boolean;
        type?: string;
      };
      "md-linear-progress": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        indeterminate?: boolean;
        progress?: number;
        closed?: boolean;
      };
      "md-circular-progress": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        indeterminate?: boolean;
        progress?: number;
        closed?: boolean;
        fourColor?: boolean;
      };
    }
  }
}

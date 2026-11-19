import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

export { default as Button } from "./Button.vue";

// Fontzie density and semantic variants are shared by every application button.
export const buttonVariants = cva("ui-button", {
  variants: {
    variant: {
      default: "ui-button--default",
      destructive: "ui-button--destructive",
      "destructive-outline": "ui-button--destructive-outline",
      "destructive-ghost": "ui-button--destructive-ghost",
      outline: "ui-button--outline",
      secondary: "ui-button--secondary",
      ghost: "ui-button--ghost",
      quiet: "ui-button--quiet",
      link: "ui-button--link",
    },
    size: {
      default: "ui-button--compact",
      xs: "ui-button--xs",
      sm: "ui-button--compact",
      lg: "ui-button--compact",
      icon: "ui-button--icon",
      "icon-xs": "ui-button--icon-xs",
      "icon-sm": "ui-button--icon",
      "icon-lg": "ui-button--icon-lg",
    },
  },
  defaultVariants: { variant: "outline", size: "default" },
});
export type ButtonVariants = VariantProps<typeof buttonVariants>;

import { forwardRef } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * ListButton — A touch-friendly, mobile-safe list item button.
 *
 * Use this for any clickable item in sidebars, panels, and lists.
 * Handles the "two-tap" bug on mobile by using proper touch CSS.
 *
 * @example
 * <ListButton onClick={handleClick} active={isSelected}>
 *   <Icon className="w-4 h-4" />
 *   <span>Item label</span>
 * </ListButton>
 */
interface ListButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Whether this item is currently active/selected */
  active?: boolean;
  /** Whether to show muted/archived styling */
  muted?: boolean;
}

export const ListButton = forwardRef<HTMLButtonElement, ListButtonProps>(
  ({ className, active, muted, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-left",
          "transition-colors touch-manipulation",
          "active:bg-bg-elevated",
          // Only apply hover on pointer devices (prevents two-tap on mobile)
          "@media(hover:hover){hover:bg-bg-elevated}",
          // Tailwind can't do media queries inline, so we use the global fix
          // and keep hover class for desktop
          "hover:bg-bg-elevated",
          "text-sm",
          active && "bg-bg-elevated text-text-primary",
          !active && "text-text-primary",
          muted && "opacity-60",
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

ListButton.displayName = "ListButton";

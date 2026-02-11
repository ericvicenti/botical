import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";
import { FocusTrap } from "./FocusTrap";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  position?: "center" | "top";
}

export function Modal({
  isOpen,
  onClose,
  children,
  className,
  position = "center",
}: ModalProps) {
  // Track whether modal should be rendered (stays true during exit animation)
  const [shouldRender, setShouldRender] = useState(false);
  // Track animation state
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      // Small delay to ensure DOM is ready before starting animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      });
    } else {
      setIsAnimating(false);
      // Wait for exit animation to complete before unmounting
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 150); // Match the transition duration
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!shouldRender) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-black/50 transition-opacity duration-150",
          isAnimating ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Content */}
      <div
        className={cn(
          "absolute inset-x-0 mx-auto px-2 sm:px-0 transition-all duration-150",
          "w-full sm:w-auto sm:left-1/2 sm:-translate-x-1/2",
          position === "center" && "top-1/2 -translate-y-1/2",
          position === "top" && (isAnimating ? "top-2 sm:top-[15%]" : "top-0 sm:top-[10%]"),
          isAnimating ? "opacity-100 scale-100" : "opacity-0 scale-95"
        )}
      >
        <FocusTrap active={isOpen} onEscape={onClose}>
          <div
            className={cn(
              "bg-bg-secondary border border-border rounded-lg shadow-xl",
              "max-h-[95vh] sm:max-h-[85vh]",
              className
            )}
            role="dialog"
            aria-modal="true"
          >
            {children}
          </div>
        </FocusTrap>
      </div>
    </div>,
    document.body
  );
}

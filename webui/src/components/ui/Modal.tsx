import { useEffect, type ReactNode } from "react";
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

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Content */}
      <div
        className={cn(
          "absolute left-1/2 -translate-x-1/2",
          position === "center" && "top-1/2 -translate-y-1/2",
          position === "top" && "top-[15%]"
        )}
      >
        <FocusTrap active={isOpen} onEscape={onClose}>
          <div
            className={cn(
              "bg-bg-secondary border border-border rounded-lg shadow-xl",
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

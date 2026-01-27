import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

interface FilePaletteContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const FilePaletteContext = createContext<FilePaletteContextValue | null>(null);

export function FilePaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  // Listen for custom event to open file palette (from command system)
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener("iris:file-palette:open", handleOpen);
    return () => window.removeEventListener("iris:file-palette:open", handleOpen);
  }, []);

  return (
    <FilePaletteContext.Provider value={{ isOpen, open, close }}>
      {children}
    </FilePaletteContext.Provider>
  );
}

export function useFilePalette() {
  const context = useContext(FilePaletteContext);
  if (!context) {
    throw new Error("useFilePalette must be used within FilePaletteProvider");
  }
  return context;
}

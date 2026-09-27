import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/** Cross-component UI state for the portfolio page (modals, palette, chalk drawing mode). */
export type ChalkTool = 'none' | 'white' | 'red' | 'yellow' | 'eraser';

interface UIState {
  connectOpen: boolean;
  setConnectOpen: (v: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  chalkTool: ChalkTool;
  setChalkTool: (t: ChalkTool) => void;
  /** Increment to ask the drawing layer to wipe the board. */
  wipeSignal: number;
  wipeBoard: () => void;
}

const Ctx = createContext<UIState | null>(null);

export function PortfolioUIProvider({ children }: { children: ReactNode }) {
  const [connectOpen, setConnectOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [chalkTool, setChalkTool] = useState<ChalkTool>('none');
  const [wipeSignal, setWipe] = useState(0);
  const value = useMemo(
    () => ({
      connectOpen,
      setConnectOpen,
      paletteOpen,
      setPaletteOpen,
      chalkTool,
      setChalkTool,
      wipeSignal,
      wipeBoard: () => setWipe((n) => n + 1),
    }),
    [connectOpen, paletteOpen, chalkTool, wipeSignal],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePortfolioUI() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePortfolioUI must be used inside <PortfolioUIProvider>');
  return ctx;
}

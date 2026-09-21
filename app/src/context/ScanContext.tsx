import React, { createContext, useContext, useState } from "react";
import { MediaExtractResponse, MediaResultItem } from "../api/types";

interface ScanContextValue {
  scanResult: MediaExtractResponse | null;
  setScanResult: (result: MediaExtractResponse | null) => void;
  clearScanResult: () => void;
}

const ScanContext = createContext<ScanContextValue | undefined>(undefined);

export const ScanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [scanResult, setScanResult] = useState<MediaExtractResponse | null>(null);

  const clearScanResult = () => setScanResult(null);

  return (
    <ScanContext.Provider value={{ scanResult, setScanResult, clearScanResult }}>
      {children}
    </ScanContext.Provider>
  );
};

export function useScanContext(): ScanContextValue {
  const context = useContext(ScanContext);
  if (!context) {
    throw new Error("useScanContext must be used within a ScanProvider");
  }
  return context;
}


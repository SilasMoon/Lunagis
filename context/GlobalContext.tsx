import React, { createContext, useContext, useState, useCallback } from 'react';
import type { Tool, AppStateConfig } from '../types';

interface GlobalContextType {
    isLoading: string | null;
    setIsLoading: React.Dispatch<React.SetStateAction<string | null>>;
    activeTool: Tool;
    onToolSelect: (tool: Tool) => void;
    importRequest: { config: AppStateConfig; requiredFiles: string[]; } | null;
    setImportRequest: React.Dispatch<React.SetStateAction<{ config: AppStateConfig; requiredFiles: string[]; } | null>>;
    onImportConfig: (file: File) => void;
    onExportConfig: (config: AppStateConfig) => Promise<void>;
    handleRestoreSession: (config: AppStateConfig, files: FileList | File[]) => void;
    sessionDataToRestore: AppStateConfig | null;
    setSessionDataToRestore: React.Dispatch<React.SetStateAction<AppStateConfig | null>>;
}

const GlobalContext = createContext<GlobalContextType | null>(null);

export const useGlobalContext = () => {
    const context = useContext(GlobalContext);
    if (!context) {
        throw new Error("useGlobalContext must be used within a GlobalProvider");
    }
    return context;
};

export const GlobalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isLoading, setIsLoading] = useState<string | null>(null);
    const [activeTool, setActiveTool] = useState<Tool>('layers');
    const [importRequest, setImportRequest] = useState<{ config: AppStateConfig, requiredFiles: string[] } | null>(null);
    const [sessionDataToRestore, setSessionDataToRestore] = useState<AppStateConfig | null>(null);

    const onExportConfig = useCallback(async (config: AppStateConfig) => {
        setIsLoading("Exporting session...");
        try {
            const finalConfig = { ...config, version: 1 };
            const jsonString = JSON.stringify(finalConfig, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `session_${new Date().toISOString()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            alert(`Error exporting session: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setIsLoading(null);
        }
    }, []);

    const onImportConfig = useCallback((file: File) => {
        setIsLoading("Reading config file...");
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const config = JSON.parse(event.target?.result as string) as AppStateConfig;
                if (config.version !== 1) { throw new Error("Unsupported config version."); }
                
                const requiredFiles: string[] = [];
                for (const l of config.layers) {
                    if (l.type === 'data' || l.type === 'dte_comms' || l.type === 'lpf_comms') {
                        requiredFiles.push(l.fileName);
                    } else if (l.type === 'basemap') {
                        requiredFiles.push(l.pngFileName);
                        requiredFiles.push(l.vrtFileName);
                    }
                }
                setImportRequest({ config, requiredFiles });
            } catch (e) {
                alert(`Error reading config file: ${e instanceof Error ? e.message : String(e)}`);
            } finally {
                setIsLoading(null);
            }
        };
        reader.onerror = () => {
            alert("Failed to read the file.");
            setIsLoading(null);
        };
        reader.readAsText(file);
    }, []);

    const handleRestoreSession = useCallback((config: AppStateConfig, files: FileList | File[]) => {
        setImportRequest(null);
        const fileMap = new Map<string, File>();
        Array.from(files).forEach(f => fileMap.set(f.name, f));
        
        // Add fileMap to the config object so other contexts can access it
        const configWithFiles = { ...config, fileMap };
        
        setSessionDataToRestore(configWithFiles as AppStateConfig & {fileMap: Map<string,File>});
    }, []);

    const value = {
        isLoading, setIsLoading,
        activeTool, onToolSelect: setActiveTool,
        importRequest, setImportRequest,
        onImportConfig, onExportConfig,
        handleRestoreSession,
        sessionDataToRestore, setSessionDataToRestore,
    };

    return <GlobalContext.Provider value={value}>{children}</GlobalContext.Provider>;
};

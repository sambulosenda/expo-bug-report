import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { View, type ColorSchemeName } from 'react-native';
import { useShakeDetector } from './ShakeDetector';
import { captureScreenshot } from './ScreenCapture';
import { BugReportModal } from './BugReportModal';
import { freezeStateSnapshot, clearStateCapture } from './StateCapture';
import { freezeNavHistory, clearNavHistory, getCurrentPathname } from './NavigationTracker';
import { clearLastError } from './ErrorBoundary';
import type { Integration, BugReport } from './integrations/types';
import { getExpoPushToken } from './PushToken';

const DEBOUNCE_MS = 3000;

interface BugReportContextValue {
  triggerBugReport: () => void;
}

const BugReportContext = createContext<BugReportContextValue | undefined>(
  undefined,
);

interface BugReportProviderProps {
  children: ReactNode;
  integrations: Integration[];
  metadata?: Record<string, string> | (() => Record<string, string>);
  shakeThreshold?: number;
  shakeEnabled?: boolean;
  screenNameProvider?: () => string;
  colorScheme?: ColorSchemeName;
  enabled?: boolean;
  onError?: (error: Error, report: BugReport) => void;
}

export function BugReportProvider({
  children,
  integrations,
  metadata = {},
  shakeThreshold,
  shakeEnabled = true,
  screenNameProvider,
  colorScheme,
  enabled = true,
  onError,
}: BugReportProviderProps) {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [screenshotUri, setScreenshotUri] = useState<string | null>(null);
  const isModalVisibleRef = useRef(false);
  const lastTriggerTimestamp = useRef(0);
  const viewShotRef = useRef<View>(null);

  // Attempt to capture Expo Push Token on mount (silently fails if unavailable)
  useEffect(() => {
    getExpoPushToken().catch(() => {});
  }, []);

  // Auto-detect screen name from NavigationTracker if no provider given
  const resolvedScreenNameProvider = useCallback(() => {
    if (screenNameProvider) return screenNameProvider();
    const trackedPathname = getCurrentPathname();
    return trackedPathname ?? 'unknown';
  }, [screenNameProvider]);

  const triggerBugReport = useCallback(async () => {
    const now = Date.now();
    if (now - lastTriggerTimestamp.current < DEBOUNCE_MS) return;
    if (isModalVisibleRef.current) return;
    lastTriggerTimestamp.current = now;

    // Freeze diagnostics at shake time (before user spends time annotating)
    freezeStateSnapshot();
    freezeNavHistory();

    const uri = await captureScreenshot(viewShotRef);
    setScreenshotUri(uri);
    isModalVisibleRef.current = true;
    setIsModalVisible(true);
  }, []);

  const handleClose = useCallback(() => {
    isModalVisibleRef.current = false;
    setIsModalVisible(false);
    setScreenshotUri(null);
  }, []);

  const handleSubmitSuccess = useCallback(() => {
    clearStateCapture();
    clearNavHistory();
    clearLastError();
  }, []);

  useShakeDetector(triggerBugReport, {
    threshold: shakeThreshold,
    enabled: enabled && shakeEnabled,
  });

  if (!enabled) {
    return (
      <BugReportContext.Provider value={{ triggerBugReport }}>
        {children}
      </BugReportContext.Provider>
    );
  }

  return (
    <BugReportContext.Provider value={{ triggerBugReport }}>
      <View ref={viewShotRef} style={{ flex: 1 }} collapsable={false}>
        {children}
      </View>
      <BugReportModal
        visible={isModalVisible}
        screenshotUri={screenshotUri}
        integrations={integrations}
        metadata={metadata}
        screenNameProvider={resolvedScreenNameProvider}
        colorScheme={colorScheme}
        onClose={handleClose}
        onSubmitSuccess={handleSubmitSuccess}
        onError={onError}
      />
    </BugReportContext.Provider>
  );
}

export function useBugReport(): BugReportContextValue {
  const context = useContext(BugReportContext);
  if (!context) {
    throw new Error('useBugReport must be used within BugReportProvider');
  }
  return context;
}

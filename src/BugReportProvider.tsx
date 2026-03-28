import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { View } from 'react-native';
import { useShakeDetector } from './ShakeDetector';
import { captureScreenshot } from './ScreenCapture';
import { BugReportModal } from './BugReportModal';
import type { Integration } from './integrations/types';

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
  enabled?: boolean;
}

export function BugReportProvider({
  children,
  integrations,
  metadata,
  shakeThreshold,
  shakeEnabled = true,
  screenNameProvider,
  enabled = true,
}: BugReportProviderProps) {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [screenshotUri, setScreenshotUri] = useState<string | null>(null);
  const isModalVisibleRef = useRef(false);
  const lastTriggerTimestamp = useRef(0);
  const viewShotRef = useRef<View>(null);

  const resolvedMetadata =
    typeof metadata === 'function' ? metadata() : metadata ?? {};

  const screenName = screenNameProvider?.() ?? 'unknown';

  const triggerBugReport = useCallback(async () => {
    const now = Date.now();
    if (now - lastTriggerTimestamp.current < DEBOUNCE_MS) return;
    if (isModalVisibleRef.current) return;
    lastTriggerTimestamp.current = now;

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
        metadata={resolvedMetadata}
        screenName={screenName}
        onClose={handleClose}
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

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  type ColorSchemeName,
} from 'react-native';
import { AnnotationCanvas } from './AnnotationCanvas';
import { collectDeviceInfo } from './DeviceInfo';
import { getStateSnapshot } from './StateCapture';
import { getNavHistory } from './NavigationTracker';
import { getLastError } from './ErrorBoundary';
import { generateReproSteps } from './ReproSteps';
import { detectSeverity } from './Severity';
import { useThemeColors } from './useThemeColors';
import type { Integration, BugReport, IssueLinkInfo } from './integrations/types';

// Optional dep: expo-clipboard (only used for copy-to-clipboard fallback)
let Clipboard: { setStringAsync: (text: string) => Promise<void> } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Clipboard = require('expo-clipboard');
} catch {
  // expo-clipboard not installed — copy to clipboard disabled
}

// Optional dep: @react-native-community/netinfo
let NetInfo: { fetch: () => Promise<{ isConnected: boolean | null }> } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  NetInfo = require('@react-native-community/netinfo').default;
} catch {
  // netinfo not installed — offline detection disabled
}

interface BugReportModalProps {
  visible: boolean;
  screenshotUri: string | null;
  integrations: Integration[];
  metadata: Record<string, string> | (() => Record<string, string>);
  screenNameProvider: () => string;
  colorScheme?: ColorSchemeName;
  onClose: () => void;
  onSubmitSuccess?: () => void;
  onError?: (error: Error, report: BugReport) => void;
}

type ModalStep = 'annotate' | 'describe' | 'success' | 'error';

const MAX_RETRIES = 3;

function DiagnosticsSummary({ colorScheme }: { colorScheme?: ColorSchemeName }) {
  const colors = useThemeColors(colorScheme);
  const stateSnapshots = getStateSnapshot();
  const navHistory = getNavHistory();
  const lastError = getLastError();

  const parts: string[] = [];
  if (stateSnapshots.length > 0) parts.push(`${stateSnapshots.length} state snapshot${stateSnapshots.length === 1 ? '' : 's'}`);
  if (navHistory.length > 0) parts.push(`${navHistory.length} nav event${navHistory.length === 1 ? '' : 's'}`);
  if (lastError) parts.push('1 error');

  if (parts.length === 0) return null;

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 8, padding: 10, marginBottom: 12 }}>
      <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center' }}>
        Including: {parts.join(', ')}, device info
        {'\n'}Just describe what you saw.
      </Text>
    </View>
  );
}

export function BugReportModal({
  visible,
  screenshotUri,
  integrations,
  metadata,
  screenNameProvider,
  colorScheme,
  onClose,
  onSubmitSuccess,
  onError,
}: BugReportModalProps) {
  const colors = useThemeColors(colorScheme);
  const [step, setStep] = useState<ModalStep>(
    screenshotUri ? 'annotate' : 'describe',
  );
  const [annotatedUri, setAnnotatedUri] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [offlineWarning, setOfflineWarning] = useState(false);
  const [filedIssues, setFiledIssues] = useState<IssueLinkInfo[]>([]);

  const { width: screenWidth } = Dimensions.get('window');
  const canvasHeight = screenWidth * 1.5;

  useEffect(() => {
    if (visible) {
      setStep(screenshotUri ? 'annotate' : 'describe');
      setAnnotatedUri(null);
      setDescription('');
      setErrorMessage('');
      setRetryCount(0);
      setOfflineWarning(false);
      setFiledIssues([]);
    }
  }, [visible, screenshotUri]);

  // Check connectivity when modal opens on describe step
  useEffect(() => {
    if (visible && step === 'describe' && NetInfo) {
      NetInfo.fetch().then((state) => {
        if (state.isConnected === false) {
          setOfflineWarning(true);
        }
      }).catch(() => {
        // NetInfo fetch failed — skip check
      });
    }
  }, [visible, step]);

  const handleAnnotationComplete = useCallback((uri: string) => {
    setAnnotatedUri(uri);
    setStep('describe');
  }, []);

  const handleSkipAnnotation = useCallback(() => {
    setStep('describe');
  }, []);

  const buildReport = useCallback((): BugReport => {
    const resolvedMetadata =
      typeof metadata === 'function' ? metadata() : metadata;
    const screenName = screenNameProvider();

    const diagnostics = {
      stateSnapshots: getStateSnapshot(),
      navHistory: getNavHistory(),
      lastError: getLastError(),
    };
    const trimmedDesc = description.trim();

    return {
      screenshot: screenshotUri,
      annotatedScreenshot: annotatedUri,
      description: trimmedDesc,
      device: collectDeviceInfo(),
      screen: screenName,
      timestamp: new Date().toISOString(),
      metadata: resolvedMetadata,
      diagnostics,
      reproSteps: generateReproSteps(diagnostics),
      severity: detectSeverity(diagnostics, trimmedDesc),
    };
  }, [screenshotUri, annotatedUri, description, metadata, screenNameProvider]);

  const sendReport = useCallback(async (): Promise<boolean> => {
    const report = buildReport();

    const results = await Promise.allSettled(
      integrations.map((integration) => integration.send(report)),
    );

    const failures = results.filter(
      (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success),
    );

    // Collect issue links from successful integrations
    const allIssues: IssueLinkInfo[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.issues) {
        allIssues.push(...result.value.issues);
      }
    }
    if (allIssues.length > 0) {
      setFiledIssues(allIssues);
    }

    if (failures.length === 0) {
      onSubmitSuccess?.();
      return true;
    }

    const firstError =
      failures[0]?.status === 'fulfilled'
        ? failures[0].value.error
        : 'Send failed';
    const errorMsg = firstError ?? 'Send failed';
    setErrorMessage(errorMsg);
    onError?.(new Error(errorMsg), report);
    return false;
  }, [buildReport, integrations, onSubmitSuccess, onError]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const success = await sendReport();
      setStep(success ? 'success' : 'error');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unexpected error building report';
      setErrorMessage(msg);
      setStep('error');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, sendReport]);

  const handleRetry = useCallback(async () => {
    if (retryCount >= MAX_RETRIES || isSubmitting) return;
    setRetryCount((prev) => prev + 1);
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const success = await sendReport();
      if (success) {
        setStep('success');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unexpected error';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [retryCount, sendReport, isSubmitting]);

  const handleClose = useCallback(() => {
    setStep(screenshotUri ? 'annotate' : 'describe');
    setAnnotatedUri(null);
    setDescription('');
    setErrorMessage('');
    setRetryCount(0);
    setOfflineWarning(false);
    setFiledIssues([]);
    onClose();
  }, [onClose, screenshotUri]);

  const handleCopyToClipboard = useCallback(async () => {
    if (!Clipboard) {
      handleClose();
      return;
    }
    const report = buildReport();
    const text = [
      `Bug Report - ${report.screen}`,
      report.description ? `Description: ${report.description}` : '',
      `Device: ${report.device.model}`,
      `OS: ${report.device.os}`,
      `App: ${report.device.appVersion}`,
      `Time: ${report.timestamp}`,
    ]
      .filter(Boolean)
      .join('\n');

    await Clipboard.setStringAsync(text);
    handleClose();
  }, [buildReport, handleClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
            Bug Report
          </Text>
          <TouchableOpacity
            onPress={handleClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Close bug report"
          >
            <Text style={{ fontSize: 16, color: colors.textSecondary }}>Close</Text>
          </TouchableOpacity>
        </View>

        {step === 'annotate' && screenshotUri ? (
          <AnnotationCanvas
            screenshotUri={screenshotUri}
            onAnnotationComplete={handleAnnotationComplete}
            onSkip={handleSkipAnnotation}
            width={screenWidth}
            height={canvasHeight}
            colorScheme={colorScheme}
          />
        ) : step === 'describe' ? (
          <View style={{ flex: 1, padding: 20 }}>
            {/* Offline warning */}
            {offlineWarning ? (
              <View
                style={{
                  backgroundColor: colors.error + '18',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <Text style={{ fontSize: 13, color: colors.error, textAlign: 'center' }}>
                  You appear to be offline. Your report may not be delivered.
                </Text>
              </View>
            ) : null}

            {/* Expo Go info banner */}
            {!screenshotUri && !annotatedUri ? (
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 16,
                }}
              >
                <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center' }}>
                  Screenshot unavailable in Expo Go — description and device info still collected
                </Text>
              </View>
            ) : null}

            {/* Screenshot preview */}
            {(annotatedUri ?? screenshotUri) ? (
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <Image
                  source={{ uri: annotatedUri ?? screenshotUri ?? undefined }}
                  style={{
                    width: 120,
                    height: 180,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                  resizeMode="cover"
                  accessibilityLabel="Screenshot preview"
                />
              </View>
            ) : null}

            {/* Diagnostics summary */}
            <DiagnosticsSummary colorScheme={colorScheme} />

            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 12 }}>
              Screen: {screenNameProvider()}
            </Text>

            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What went wrong?"
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              style={{
                borderWidth: 1,
                borderColor: colors.inputBorder,
                borderRadius: 12,
                padding: 16,
                fontSize: 16,
                color: colors.text,
                backgroundColor: colors.inputBackground,
                minHeight: 120,
                marginBottom: 16,
              }}
              accessibilityLabel="Bug description"
              autoFocus
            />

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={isSubmitting}
              style={{
                backgroundColor: isSubmitting ? colors.disabled : colors.primary,
                borderRadius: 12,
                paddingVertical: 16,
                alignItems: 'center',
              }}
              accessibilityRole="button"
              accessibilityLabel="Submit bug report"
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text
                  style={{ fontSize: 16, fontWeight: '600', color: '#fff' }}
                >
                  Submit
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : step === 'success' ? (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 28,
            }}
          >
            <Text
              style={{
                fontSize: 22,
                fontWeight: '700',
                color: colors.text,
                marginBottom: 8,
              }}
            >
              {filedIssues.length > 0 ? `Filed as ${filedIssues[0]!.key}` : 'Sent!'}
            </Text>
            <Text
              style={{
                fontSize: 16,
                color: colors.textSecondary,
                textAlign: 'center',
              }}
            >
              {filedIssues.length > 0
                ? `Bug report tracked in ${filedIssues[0]!.destination}.`
                : 'Bug report submitted. Thanks for helping improve the app.'}
            </Text>
            <TouchableOpacity
              onPress={handleClose}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 12,
                paddingVertical: 16,
                paddingHorizontal: 40,
                marginTop: 32,
              }}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text
                style={{ fontSize: 16, fontWeight: '600', color: '#fff' }}
              >
                Done
              </Text>
            </TouchableOpacity>
          </View>
        ) : step === 'error' ? (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 28,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: '600',
                color: colors.error,
                marginBottom: 8,
              }}
            >
              Failed to send
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: colors.textSecondary,
                textAlign: 'center',
                marginBottom: 24,
              }}
            >
              {errorMessage}
            </Text>

            {retryCount < MAX_RETRIES ? (
              <TouchableOpacity
                onPress={handleRetry}
                disabled={isSubmitting}
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 12,
                  paddingVertical: 16,
                  paddingHorizontal: 40,
                  marginBottom: 12,
                }}
                accessibilityRole="button"
                accessibilityLabel="Retry sending"
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text
                    style={{ fontSize: 16, fontWeight: '600', color: '#fff' }}
                  >
                    Retry
                  </Text>
                )}
              </TouchableOpacity>
            ) : null}

            {Clipboard ? (
              <TouchableOpacity
                onPress={handleCopyToClipboard}
                style={{
                  borderWidth: 1,
                  borderColor: colors.primary,
                  borderRadius: 12,
                  paddingVertical: 16,
                  paddingHorizontal: 40,
                }}
                accessibilityRole="button"
                accessibilityLabel="Copy report to clipboard"
              >
                <Text
                  style={{ fontSize: 16, fontWeight: '600', color: colors.primary }}
                >
                  Copy to Clipboard
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

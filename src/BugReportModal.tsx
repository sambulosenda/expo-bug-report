import React, { useState, useCallback } from 'react';
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
  Clipboard,
} from 'react-native';
import { AnnotationCanvas } from './AnnotationCanvas';
import { collectDeviceInfo } from './DeviceInfo';
import type { Integration, BugReport } from './integrations/types';

interface BugReportModalProps {
  visible: boolean;
  screenshotUri: string | null;
  integrations: Integration[];
  metadata: Record<string, string>;
  screenName: string;
  onClose: () => void;
}

type ModalStep = 'annotate' | 'describe' | 'success' | 'error';

const MAX_RETRIES = 3;

export function BugReportModal({
  visible,
  screenshotUri,
  integrations,
  metadata,
  screenName,
  onClose,
}: BugReportModalProps) {
  const [step, setStep] = useState<ModalStep>(
    screenshotUri ? 'annotate' : 'describe',
  );
  const [annotatedUri, setAnnotatedUri] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  const { width: screenWidth } = Dimensions.get('window');
  const canvasHeight = screenWidth * 1.5;

  const handleAnnotationComplete = useCallback((uri: string) => {
    setAnnotatedUri(uri);
    setStep('describe');
  }, []);

  const handleSkipAnnotation = useCallback(() => {
    setStep('describe');
  }, []);

  const buildReport = useCallback((): BugReport => {
    return {
      screenshot: screenshotUri,
      annotatedScreenshot: annotatedUri,
      description: description.trim(),
      device: collectDeviceInfo(),
      screen: screenName,
      timestamp: new Date().toISOString(),
      metadata,
    };
  }, [screenshotUri, annotatedUri, description, screenName, metadata]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage('');

    const report = buildReport();

    const results = await Promise.allSettled(
      integrations.map((integration) => integration.send(report)),
    );

    const failures = results.filter(
      (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success),
    );

    if (failures.length === 0) {
      setStep('success');
    } else {
      const firstError =
        failures[0]?.status === 'fulfilled'
          ? failures[0].value.error
          : 'Send failed';
      setErrorMessage(firstError ?? 'Send failed');
      setStep('error');
    }

    setIsSubmitting(false);
  }, [isSubmitting, buildReport, integrations]);

  const handleRetry = useCallback(() => {
    if (retryCount >= MAX_RETRIES) return;
    setRetryCount((prev) => prev + 1);
    setStep('describe');
    handleSubmit();
  }, [retryCount, handleSubmit]);

  const handleCopyToClipboard = useCallback(() => {
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

    Clipboard.setString(text);
    handleClose();
  }, [buildReport]);

  const handleClose = useCallback(() => {
    setStep(screenshotUri ? 'annotate' : 'describe');
    setAnnotatedUri(null);
    setDescription('');
    setErrorMessage('');
    setRetryCount(0);
    onClose();
  }, [onClose, screenshotUri]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: '#fff' }}
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
            borderBottomColor: '#E5E5EA',
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#000' }}>
            Bug Report
          </Text>
          <TouchableOpacity
            onPress={handleClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Close bug report"
          >
            <Text style={{ fontSize: 16, color: '#8E8E93' }}>Close</Text>
          </TouchableOpacity>
        </View>

        {step === 'annotate' && screenshotUri ? (
          <AnnotationCanvas
            screenshotUri={screenshotUri}
            onAnnotationComplete={handleAnnotationComplete}
            onSkip={handleSkipAnnotation}
            width={screenWidth}
            height={canvasHeight}
          />
        ) : step === 'describe' ? (
          <View style={{ flex: 1, padding: 20 }}>
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
                    borderColor: '#E5E5EA',
                  }}
                  resizeMode="cover"
                  accessibilityLabel="Screenshot preview"
                />
              </View>
            ) : null}

            <Text style={{ fontSize: 13, color: '#8E8E93', marginBottom: 12 }}>
              Screen: {screenName}
            </Text>

            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What went wrong?"
              placeholderTextColor="#C7C7CC"
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              style={{
                borderWidth: 1,
                borderColor: '#E5E5EA',
                borderRadius: 12,
                padding: 16,
                fontSize: 16,
                color: '#000',
                backgroundColor: '#F2F2F7',
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
                backgroundColor: isSubmitting ? '#C7C7CC' : '#007AFF',
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
                color: '#000',
                marginBottom: 8,
              }}
            >
              Sent!
            </Text>
            <Text
              style={{
                fontSize: 16,
                color: '#8E8E93',
                textAlign: 'center',
              }}
            >
              Bug report submitted. Thanks for helping improve the app.
            </Text>
            <TouchableOpacity
              onPress={handleClose}
              style={{
                backgroundColor: '#007AFF',
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
                color: '#FF3B30',
                marginBottom: 8,
              }}
            >
              Failed to send
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: '#8E8E93',
                textAlign: 'center',
                marginBottom: 24,
              }}
            >
              {errorMessage}
            </Text>

            {retryCount < MAX_RETRIES ? (
              <TouchableOpacity
                onPress={handleRetry}
                style={{
                  backgroundColor: '#007AFF',
                  borderRadius: 12,
                  paddingVertical: 16,
                  paddingHorizontal: 40,
                  marginBottom: 12,
                }}
                accessibilityRole="button"
                accessibilityLabel="Retry sending"
              >
                <Text
                  style={{ fontSize: 16, fontWeight: '600', color: '#fff' }}
                >
                  Retry
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              onPress={handleCopyToClipboard}
              style={{
                borderWidth: 1,
                borderColor: '#007AFF',
                borderRadius: 12,
                paddingVertical: 16,
                paddingHorizontal: 40,
              }}
              accessibilityRole="button"
              accessibilityLabel="Copy report to clipboard"
            >
              <Text
                style={{ fontSize: 16, fontWeight: '600', color: '#007AFF' }}
              >
                Copy to Clipboard
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

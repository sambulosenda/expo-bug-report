import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import { BugReportModal } from '../BugReportModal';
import type { Integration, BugReport } from '../integrations/types';

// Note: RN Modal renders even when visible=false in jest (content is always in the tree)

jest.mock('../AnnotationCanvas', () => ({
  AnnotationCanvas: () => null,
}));

jest.mock('../DeviceInfo', () => ({
  collectDeviceInfo: () => ({
    model: 'Test Device',
    os: 'ios 17.0',
    appVersion: '1.0.0',
    screenSize: '390x844',
    locale: 'en-US',
    installationId: 'test-id',
    expoConfig: null,
  }),
}));

jest.mock('../StateCapture', () => ({
  getStateSnapshot: () => [{ name: 'app', state: '{}', timestamp: 't', truncated: false }],
}));

jest.mock('../NavigationTracker', () => ({
  getNavHistory: () => [{ pathname: '/home', segments: ['home'], timestamp: 't' }],
}));

jest.mock('../ErrorBoundary', () => ({
  getLastError: () => null,
}));

jest.mock('../useThemeColors', () => ({
  useThemeColors: () => ({
    background: '#fff', surface: '#F2F2F7', border: '#E5E5EA', text: '#000',
    textSecondary: '#8E8E93', textTertiary: '#C7C7CC', inputBackground: '#F2F2F7',
    inputBorder: '#E5E5EA', primary: '#007AFF', error: '#FF3B30', disabled: '#C7C7CC',
  }),
}));

function createMockIntegration(overrides?: Partial<Integration>): Integration {
  return {
    name: 'test',
    send: jest.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

// Helper: find a TouchableOpacity by its accessibilityLabel in the JSON tree and call onPress
function pressButton(root: any, label: string): void {
  const json = root.toJSON();
  const node = findByProp(json, 'accessibilityLabel', label);
  if (!node || !node.props?.onPress) throw new Error(`Button "${label}" not found or has no onPress`);
  node.props.onPress();
}

function findByProp(node: any, prop: string, value: string): any {
  if (!node) return null;
  if (node.props?.[prop] === value) return node;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findByProp(child, prop, value);
      if (found) return found;
    }
  }
  return null;
}

const defaultProps = {
  visible: true,
  screenshotUri: null as string | null,
  integrations: [createMockIntegration()],
  metadata: {} as Record<string, string>,
  screenNameProvider: () => 'TestScreen',
  onClose: jest.fn(),
};

describe('BugReportModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders describe step with expected content', () => {
    const root = render(<BugReportModal {...defaultProps} />);
    // toJSON may wrap in Modal — stringify the full tree
    const json = JSON.stringify(root.toJSON());
    expect(json).toContain('Bug Report');
    expect(json).toContain('Submit');
    expect(json).toContain('What went wrong?');
    expect(json).toContain('Screen: ');
    expect(json).toContain('TestScreen');
  });

  it('passes visible=false to Modal', () => {
    const root = render(<BugReportModal {...defaultProps} visible={false} />);
    // RN Modal renders children in test env. Verify visible prop is passed correctly
    const json = JSON.stringify(root.toJSON());
    expect(json).toContain('"visible":false') ;
  });

  it('shows Expo Go banner when no screenshot', () => {
    const root = render(<BugReportModal {...defaultProps} screenshotUri={null} />);
    expect(JSON.stringify(root.toJSON())).toContain('Screenshot unavailable');
  });

  it('shows diagnostics summary (report preview)', () => {
    const root = render(<BugReportModal {...defaultProps} />);
    const json = JSON.stringify(root.toJSON());
    expect(json).toContain('1 state snapshot');
    expect(json).toContain('1 nav event');
  });

  it('calls onClose when close pressed', async () => {
    const onClose = jest.fn();
    const root = render(<BugReportModal {...defaultProps} onClose={onClose} />);
    await act(() => { pressButton(root, 'Close bug report'); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls integration.send on submit', async () => {
    const mockSend = jest.fn().mockResolvedValue({ success: true });
    const integration = createMockIntegration({ send: mockSend });
    const root = render(<BugReportModal {...defaultProps} integrations={[integration]} />);

    await act(async () => { pressButton(root, 'Submit bug report'); });

    await waitFor(() => { expect(mockSend).toHaveBeenCalledTimes(1); });

    const report: BugReport = mockSend.mock.calls[0][0];
    expect(report.screen).toBe('TestScreen');
    expect(report.device.model).toBe('Test Device');
    expect(report.diagnostics!.stateSnapshots).toHaveLength(1);
  });

  it('shows success after successful submit', async () => {
    const root = render(<BugReportModal {...defaultProps} />);
    await act(async () => { pressButton(root, 'Submit bug report'); });
    await waitFor(() => { expect(JSON.stringify(root.toJSON())).toContain('Sent!'); });
  });

  it('shows error when integration fails', async () => {
    const integration = createMockIntegration({
      send: jest.fn().mockResolvedValue({ success: false, error: 'Network error' }),
    });
    const root = render(<BugReportModal {...defaultProps} integrations={[integration]} />);
    await act(async () => { pressButton(root, 'Submit bug report'); });
    await waitFor(() => {
      const json = JSON.stringify(root.toJSON());
      expect(json).toContain('Failed to send');
      expect(json).toContain('Network error');
    });
  });

  it('handles send exception gracefully (stuck modal fix)', async () => {
    const integration = createMockIntegration({
      send: jest.fn().mockRejectedValue(new Error('Crash')),
    });
    const root = render(<BugReportModal {...defaultProps} integrations={[integration]} />);
    await act(async () => { pressButton(root, 'Submit bug report'); });
    await waitFor(() => { expect(JSON.stringify(root.toJSON())).toContain('Failed to send'); });
  });

  it('calls onSubmitSuccess on success', async () => {
    const onSubmitSuccess = jest.fn();
    const root = render(<BugReportModal {...defaultProps} onSubmitSuccess={onSubmitSuccess} />);
    await act(async () => { pressButton(root, 'Submit bug report'); });
    await waitFor(() => { expect(onSubmitSuccess).toHaveBeenCalledTimes(1); });
  });

  it('calls onError on failure', async () => {
    const onError = jest.fn();
    const integration = createMockIntegration({
      send: jest.fn().mockResolvedValue({ success: false, error: 'Whoops' }),
    });
    const root = render(<BugReportModal {...defaultProps} integrations={[integration]} onError={onError} />);
    await act(async () => { pressButton(root, 'Submit bug report'); });
    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].message).toBe('Whoops');
    });
  });
});

import React from 'react';
import renderer from 'react-test-renderer';
import { Text } from 'react-native';
import { BugPulseErrorBoundary, getLastError, clearLastError } from '../ErrorBoundary';

function ThrowingComponent(): React.JSX.Element {
  throw new Error('Test error');
}

describe('BugPulseErrorBoundary', () => {
  beforeEach(() => {
    clearLastError();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it('renders children when no error', () => {
    const tree = renderer.create(
      <BugPulseErrorBoundary>
        <Text>Hello</Text>
      </BugPulseErrorBoundary>,
    );
    const json = tree.toJSON() as any;
    expect(json.children).toContain('Hello');
  });

  it('renders fallback on error', () => {
    const tree = renderer.create(
      <BugPulseErrorBoundary>
        <ThrowingComponent />
      </BugPulseErrorBoundary>,
    );
    const json = tree.toJSON() as any;
    // Should render the fallback View > Text with "Something went wrong"
    expect(JSON.stringify(json)).toContain('Something went wrong');
  });

  it('renders custom fallback on error', () => {
    const tree = renderer.create(
      <BugPulseErrorBoundary fallback={<Text>Custom fallback</Text>}>
        <ThrowingComponent />
      </BugPulseErrorBoundary>,
    );
    const json = tree.toJSON() as any;
    expect(json.children).toContain('Custom fallback');
  });

  it('stores error info via getLastError', () => {
    renderer.create(
      <BugPulseErrorBoundary>
        <ThrowingComponent />
      </BugPulseErrorBoundary>,
    );

    const error = getLastError();
    expect(error).not.toBeNull();
    expect(error!.message).toBe('Test error');
    expect(error!.timestamp).toBeDefined();
  });

  it('getLastError returns null when no errors', () => {
    expect(getLastError()).toBeNull();
  });

  it('clearLastError resets stored error', () => {
    renderer.create(
      <BugPulseErrorBoundary>
        <ThrowingComponent />
      </BugPulseErrorBoundary>,
    );

    expect(getLastError()).not.toBeNull();
    clearLastError();
    expect(getLastError()).toBeNull();
  });
});

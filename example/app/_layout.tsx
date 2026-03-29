import { Stack } from 'expo-router';
import {
  BugReportProvider,
  BugPulseErrorBoundary,
  SlackIntegration,
  WebhookIntegration,
  useNavigationTracker,
  trackStore,
} from '@bugpulse/react-native';
import { useEffect } from 'react';
import { useCartStore } from '../stores/cart';

// Track the cart store — state snapshots will appear in every bug report
trackStore(useCartStore, { name: 'cart' });

function NavigationTrackerWrapper({ children }: { children: React.ReactNode }) {
  useNavigationTracker();
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <BugPulseErrorBoundary>
      <BugReportProvider
        integrations={[
          // Replace with your own Slack webhook URL to see bug reports
          // SlackIntegration({
          //   webhookUrl: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
          //   imageUploadKey: 'your-imgbb-api-key',
          // }),
          WebhookIntegration({
            url: 'https://httpbin.org/post',
          }),
        ]}
        metadata={{ appVersion: '1.0.0', environment: 'demo' }}
      >
        <NavigationTrackerWrapper>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: '#1C1C1E' },
              headerTintColor: '#fff',
              contentStyle: { backgroundColor: '#000' },
            }}
          />
        </NavigationTrackerWrapper>
      </BugReportProvider>
    </BugPulseErrorBoundary>
  );
}

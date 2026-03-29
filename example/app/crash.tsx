import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

function BrokenComponent() {
  // This will throw a render error
  throw new Error('Intentional crash to test BugPulse error boundary');
}

export default function CrashScreen() {
  const [shouldCrash, setShouldCrash] = useState(false);

  return (
    <View style={styles.container}>
      {shouldCrash ? (
        <BrokenComponent />
      ) : (
        <View style={styles.content}>
          <Text style={styles.title}>Error Boundary Test</Text>
          <Text style={styles.description}>
            Tapping the button below will trigger a JS error.{'\n\n'}
            BugPulse's error boundary will catch it and store the error info.
            The next bug report you file will include this error automatically.
          </Text>
          <TouchableOpacity
            style={styles.crashButton}
            onPress={() => setShouldCrash(true)}
          >
            <Text style={styles.crashButtonText}>Trigger JS Error</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { flex: 1, padding: 20, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 12 },
  description: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  crashButton: {
    backgroundColor: '#FF453A',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 40,
  },
  crashButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});

import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { useBugReport } from '@bugpulse/react-native';
import { useCartStore } from '../stores/cart';

const PRODUCTS = [
  { id: 1, name: 'Wireless Earbuds', price: 49.99 },
  { id: 2, name: 'Phone Case', price: 19.99 },
  { id: 3, name: 'USB-C Cable', price: 12.99 },
  { id: 4, name: 'Screen Protector', price: 9.99 },
];

export default function HomeScreen() {
  const { triggerBugReport } = useBugReport();
  const addItem = useCartStore((s) => s.addItem);
  const items = useCartStore((s) => s.items);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>BugPulse Demo</Text>
        <Text style={styles.subtitle}>
          Shake your phone to report a bug.{'\n'}
          Every report includes your cart state + navigation history.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Products</Text>
        {PRODUCTS.map((product) => (
          <TouchableOpacity
            key={product.id}
            style={styles.productCard}
            onPress={() => addItem(product)}
          >
            <View>
              <Text style={styles.productName}>{product.name}</Text>
              <Text style={styles.productPrice}>${product.price}</Text>
            </View>
            <Text style={styles.addButton}>Add to Cart</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.section}>
        <Link href="/cart" asChild>
          <TouchableOpacity style={styles.cartButton}>
            <Text style={styles.cartButtonText}>
              View Cart ({items.length} items)
            </Text>
          </TouchableOpacity>
        </Link>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Debug Actions</Text>

        <TouchableOpacity
          style={styles.debugButton}
          onPress={triggerBugReport}
        >
          <Text style={styles.debugButtonText}>
            Trigger Bug Report (programmatic)
          </Text>
        </TouchableOpacity>

        <Link href="/crash" asChild>
          <TouchableOpacity style={[styles.debugButton, styles.dangerButton]}>
            <Text style={styles.debugButtonText}>
              Trigger JS Error (test error boundary)
            </Text>
          </TouchableOpacity>
        </Link>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Shake your phone or tap the button above to file a bug report.
          Check your webhook endpoint to see the full report with Zustand state
          and navigation history.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { padding: 20, paddingTop: 12 },
  title: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#8E8E93', lineHeight: 22 },
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  productCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  productName: { fontSize: 16, color: '#fff', fontWeight: '500' },
  productPrice: { fontSize: 14, color: '#8E8E93', marginTop: 2 },
  addButton: { fontSize: 14, color: '#0A84FF', fontWeight: '600' },
  cartButton: {
    backgroundColor: '#0A84FF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  cartButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  debugButton: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 8,
  },
  dangerButton: { backgroundColor: '#3A1C1C' },
  debugButtonText: { fontSize: 14, color: '#8E8E93' },
  footer: { padding: 20, paddingBottom: 40 },
  footerText: { fontSize: 13, color: '#48484A', lineHeight: 20, textAlign: 'center' },
});

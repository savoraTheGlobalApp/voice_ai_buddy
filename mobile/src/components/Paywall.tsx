import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSubscription } from '../contexts/SubscriptionContext';

interface PaywallProps {
  onClose: () => void;
}

const FEATURES = [
  { icon: 'book' as const, label: 'Unlimited stories per day' },
  { icon: 'resize' as const, label: 'All story lengths (short, medium, long)' },
  { icon: 'shield-checkmark' as const, label: 'Full parental controls' },
  { icon: 'star' as const, label: 'Priority story generation' },
];

export default function Paywall({ onClose }: PaywallProps) {
  const { products, purchase, purchasing, restorePurchases } = useSubscription();

  const monthlyProduct = products.find((p) => p.productId === 'premium_monthly');
  const yearlyProduct = products.find((p) => p.productId === 'premium_yearly');

  const monthlyPrice = monthlyProduct?.localizedPrice ?? '$4.99';
  const yearlyPrice = yearlyProduct?.localizedPrice ?? '$39.99';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color="#6b7280" />
        </TouchableOpacity>
        <Text style={styles.badge}>PREMIUM</Text>
        <Text style={styles.title}>Unlock Your Story Premium</Text>
        <Text style={styles.subtitle}>
          Create unlimited stories for your child every day
        </Text>
      </View>

      <View style={styles.featuresContainer}>
        {FEATURES.map((feature, index) => (
          <View key={index} style={styles.featureRow}>
            <Ionicons name={feature.icon} size={20} color="#3b82f6" />
            <Text style={styles.featureText}>{feature.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.plansContainer}>
        <TouchableOpacity
          style={styles.planCard}
          onPress={() => purchase('premium_yearly')}
          disabled={purchasing}
        >
          <View style={styles.saveBadge}>
            <Text style={styles.saveBadgeText}>SAVE 33%</Text>
          </View>
          <Text style={styles.planName}>Yearly</Text>
          <Text style={styles.planPrice}>{yearlyPrice}</Text>
          <Text style={styles.planPeriod}>per year</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.planCard, styles.planCardSecondary]}
          onPress={() => purchase('premium_monthly')}
          disabled={purchasing}
        >
          <Text style={styles.planName}>Monthly</Text>
          <Text style={styles.planPrice}>{monthlyPrice}</Text>
          <Text style={styles.planPeriod}>per month</Text>
        </TouchableOpacity>
      </View>

      {purchasing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Processing purchase...</Text>
        </View>
      )}

      <TouchableOpacity onPress={restorePurchases} style={styles.restoreButton}>
        <Text style={styles.restoreText}>Restore Purchases</Text>
      </TouchableOpacity>

      <Text style={styles.legalText}>
        Subscription automatically renews unless cancelled at least 24 hours
        before the end of the current period. Manage subscriptions in your
        Google Play account settings.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: 4,
  },
  badge: {
    backgroundColor: '#3b82f6',
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  featuresContainer: {
    marginBottom: 32,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  featureText: {
    fontSize: 16,
    color: '#374151',
    marginLeft: 12,
  },
  plansContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  planCard: {
    flex: 1,
    backgroundColor: '#eff6ff',
    borderWidth: 2,
    borderColor: '#3b82f6',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  planCardSecondary: {
    backgroundColor: '#f9fafb',
    borderColor: '#e5e7eb',
  },
  saveBadge: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: 8,
  },
  saveBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  planName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  planPrice: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  planPeriod: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  loadingOverlay: {
    alignItems: 'center',
    marginBottom: 16,
  },
  loadingText: {
    color: '#6b7280',
    marginTop: 8,
  },
  restoreButton: {
    alignItems: 'center',
    marginBottom: 16,
  },
  restoreText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '500',
  },
  legalText: {
    fontSize: 11,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 16,
  },
});

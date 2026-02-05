import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useSubscription } from '../../../src/contexts/SubscriptionContext';
import Paywall from '../../../src/components/Paywall';

export default function SettingsScreen() {
  const { userData, logout } = useAuth();
  const {
    isPremium,
    subscriptionTier,
    dailyStoriesUsed,
    dailyStoriesLimit,
    restorePurchases,
  } = useSubscription();
  const [showPaywall, setShowPaywall] = useState(false);

  const storiesRemaining = Math.max(0, dailyStoriesLimit - dailyStoriesUsed);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Ionicons name="person-circle" size={48} color="#3b82f6" />
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{userData?.name}</Text>
                <Text style={styles.profileEmail}>{userData?.email}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Subscription Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          <View style={styles.card}>
            <View style={styles.tierRow}>
              <View style={[styles.tierBadge, isPremium && styles.tierBadgePremium]}>
                <Ionicons
                  name={isPremium ? 'star' : 'star-outline'}
                  size={16}
                  color={isPremium ? '#fff' : '#6b7280'}
                />
                <Text style={[styles.tierText, isPremium && styles.tierTextPremium]}>
                  {isPremium ? 'Premium' : 'Free Plan'}
                </Text>
              </View>
            </View>

            {/* Usage */}
            <View style={styles.usageContainer}>
              <Text style={styles.usageLabel}>Stories today</Text>
              <View style={styles.usageBarContainer}>
                <View
                  style={[
                    styles.usageBar,
                    {
                      width: `${Math.min(100, (dailyStoriesUsed / dailyStoriesLimit) * 100)}%`,
                      backgroundColor: storiesRemaining === 0 ? '#ef4444' : '#3b82f6',
                    },
                  ]}
                />
              </View>
              <Text style={styles.usageText}>
                {dailyStoriesUsed} / {dailyStoriesLimit} used
                {storiesRemaining > 0 && ` (${storiesRemaining} remaining)`}
              </Text>
            </View>

            {!isPremium && (
              <TouchableOpacity
                style={styles.upgradeButton}
                onPress={() => setShowPaywall(true)}
              >
                <Ionicons name="arrow-up-circle" size={20} color="#fff" />
                <Text style={styles.upgradeButtonText}>Upgrade to Premium</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Actions Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.actionRow} onPress={restorePurchases}>
              <Ionicons name="refresh" size={20} color="#374151" />
              <Text style={styles.actionText}>Restore Purchases</Text>
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.actionRow} onPress={logout}>
              <Ionicons name="log-out" size={20} color="#ef4444" />
              <Text style={[styles.actionText, { color: '#ef4444' }]}>Sign Out</Text>
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.versionText}>Your Story v1.0.0</Text>
      </ScrollView>

      <Modal visible={showPaywall} animationType="slide">
        <Paywall onClose={() => setShowPaywall(false)} />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileInfo: {
    marginLeft: 12,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  profileEmail: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  tierRow: {
    marginBottom: 16,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  tierBadgePremium: {
    backgroundColor: '#3b82f6',
  },
  tierText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  tierTextPremium: {
    color: '#fff',
  },
  usageContainer: {
    marginBottom: 16,
  },
  usageLabel: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
    marginBottom: 8,
  },
  usageBarContainer: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  usageBar: {
    height: '100%',
    borderRadius: 4,
  },
  usageText: {
    fontSize: 12,
    color: '#6b7280',
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  upgradeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  actionText: {
    flex: 1,
    fontSize: 16,
    color: '#374151',
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
  },
  versionText: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 8,
  },
});

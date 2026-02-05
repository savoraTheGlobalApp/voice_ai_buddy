import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { useAuth } from './AuthContext';
import { getSubscriptionStatus, verifyPurchase, SubscriptionStatus } from '../api/subscription';

// Platform-specific import: resolves to react-native-iap on native, null on web.
// This avoids Metro trying to bundle native modules for web.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import IAP from '../lib/iap';

const PRODUCT_IDS = ['premium_monthly', 'premium_yearly'];

export type IAPProduct = { productId: string; localizedPrice?: string };

interface SubscriptionContextType {
  isPremium: boolean;
  subscriptionTier: 'free' | 'premium';
  dailyStoriesUsed: number;
  dailyStoriesLimit: number;
  products: IAPProduct[];
  loading: boolean;
  purchasing: boolean;
  purchase: (productId: string) => Promise<void>;
  restorePurchases: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const [isPremium, setIsPremium] = useState(false);
  const [subscriptionTier, setSubscriptionTier] = useState<'free' | 'premium'>('free');
  const [dailyStoriesUsed, setDailyStoriesUsed] = useState(0);
  const [dailyStoriesLimit, setDailyStoriesLimit] = useState(2);
  const [products, setProducts] = useState<IAPProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  const applyStatus = useCallback((status: SubscriptionStatus) => {
    setSubscriptionTier(status.tier);
    setIsPremium(status.tier === 'premium');
    setDailyStoriesUsed(status.stories_used_today);
    setDailyStoriesLimit(status.stories_limit);
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!currentUser?.uid) return;
    try {
      const status = await getSubscriptionStatus(currentUser.uid);
      applyStatus(status);
    } catch (e) {
      console.error('Failed to fetch subscription status:', e);
    }
  }, [currentUser?.uid, applyStatus]);

  // Initialize IAP and fetch status
  useEffect(() => {
    if (!currentUser?.uid) {
      setLoading(false);
      return;
    }

    let purchaseUpdateSub: { remove: () => void } | null = null;
    let purchaseErrorSub: { remove: () => void } | null = null;

    async function init() {
      // Fetch subscription status from backend (always works)
      await refreshStatus();

      // Initialize IAP if available (only on native dev builds, not Expo Go or web)
      if (IAP && Platform.OS !== 'web') {
        try {
          await IAP.initConnection();
          const fetchedProducts = await IAP.fetchProducts({
            skus: PRODUCT_IDS,
            type: 'subs',
          });
          if (fetchedProducts) {
            setProducts(
              fetchedProducts.map((p: any) => ({
                productId: p.productId,
                localizedPrice: p.localizedPrice,
              }))
            );
          }

          purchaseUpdateSub = IAP.purchaseUpdatedListener(async (purchase: any) => {
            if (purchase.purchaseToken && currentUser?.uid) {
              try {
                const status = await verifyPurchase(
                  currentUser.uid,
                  purchase.purchaseToken,
                  purchase.productId
                );
                applyStatus(status);
                await IAP.finishTransaction({ purchase });
              } catch (e) {
                console.error('Purchase verification failed:', e);
              }
            }
            setPurchasing(false);
          });

          purchaseErrorSub = IAP.purchaseErrorListener((error: any) => {
            console.error('Purchase error:', error);
            setPurchasing(false);
          });
        } catch (e) {
          console.log('IAP init skipped (not available in this environment):', e);
        }
      }

      setLoading(false);
    }

    init();

    return () => {
      purchaseUpdateSub?.remove();
      purchaseErrorSub?.remove();
      if (IAP && Platform.OS !== 'web') {
        IAP.endConnection();
      }
    };
  }, [currentUser?.uid]);

  const purchase = async (_productId: string) => {
    if (!IAP) {
      console.warn('In-app purchases not available in this environment');
      return;
    }
    setPurchasing(true);
    try {
      await IAP.requestPurchase({
        request: { google: {} },
        type: 'subs',
      });
    } catch (e) {
      console.error('Purchase request failed:', e);
      setPurchasing(false);
    }
  };

  const restorePurchases = async () => {
    await refreshStatus();
  };

  return (
    <SubscriptionContext.Provider
      value={{
        isPremium,
        subscriptionTier,
        dailyStoriesUsed,
        dailyStoriesLimit,
        products,
        loading,
        purchasing,
        purchase,
        restorePurchases,
        refreshStatus,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

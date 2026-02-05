import { apiClient } from './client';

export interface SubscriptionStatus {
  tier: 'free' | 'premium';
  stories_used_today: number;
  stories_limit: number;
  expires_at: string | null;
}

export async function getSubscriptionStatus(uid: string): Promise<SubscriptionStatus> {
  return apiClient<SubscriptionStatus>(`/api/users/${uid}/subscription`);
}

export async function verifyPurchase(
  uid: string,
  purchaseToken: string,
  productId: string
): Promise<SubscriptionStatus> {
  return apiClient<SubscriptionStatus>(`/api/users/${uid}/subscription/verify`, {
    method: 'POST',
    body: JSON.stringify({
      purchase_token: purchaseToken,
      product_id: productId,
    }),
  });
}

# Firestore Indexes Required

For optimal notification campaign performance, create these Firestore indexes:

## 1. Users Collection - Subscription Tier Index

**Collection:** `users`
**Fields:**
- `subscription_tier` (Ascending)

**Purpose:** Filter users by tier (free/premium) at database level

**Create via Firebase Console:**
1. Go to Firestore Database → Indexes
2. Click "Create Index"
3. Collection ID: `users`
4. Add field: `subscription_tier` → Ascending
5. Click "Create"

**Or via gcloud CLI:**
```bash
gcloud firestore indexes composite create \
  --collection-group=users \
  --field-config=field-path=subscription_tier,order=ascending
```

## 2. Notification Logs - User Lookup Index

**Collection:** `notification_logs`
**Fields:**
- `user_id` (Ascending)
- `campaign_id` (Ascending)
- `action` (Ascending)
- `sent_at` (Descending)

**Purpose:** Quickly check if user received a campaign recently

**Create via Firebase Console:**
1. Go to Firestore Database → Indexes
2. Click "Create Index"
3. Collection ID: `notification_logs`
4. Add fields:
   - `user_id` → Ascending
   - `campaign_id` → Ascending
   - `action` → Ascending
   - `sent_at` → Descending
5. Click "Create"

**Or via gcloud CLI:**
```bash
gcloud firestore indexes composite create \
  --collection-group=notification_logs \
  --field-config=field-path=user_id,order=ascending \
  --field-config=field-path=campaign_id,order=ascending \
  --field-config=field-path=action,order=ascending \
  --field-config=field-path=sent_at,order=descending
```

## 3. Campaigns - Active Lookup Index

**Collection:** `notification_campaigns`
**Fields:**
- `active` (Ascending)
- `created_at` (Descending)

**Purpose:** Efficiently fetch only active campaigns ordered by creation date

**Create via Firebase Console:**
1. Go to Firestore Database → Indexes
2. Click "Create Index"
3. Collection ID: `notification_campaigns`
4. Add fields:
   - `active` → Ascending
   - `created_at` → Descending
5. Click "Create"

**Or via gcloud CLI:**
```bash
gcloud firestore indexes composite create \
  --collection-group=notification_campaigns \
  --field-config=field-path=active,order=ascending \
  --field-config=field-path=created_at,order=descending
```

## Index Creation Notes

- Indexes typically take 5-10 minutes to build
- You'll receive an error when first running a query that needs an index
- The error message includes a link to auto-create the index
- For production, create indexes before deploying

## Performance Impact

**Without indexes:**
- Fetching 10,000 users: ~100-200 seconds
- Campaign eligibility check: Full collection scan

**With indexes:**
- Fetching filtered users: ~10-30 seconds
- Campaign eligibility check: Indexed query (10-100x faster)

## Testing Indexes

After creating indexes, test with:

```python
# Should be fast (<5 seconds for 10k users)
users = db.collection("users").where("subscription_tier", "==", "free").limit(100).stream()

# Should be fast (<2 seconds)
campaigns = db.collection("notification_campaigns").where("active", "==", True).order_by("created_at").stream()
```

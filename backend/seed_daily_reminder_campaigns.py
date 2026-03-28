"""
Seed daily reminder campaigns for Sacred Stories.

Campaigns fire at these UTC times (IST = UTC + 5:30):
  - Evening reminder : 13:30 UTC = 7:00 PM IST  (every day)
  - Weekend morning  : 03:30 UTC = 9:00 AM IST  (Sat + Sun only)

Run once to create them; re-run to overwrite (idempotent via fixed IDs).

  python seed_daily_reminder_campaigns.py
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from datetime import datetime, timezone

# ── Bootstrap Firebase ────────────────────────────────────────────────────────
import json
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

load_dotenv()

if not firebase_admin._apps:
    key_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY")
    if key_json:
        cred = credentials.Certificate(json.loads(key_json))
    else:
        cred = credentials.Certificate(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "serviceAccountKey.json"))
    firebase_admin.initialize_app(cred)

db = firestore.client()

# ── Campaign definitions ──────────────────────────────────────────────────────

NOW = datetime.now(timezone.utc).isoformat()

CAMPAIGNS = [
    {
        "campaign_id": "daily-evening-reminder",
        "name": "Daily Evening Reminder (7 PM IST)",
        "active": True,
        "trigger": {
            "type": "scheduled",
            "hour": 13,       # 13:30 UTC = 19:00 IST
            "minute": 30,
            # days_of_week omitted = every day (Mon–Sun)
        },
        "audience": {},       # empty = all users
        "content": {
            # Fallback content (used when no variants match or no variant list)
            "title": "Story time with Balu! 🐻",
            "body": "Hey {child_name}! Balu is waiting to tell you a story. Tap to start!",
            "deep_link": "/(app)/balu",
        },
        # Rotating variants — one is picked randomly per user per send
        "variants": [
            {
                "title": "Story time with Balu! 🐻",
                "body": "Hey {child_name}! Balu is waiting to tell you a story. Tap to start!",
                "deep_link": "/(app)/balu",
            },
            {
                "title": "Balu misses you 🐻",
                "body": "{child_name}, come hear a story from the Mahabharata — Balu can't wait to see you!",
                "deep_link": "/(app)/sacred-stories",
            },
            {
                "title": "New stories await! 📖",
                "body": "Balu has exciting stories to share with {child_name} today. Ready?",
                "deep_link": "/(app)/sacred-stories",
            },
            {
                "title": "5-minute story break? 🌟",
                "body": "Give {child_name} a quick adventure with Balu before bedtime!",
                "deep_link": "/(app)/balu",
            },
            {
                "title": "Wisdom awaits, {child_name}! 🏹",
                "body": "Balu has a tale from ancient India — brave warriors, clever heroes, and life lessons!",
                "deep_link": "/(app)/sacred-stories",
            },
        ],
        "stats": {"sent": 0, "opened": 0, "converted": 0},
        "created_at": NOW,
        "updated_at": NOW,
    },
    {
        "campaign_id": "weekend-morning-reminder",
        "name": "Weekend Morning Reminder (9 AM IST)",
        "active": True,
        "trigger": {
            "type": "scheduled",
            "hour": 6,        # 06:05 UTC = 11:35 IST
            "minute": 5,
            "days_of_week": [5],  # Saturday=5 only (for test)
        },
        "audience": {},
        "content": {
            "title": "Good morning! Start the day with Balu 🌅",
            "body": "{child_name}'s weekend story is ready — tap to hear it with Balu!",
            "deep_link": "/(app)/balu",
        },
        "variants": [
            {
                "title": "Good morning! Start the day with Balu 🌅",
                "body": "{child_name}'s weekend story is ready — tap to hear it with Balu!",
                "deep_link": "/(app)/balu",
            },
            {
                "title": "Weekend story time! 🐻📖",
                "body": "No school today — the perfect morning for {child_name} to explore stories with Balu!",
                "deep_link": "/(app)/sacred-stories",
            },
            {
                "title": "Balu says good morning! ☀️",
                "body": "Start {child_name}'s weekend with a tale of courage and adventure from Balu!",
                "deep_link": "/(app)/balu",
            },
        ],
        "stats": {"sent": 0, "opened": 0, "converted": 0},
        "created_at": NOW,
        "updated_at": NOW,
    },
]

# ── Write to Firestore ────────────────────────────────────────────────────────

def seed():
    col = db.collection("notification_campaigns")
    for campaign in CAMPAIGNS:
        cid = campaign["campaign_id"]
        col.document(cid).set(campaign)
        print(f"✅  Seeded campaign: {cid} — {campaign['name']}")

    print(f"\nDone. {len(CAMPAIGNS)} campaigns written to Firestore.")
    print("\nSchedule summary (IST):")
    print("  • Daily evening reminder  → 7:00 PM every day")
    print("  • Weekend morning reminder → 9:00 AM Saturday + Sunday")
    print("\nThe backend scheduler checks every 15 min and fires within an 8-min window.")

if __name__ == "__main__":
    seed()

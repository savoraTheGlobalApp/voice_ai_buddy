"""
Firebase Admin SDK initialization and database access.
Centralized Firebase service for backend operations.
"""
import os
import logging
from typing import Optional
from firebase_admin import credentials, initialize_app, firestore
from firebase_admin.exceptions import FirebaseError

logger = logging.getLogger(__name__)

# Global Firebase app instance
_firebase_app: Optional[any] = None
_db: Optional[firestore.Client] = None


def get_firebase_app():
    """
    Get or initialize Firebase Admin app.
    Uses lazy initialization - only initializes when first accessed.
    
    Returns:
        Firebase Admin app instance
    
    Raises:
        ValueError: If Firebase credentials are not configured
    """
    global _firebase_app
    
    if _firebase_app is None:
        # Check for credentials
        google_creds = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        service_account_key = os.getenv("GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY")
        firebase_creds_path = os.getenv("FIREBASE_CREDENTIALS_PATH")
        
        cred = None
        
        # Priority 1: FIREBASE_CREDENTIALS_PATH (explicit Firebase credentials)
        if firebase_creds_path and os.path.exists(firebase_creds_path):
            try:
                cred = credentials.Certificate(firebase_creds_path)
                logger.info(f"Using Firebase credentials from: {firebase_creds_path}")
            except Exception as e:
                logger.error(f"Failed to load Firebase credentials from {firebase_creds_path}: {e}")
        
        # Priority 2: GOOGLE_APPLICATION_CREDENTIALS (can be used for Firebase too)
        elif google_creds and os.path.exists(google_creds):
            try:
                cred = credentials.Certificate(google_creds)
                logger.info(f"Using Firebase credentials from GOOGLE_APPLICATION_CREDENTIALS: {google_creds}")
            except Exception as e:
                logger.error(f"Failed to load Firebase credentials from {google_creds}: {e}")
        
        # Priority 3: GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY (JSON string)
        elif service_account_key:
            try:
                import json
                import tempfile
                creds_json = json.loads(service_account_key)
                temp_file = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
                json.dump(creds_json, temp_file)
                temp_file.close()
                cred = credentials.Certificate(temp_file.name)
                logger.info("Using Firebase credentials from GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY")
            except Exception as e:
                logger.error(f"Failed to load Firebase credentials from GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY: {e}")
        
        if cred is None:
            raise ValueError(
                "Firebase credentials not found. Set one of: "
                "FIREBASE_CREDENTIALS_PATH, GOOGLE_APPLICATION_CREDENTIALS, or GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY"
            )
        
        try:
            _firebase_app = initialize_app(cred)
            logger.info("Firebase Admin SDK initialized successfully")
        except FirebaseError as e:
            logger.error(f"Failed to initialize Firebase: {e}")
            raise
    
    return _firebase_app


def get_db() -> firestore.Client:
    """
    Get Firestore database client.
    Initializes Firebase if not already initialized.
    
    Returns:
        Firestore client instance
    
    Raises:
        ValueError: If Firebase credentials are not configured
    """
    global _db
    
    if _db is None:
        # Ensure Firebase is initialized
        get_firebase_app()
        _db = firestore.client()
        logger.debug("Firestore client initialized")
    
    return _db


def is_firebase_available() -> bool:
    """
    Check if Firebase is available (credentials configured).
    
    Returns:
        True if Firebase can be initialized, False otherwise
    """
    try:
        get_firebase_app()
        return True
    except (ValueError, FirebaseError):
        return False


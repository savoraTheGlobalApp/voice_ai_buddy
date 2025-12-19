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
        # Priority order: FIREBASE_SERVICE_ACCOUNT_KEY > FIREBASE_CREDENTIALS_PATH > GOOGLE_APPLICATION_CREDENTIALS > GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY
        firebase_service_account_key = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY")
        firebase_creds_path = os.getenv("FIREBASE_CREDENTIALS_PATH")
        google_creds = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        google_cloud_service_account_key = os.getenv("GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY")
        
        cred = None
        
        # Priority 1: FIREBASE_SERVICE_ACCOUNT_KEY (dedicated Firebase credentials - highest priority)
        if firebase_service_account_key:
            try:
                import json
                # Strip whitespace and handle potential newline issues
                firebase_service_account_key = firebase_service_account_key.strip()
                # Try to parse JSON
                try:
                    creds_json = json.loads(firebase_service_account_key)
                except json.JSONDecodeError as json_err:
                    logger.error(f"Invalid JSON in FIREBASE_SERVICE_ACCOUNT_KEY: {json_err}")
                    logger.error(f"First 100 chars of key: {firebase_service_account_key[:100]}")
                    raise ValueError(f"FIREBASE_SERVICE_ACCOUNT_KEY contains invalid JSON: {json_err}")
                
                # Validate required fields
                required_fields = ["type", "project_id", "private_key_id", "private_key", "client_email"]
                missing_fields = [field for field in required_fields if field not in creds_json]
                if missing_fields:
                    logger.error(f"Missing required fields in Firebase service account key: {missing_fields}")
                    raise ValueError(f"Firebase service account key missing required fields: {missing_fields}")
                
                # Create temporary file for credentials
                import tempfile
                temp_file = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
                json.dump(creds_json, temp_file)
                temp_file.close()
                cred = credentials.Certificate(temp_file.name)
                logger.info(f"Using Firebase credentials from FIREBASE_SERVICE_ACCOUNT_KEY (project: {creds_json.get('project_id', 'unknown')})")
            except ValueError as ve:
                # Re-raise ValueError as-is (these are our validation errors)
                raise
            except Exception as e:
                logger.error(f"Failed to load Firebase credentials from FIREBASE_SERVICE_ACCOUNT_KEY: {e}", exc_info=True)
                raise ValueError(f"Failed to process FIREBASE_SERVICE_ACCOUNT_KEY: {str(e)}")
        
        # Priority 2: FIREBASE_CREDENTIALS_PATH (explicit Firebase credentials file)
        elif firebase_creds_path and os.path.exists(firebase_creds_path):
            try:
                cred = credentials.Certificate(firebase_creds_path)
                logger.info(f"Using Firebase credentials from: {firebase_creds_path}")
            except Exception as e:
                logger.error(f"Failed to load Firebase credentials from {firebase_creds_path}: {e}")
        
        # Priority 3: GOOGLE_APPLICATION_CREDENTIALS (can be used for Firebase too)
        elif google_creds and os.path.exists(google_creds):
            try:
                cred = credentials.Certificate(google_creds)
                logger.info(f"Using Firebase credentials from GOOGLE_APPLICATION_CREDENTIALS: {google_creds}")
            except Exception as e:
                logger.error(f"Failed to load Firebase credentials from {google_creds}: {e}")
        
        # Priority 4: GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY (fallback, but not recommended for Firebase)
        elif google_cloud_service_account_key:
            try:
                import json
                logger.warning("Using GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY for Firebase (not recommended). Consider using FIREBASE_SERVICE_ACCOUNT_KEY instead.")
                # Strip whitespace and handle potential newline issues
                google_cloud_service_account_key = google_cloud_service_account_key.strip()
                # Try to parse JSON
                try:
                    creds_json = json.loads(google_cloud_service_account_key)
                except json.JSONDecodeError as json_err:
                    logger.error(f"Invalid JSON in GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY: {json_err}")
                    logger.error(f"First 100 chars of key: {google_cloud_service_account_key[:100]}")
                    raise ValueError(f"GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY contains invalid JSON: {json_err}")
                
                # Validate required fields
                required_fields = ["type", "project_id", "private_key_id", "private_key", "client_email"]
                missing_fields = [field for field in required_fields if field not in creds_json]
                if missing_fields:
                    logger.error(f"Missing required fields in service account key: {missing_fields}")
                    raise ValueError(f"Service account key missing required fields: {missing_fields}")
                
                # Create temporary file for credentials
                import tempfile
                temp_file = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
                json.dump(creds_json, temp_file)
                temp_file.close()
                cred = credentials.Certificate(temp_file.name)
                logger.info(f"Using Firebase credentials from GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY (project: {creds_json.get('project_id', 'unknown')}) - fallback mode")
            except ValueError as ve:
                # Re-raise ValueError as-is (these are our validation errors)
                raise
            except Exception as e:
                logger.error(f"Failed to load Firebase credentials from GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY: {e}", exc_info=True)
                raise ValueError(f"Failed to process GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY: {str(e)}")
        
        if cred is None:
            raise ValueError(
                "Firebase credentials not found. Set one of: "
                "FIREBASE_SERVICE_ACCOUNT_KEY (recommended), FIREBASE_CREDENTIALS_PATH, "
                "GOOGLE_APPLICATION_CREDENTIALS, or GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY (fallback)"
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


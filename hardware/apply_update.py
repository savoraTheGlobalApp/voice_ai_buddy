#!/usr/bin/env python3
"""
Apply staged update atomically.
This script is called on boot before starting the main application.
"""
import sys
import shutil
import subprocess
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def apply_update():
    """Apply staged update atomically."""
    PRODUCTION_DIR = Path("/opt/voice_ai_buddy")
    STAGING_DIR = Path("/opt/voice_ai_buddy_staging")
    BACKUP_DIR = Path("/opt/voice_ai_buddy_backup")
    STATE_DIR = Path("/var/lib/voice_ai_buddy")
    
    state_file = STATE_DIR / "update_state.txt"
    version_file = STATE_DIR / "current_version.txt"
    
    # Check if update is ready
    if not state_file.exists():
        logger.info("No update state file found, skipping update")
        return True  # No update is a normal condition, not an error
    
    current_state = state_file.read_text().strip()
    
    # Handle interrupted update (power loss during application)
    if current_state == "applying":
        logger.warning("Previous update was interrupted during application, attempting recovery...")
        
        # Check if production exists
        if not PRODUCTION_DIR.exists():
            # Production was removed but move didn't complete
            if BACKUP_DIR.exists():
                logger.info("Production missing but backup exists, restoring from backup...")
                try:
                    shutil.move(str(BACKUP_DIR), str(PRODUCTION_DIR))
                    logger.info("Successfully restored production from backup")
                    state_file.write_text("idle")
                    return True
                except Exception as e:
                    logger.error(f"Failed to restore from backup: {e}")
                    state_file.write_text("failed")
                    return False
            elif STAGING_DIR.exists():
                # Backup doesn't exist, but staging does - copy staging to production
                logger.info("Production missing, copying staging to production...")
                try:
                    shutil.copytree(str(STAGING_DIR), str(PRODUCTION_DIR))
                    logger.info("Successfully copied staging to production")
                    state_file.write_text("idle")
                    return True
                except Exception as e:
                    logger.error(f"Failed to copy staging to production: {e}")
                    state_file.write_text("failed")
                    return False
            else:
                logger.error("Production missing and no backup or staging available!")
                state_file.write_text("failed")
                return False
        else:
            # Production exists - update was likely completed but state wasn't updated
            logger.info("Production exists, update likely completed. Cleaning up...")
            if BACKUP_DIR.exists():
                logger.info("Removing old backup...")
                shutil.rmtree(BACKUP_DIR)
            # Don't remove staging directory - it's persistent and needed for future updates
            state_file.write_text("idle")
            return True
    
    if current_state != "ready_to_apply":
        logger.info(f"Update not ready (state: {current_state}), skipping")
        return True  # No update is a normal condition, not an error
    
    if not STAGING_DIR.exists():
        logger.error("Staging directory not found, cannot apply update")
        state_file.write_text("failed")
        return False
    
    logger.info("Applying staged update...")
    
    try:
        # Set state to applying
        state_file.write_text("applying")
        
        # Create backup of current production
        if PRODUCTION_DIR.exists():
            logger.info("Creating backup of current production...")
            if BACKUP_DIR.exists():
                shutil.rmtree(BACKUP_DIR)
            shutil.copytree(PRODUCTION_DIR, BACKUP_DIR)
            logger.info("Backup created")
        
        # Remove old production
        if PRODUCTION_DIR.exists():
            logger.info("Removing old production directory...")
            shutil.rmtree(PRODUCTION_DIR)
        
        # Copy staging to production (keep staging directory for future updates)
        logger.info("Copying staging to production...")
        shutil.copytree(str(STAGING_DIR), str(PRODUCTION_DIR))
        
        # Get new version
        try:
            result = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                cwd=PRODUCTION_DIR,
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                new_version = result.stdout.strip()
                version_file.write_text(new_version)
                logger.info(f"Version updated to: {new_version[:8]}")
        except Exception as e:
            logger.warning(f"Failed to get new version: {e}")
        
        # Install/update dependencies if requirements.txt exists
        requirements_file = PRODUCTION_DIR / "hardware" / "requirements.txt"
        if requirements_file.exists():
            logger.info("Installing/updating dependencies...")
            venv_bin = PRODUCTION_DIR / "hardware" / "venv" / "bin" / "pip"
            if venv_bin.exists():
                try:
                    subprocess.run(
                        [str(venv_bin), "install", "-r", str(requirements_file), "--quiet"],
                        cwd=PRODUCTION_DIR / "hardware",
                        timeout=300,
                        check=True
                    )
                    logger.info("Dependencies updated successfully")
                except subprocess.TimeoutExpired:
                    logger.warning("Dependency installation timed out")
                except subprocess.CalledProcessError as e:
                    logger.warning(f"Dependency installation failed: {e}")
            else:
                logger.warning("Virtual environment not found, skipping dependency installation")
        
        # Mark as completed
        state_file.write_text("completed")
        logger.info("Update applied successfully")
        
        # Clean up backup after successful update
        if BACKUP_DIR.exists():
            logger.info("Cleaning up backup...")
            shutil.rmtree(BACKUP_DIR)
        
        return True
        
    except Exception as e:
        logger.error(f"Failed to apply update: {e}", exc_info=True)
        
        # Rollback if backup exists
        if BACKUP_DIR.exists() and not PRODUCTION_DIR.exists():
            logger.info("Rolling back to previous version...")
            try:
                shutil.move(str(BACKUP_DIR), str(PRODUCTION_DIR))
                logger.info("Rollback successful")
            except Exception as rollback_error:
                logger.error(f"Rollback failed: {rollback_error}")
        
        state_file.write_text("failed")
        return False


if __name__ == "__main__":
    # apply_update() returns True for success or no-update-needed, False only for actual errors
    success = apply_update()
    sys.exit(0 if success else 1)


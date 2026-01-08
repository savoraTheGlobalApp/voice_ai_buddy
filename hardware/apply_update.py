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

import os
import pwd

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def _detect_service_user() -> str:
    """
    Best-effort detection of the service user that should own the production tree.
    Falls back sensibly if environment variables are missing.
    """
    # Prefer the non-root user that invoked sudo
    service_user = os.getenv("SUDO_USER") or os.getenv("USER")
    if not service_user:
        service_user = pwd.getpwuid(os.getuid()).pw_name
    return service_user


def _chown_recursive(target: Path, user: str) -> None:
    """
    Recursively change ownership of a directory tree to the given user.
    Errors are logged but not raised, to avoid breaking update flow.
    """
    try:
        pw = pwd.getpwnam(user)
        uid, gid = pw.pw_uid, pw.pw_gid
    except Exception as e:
        logger.warning(f"Could not resolve user '{user}' for chown: {e}")
        return

    logger.info(f"Setting ownership of {target} to {user} ({uid}:{gid})...")
    for root, dirs, files in os.walk(target):
        root_path = Path(root)
        try:
            os.chown(root_path, uid, gid)
        except (OSError, PermissionError):
            pass
        for name in dirs:
            p = root_path / name
            try:
                os.chown(p, uid, gid)
            except (OSError, PermissionError):
                pass
        for name in files:
            p = root_path / name
            try:
                os.chown(p, uid, gid)
            except (OSError, PermissionError):
                pass


def _ensure_venv_and_dependencies(production_dir: Path) -> bool:
    """
    Ensure a virtualenv exists under hardware/venv and that requirements are installed.

    Returns:
        True on success, False on hard failure (e.g. venv creation or pip install fails).
    """
    hardware_dir = production_dir / "hardware"
    requirements_file = hardware_dir / "requirements.txt"
    venv_dir = hardware_dir / "venv"
    venv_bin = venv_dir / "bin" / "pip"

    if not requirements_file.exists():
        logger.info("requirements.txt not found, skipping dependency installation")
        return True

    # Create venv if missing
    if not venv_bin.exists():
        logger.info("Virtual environment not found, creating new one...")
        try:
            subprocess.run(
                ["python3", "-m", "venv", str(venv_dir)],
                cwd=hardware_dir,
                timeout=60,
                check=True,
            )
            logger.info("Virtual environment created successfully")
        except subprocess.TimeoutExpired:
            logger.error("Virtual environment creation timed out")
            return False
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to create virtual environment: {e}")
            return False

    # Install / update dependencies
    logger.info("Installing/updating dependencies from requirements.txt...")
    try:
        subprocess.run(
            [str(venv_bin), "install", "-r", str(requirements_file), "--quiet"],
            cwd=hardware_dir,
            timeout=300,
            check=True,
        )
        logger.info("Dependencies updated successfully")
        return True
    except subprocess.TimeoutExpired:
        logger.error("Dependency installation timed out")
        return False
    except subprocess.CalledProcessError as e:
        logger.error(f"Dependency installation failed: {e}")
        return False


def _clear_directory_contents(directory: Path) -> None:
    """
    Remove all contents of a directory without deleting the directory itself.
    
    This is necessary when the service user cannot delete directories in /opt/
    (which is owned by root), but can manage the contents of directories they own.
    
    Args:
        directory: Path to directory whose contents should be cleared
    """
    if not directory.exists() or not directory.is_dir():
        return
    
    import stat
    
    try:
        # Get current user for permission fixing
        current_uid = os.getuid()
        current_gid = os.getgid()
        
        # Try to fix permissions of directory itself
        try:
            os.chown(directory, current_uid, current_gid)
            os.chmod(directory, stat.S_IRWXU | stat.S_IRGRP | stat.S_IXGRP | stat.S_IROTH | stat.S_IXOTH)
        except (OSError, PermissionError):
            pass
        
        # Remove all contents
        for item in directory.iterdir():
            try:
                if item.is_dir():
                    shutil.rmtree(item)
                else:
                    item.unlink()
            except (PermissionError, OSError) as e:
                # Try to fix permissions first
                try:
                    if item.is_dir():
                        # Fix permissions recursively
                        for root, dirs, files in os.walk(item):
                            try:
                                os.chown(root, current_uid, current_gid)
                            except (OSError, PermissionError):
                                pass
                            for d in dirs:
                                try:
                                    os.chown(os.path.join(root, d), current_uid, current_gid)
                                except (OSError, PermissionError):
                                    pass
                            for f in files:
                                try:
                                    file_path = os.path.join(root, f)
                                    os.chown(file_path, current_uid, current_gid)
                                    os.chmod(file_path, stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IROTH)
                                except (OSError, PermissionError):
                                    pass
                        shutil.rmtree(item)
                    else:
                        os.chown(item, current_uid, current_gid)
                        os.chmod(item, stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IROTH)
                        item.unlink()
                except Exception:
                    logger.warning(f"Could not remove {item}, continuing...")
    except Exception as e:
        logger.warning(f"Error clearing directory contents: {e}")


def _copy_directory_contents(source_dir: Path, dest_dir: Path) -> None:
    """
    Copy all contents from source directory to destination directory.
    
    The destination directory must already exist. This function copies all files
    and subdirectories from source into the existing destination directory.
    
    Args:
        source_dir: Source directory to copy from
        dest_dir: Destination directory to copy into (must exist)
    """
    if not source_dir.exists() or not source_dir.is_dir():
        raise ValueError(f"Source directory does not exist: {source_dir}")
    
    if not dest_dir.exists() or not dest_dir.is_dir():
        raise ValueError(f"Destination directory does not exist: {dest_dir}")
    
    # Copy each item from source to destination
    for item in source_dir.iterdir():
        dest_item = dest_dir / item.name
        
        # Remove destination if it exists
        if dest_item.exists():
            if dest_item.is_dir():
                shutil.rmtree(dest_item)
            else:
                dest_item.unlink()
        
        # Copy item
        if item.is_dir():
            shutil.copytree(item, dest_item)
        else:
            shutil.copy2(item, dest_item)


def _restore_local_files_from_backup(backup_dir: Path, production_dir: Path) -> None:
    """
    Restore local-only, non-tracked config files from backup into the new production.

    This is intentionally conservative: we only restore a small, well-defined set
    of files we know are safe to overlay (like .env).
    """
    if not backup_dir.exists():
        return

    # List of relative paths to restore if present in backup
    local_files = [
        Path("hardware/.env"),
    ]

    for rel_path in local_files:
        backup_file = backup_dir / rel_path
        target_file = production_dir / rel_path
        if backup_file.exists():
            try:
                target_file.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(backup_file, target_file)
                logger.info(f"Restored local file from backup: {rel_path}")
            except Exception as e:
                logger.warning(f"Failed to restore local file {rel_path}: {e}")


def apply_update():
    """Apply staged update atomically."""
    PRODUCTION_DIR = Path("/opt/voice_ai_buddy")
    STAGING_DIR = Path("/opt/voice_ai_buddy_staging")
    STATE_DIR = Path("/var/lib/voice_ai_buddy")
    BACKUP_DIR = STATE_DIR / "backup"
    
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
            # Production was removed but copy didn't complete
            if BACKUP_DIR.exists():
                logger.info("Production missing but backup exists, restoring from backup...")
                try:
                    # Production directory should exist (created by setup), but if not, we can't create it
                    if not PRODUCTION_DIR.exists():
                        logger.error("Production directory does not exist and cannot be created")
                        state_file.write_text("failed")
                        return False
                    _copy_directory_contents(BACKUP_DIR, PRODUCTION_DIR)
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
                    # Production directory should exist (created by setup), but if not, we can't create it
                    if not PRODUCTION_DIR.exists():
                        logger.error("Production directory does not exist and cannot be created")
                        state_file.write_text("failed")
                        return False
                    _copy_directory_contents(STAGING_DIR, PRODUCTION_DIR)
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
        
        # Clear production directory contents (cannot delete directory itself in /opt/)
        if PRODUCTION_DIR.exists():
            logger.info("Clearing production directory contents...")
            _clear_directory_contents(PRODUCTION_DIR)
        
        # Ensure production directory exists (should already exist, but check)
        if not PRODUCTION_DIR.exists():
            logger.error("Production directory does not exist and cannot be created")
            state_file.write_text("failed")
            return False
        
        # Copy staging contents to production (keep staging directory for future updates)
        logger.info("Copying staging contents to production...")
        try:
            _copy_directory_contents(STAGING_DIR, PRODUCTION_DIR)
        except Exception as copy_error:
            logger.error(f"Failed to copy staging to production: {copy_error}")
            # Critical: If copy fails, production directory is empty
            # Rollback immediately to restore service
            if BACKUP_DIR.exists():
                logger.info("Rolling back: Restoring production from backup...")
                try:
                    _clear_directory_contents(PRODUCTION_DIR)
                    _copy_directory_contents(BACKUP_DIR, PRODUCTION_DIR)
                    logger.info("Rollback successful - production restored")
                except Exception as rollback_error:
                    logger.error(f"Rollback failed: {rollback_error}")
                    state_file.write_text("failed")
                    return False
            else:
                logger.error("No backup available for rollback!")
                state_file.write_text("failed")
                return False
            # If we got here, rollback succeeded but update failed
            state_file.write_text("failed")
            return False

        # Restore local-only config files (e.g., .env) from backup
        _restore_local_files_from_backup(BACKUP_DIR, PRODUCTION_DIR)

        # Fix ownership and permissions of production directory
        service_user = _detect_service_user()
        _chown_recursive(PRODUCTION_DIR, service_user)

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
        
        # Ensure virtualenv and dependencies are in place
        if not _ensure_venv_and_dependencies(PRODUCTION_DIR):
            logger.error("Failed to setup virtual environment and dependencies")
            # Rollback if venv/deps setup fails - restore production from backup
            if BACKUP_DIR.exists():
                logger.info("Rolling back due to venv/deps failure...")
                try:
                    if PRODUCTION_DIR.exists():
                        _clear_directory_contents(PRODUCTION_DIR)
                    _copy_directory_contents(BACKUP_DIR, PRODUCTION_DIR)
                    logger.info("Rollback successful - production restored")
                except Exception as rollback_error:
                    logger.error(f"Rollback failed: {rollback_error}")
            state_file.write_text("failed")
            return False
        
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
        
        # Rollback if backup exists and production is missing or empty
        if BACKUP_DIR.exists():
            if not PRODUCTION_DIR.exists():
                logger.error("Production directory missing - cannot restore (requires manual intervention)")
            else:
                logger.info("Rolling back to previous version...")
                try:
                    _clear_directory_contents(PRODUCTION_DIR)
                    _copy_directory_contents(BACKUP_DIR, PRODUCTION_DIR)
                    logger.info("Rollback successful")
                except Exception as rollback_error:
                    logger.error(f"Rollback failed: {rollback_error}")
        
        state_file.write_text("failed")
        return False


if __name__ == "__main__":
    # apply_update() returns True for success or no-update-needed, False only for actual errors
    success = apply_update()
    sys.exit(0 if success else 1)


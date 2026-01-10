#!/usr/bin/env python3
"""
Orchestrator for Voice AI Buddy update system.
This script is FIXED and NEVER updated - it handles orchestration only.

Uses version directories and symlinks for atomic updates.
"""
import sys
import os
import shutil
import subprocess
import logging
from pathlib import Path
from typing import Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Fixed paths (never change)
ORCHESTRATOR_DIR = Path("/opt/voice_ai_buddy_orchestrator")
PRODUCTION_SYMLINK = Path("/opt/voice_ai_buddy")
PRODUCTION_V1 = Path("/opt/voice_ai_buddy_v1")
PRODUCTION_V2 = Path("/opt/voice_ai_buddy_v2")
STAGING_DIR = Path("/opt/voice_ai_buddy_staging")
STATE_DIR = Path("/var/lib/voice_ai_buddy")
SHARED_VENV = STATE_DIR / "venv"
SHARED_ENV = STATE_DIR / ".env"
BACKUP_DIR = STATE_DIR / "backup"

STATE_FILE = STATE_DIR / "update_state.txt"
VERSION_FILE = STATE_DIR / "current_version.txt"


def _detect_service_user() -> str:
    """Detect the service user."""
    service_user = os.getenv("SUDO_USER") or os.getenv("USER")
    if not service_user:
        try:
            import pwd
            service_user = pwd.getpwuid(os.getuid()).pw_name
        except Exception:
            service_user = "root"
    return service_user


def _atomic_write_state(state: str) -> None:
    """Atomically write state file."""
    temp_file = STATE_FILE.with_suffix('.tmp')
    try:
        temp_file.write_text(state)
        temp_file.replace(STATE_FILE)  # Atomic on Linux
        
        # Fix ownership after writing (orchestrator runs as root, but updater needs write access)
        try:
            import os
            import pwd
            service_user = _detect_service_user()
            try:
                user_info = pwd.getpwnam(service_user)
                os.chown(STATE_FILE, user_info.pw_uid, user_info.pw_gid)
                os.chmod(STATE_FILE, 0o644)  # rw-r--r--
            except Exception:
                pass
        except Exception:
            pass
    except Exception as e:
        logger.error(f"Failed to write state atomically: {e}")
        # Fallback to direct write
        STATE_FILE.write_text(state)
        # Fix ownership
        try:
            import os
            import pwd
            service_user = _detect_service_user()
            try:
                user_info = pwd.getpwnam(service_user)
                os.chown(STATE_FILE, user_info.pw_uid, user_info.pw_gid)
                os.chmod(STATE_FILE, 0o644)
            except Exception:
                pass
        except Exception:
            pass


def _read_state() -> str:
    """Read current state."""
    if not STATE_FILE.exists():
        return "idle"
    try:
        return STATE_FILE.read_text().strip()
    except Exception:
        return "idle"


def _is_git_repo_valid(repo_path: Path) -> bool:
    """Check if a directory is a valid git repository."""
    if not repo_path.exists():
        return False
    
    git_dir = repo_path / ".git"
    if not git_dir.exists() or not git_dir.is_dir():
        return False
    
    # Check if .git has content
    try:
        git_items = list(git_dir.iterdir())
        if len(git_items) == 0:
            return False
        
        # Check for critical git files
        if not (git_dir / "HEAD").exists() and not (git_dir / "config").exists():
            return False
    except Exception:
        return False
    
    # Try to get commit hash
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=repo_path,
            capture_output=True,
            timeout=10
        )
        return result.returncode == 0
    except Exception:
        return False


def _is_version_valid(version_dir: Path) -> bool:
    """Validate a version directory."""
    if not version_dir.exists():
        return False
    
    # Check git repo
    if not _is_git_repo_valid(version_dir):
        logger.warning(f"{version_dir} is not a valid git repository")
        return False
    
    # Check for hardware directory
    hardware_dir = version_dir / "hardware"
    if not hardware_dir.exists() or not hardware_dir.is_dir():
        logger.warning(f"{version_dir} missing hardware/ directory")
        return False
    
    # Check for rpi_client module
    rpi_client_dir = hardware_dir / "rpi_client"
    if not rpi_client_dir.exists() or not rpi_client_dir.is_dir():
        logger.warning(f"{version_dir} missing hardware/rpi_client/ directory")
        return False
    
    return True


def _get_version_commit(version_dir: Path) -> Optional[str]:
    """Get commit hash from version directory."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=version_dir,
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return None


def _get_active_version() -> Optional[Path]:
    """Get the currently active version directory."""
    if not PRODUCTION_SYMLINK.exists():
        return None
    
    try:
        # Resolve symlink
        target = PRODUCTION_SYMLINK.resolve()
        if target == PRODUCTION_V1:
            return PRODUCTION_V1
        elif target == PRODUCTION_V2:
            return PRODUCTION_V2
    except Exception:
        pass
    
    return None


def _swap_version(new_version: Path) -> bool:
    """Atomically swap to new version."""
    try:
        # Create symlink atomically
        temp_link = PRODUCTION_SYMLINK.with_suffix('.tmp')
        if temp_link.exists():
            temp_link.unlink()
        
        # Create new symlink
        temp_link.symlink_to(new_version)
        
        # Atomic swap
        temp_link.replace(PRODUCTION_SYMLINK)
        
        logger.info(f"Swapped to {new_version.name}")
        return True
    except Exception as e:
        logger.error(f"Failed to swap version: {e}")
        return False


def _copy_excluding(source: Path, dest: Path, exclude_patterns: list[str]) -> None:
    """Copy directory contents excluding specified patterns."""
    # Ensure destination directory exists
    dest.mkdir(parents=True, exist_ok=True)
    
    # Fix ownership of destination directory if possible
    try:
        import os
        import pwd
        service_user = _detect_service_user()
        try:
            user_info = pwd.getpwnam(service_user)
            os.chown(dest, user_info.pw_uid, user_info.pw_gid)
        except Exception:
            pass
    except Exception:
        pass
    
    def should_exclude(item_path: Path) -> bool:
        try:
            rel_path = item_path.relative_to(source)
            rel_path_str = str(rel_path).replace('\\', '/')
            for pattern in exclude_patterns:
                if rel_path_str == pattern or rel_path_str.startswith(pattern + '/'):
                    return True
        except ValueError:
            pass
        return False
    
    def remove_with_permissions(path: Path) -> None:
        """Remove file/directory, fixing permissions if needed."""
        if not path.exists():
            return
        
        try:
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()
        except PermissionError:
            # Try to fix permissions first
            try:
                import os
                import pwd
                import stat
                service_user = _detect_service_user()
                try:
                    user_info = pwd.getpwnam(service_user)
                    if path.is_dir():
                        # Fix permissions recursively
                        for root, dirs, files in os.walk(path):
                            os.chown(root, user_info.pw_uid, user_info.pw_gid)
                            os.chmod(root, stat.S_IRWXU | stat.S_IRGRP | stat.S_IXGRP | stat.S_IROTH | stat.S_IXOTH)
                            for d in dirs:
                                os.chown(os.path.join(root, d), user_info.pw_uid, user_info.pw_gid)
                                os.chmod(os.path.join(root, d), stat.S_IRWXU | stat.S_IRGRP | stat.S_IXGRP | stat.S_IROTH | stat.S_IXOTH)
                            for f in files:
                                file_path = os.path.join(root, f)
                                os.chown(file_path, user_info.pw_uid, user_info.pw_gid)
                                os.chmod(file_path, stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IROTH)
                    else:
                        os.chown(path, user_info.pw_uid, user_info.pw_gid)
                        os.chmod(path, stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IROTH)
                    # Retry removal
                    if path.is_dir():
                        shutil.rmtree(path)
                    else:
                        path.unlink()
                except Exception:
                    # If we can't fix permissions, try as root
                    if path.is_dir():
                        shutil.rmtree(path)
                    else:
                        path.unlink()
            except Exception as e:
                logger.warning(f"Could not remove {path}: {e}, will try to overwrite")
                # Continue - we'll try to overwrite it
    
    for item in source.iterdir():
        if should_exclude(item):
            logger.debug(f"Skipping {item.name} (excluded pattern)")
            continue
        
        dest_item = dest / item.name
        
        # Remove destination if exists (with permission handling)
        if dest_item.exists():
            remove_with_permissions(dest_item)
        
        # Ensure parent directory exists (especially for nested files)
        if item.is_file():
            dest_item.parent.mkdir(parents=True, exist_ok=True)
            # Fix ownership of parent
            try:
                import os
                import pwd
                service_user = _detect_service_user()
                try:
                    user_info = pwd.getpwnam(service_user)
                    os.chown(dest_item.parent, user_info.pw_uid, user_info.pw_gid)
                except Exception:
                    pass
            except Exception:
                pass
        
        # Copy item
        try:
            if item.is_dir():
                shutil.copytree(item, dest_item)
            else:
                shutil.copy2(item, dest_item)
            
            # Fix ownership after copy
            try:
                import os
                import pwd
                service_user = _detect_service_user()
                try:
                    user_info = pwd.getpwnam(service_user)
                    if dest_item.is_dir():
                        for root, dirs, files in os.walk(dest_item):
                            os.chown(root, user_info.pw_uid, user_info.pw_gid)
                            for d in dirs:
                                os.chown(os.path.join(root, d), user_info.pw_uid, user_info.pw_gid)
                            for f in files:
                                os.chown(os.path.join(root, f), user_info.pw_uid, user_info.pw_gid)
                    else:
                        os.chown(dest_item, user_info.pw_uid, user_info.pw_gid)
                except Exception:
                    pass
            except Exception:
                pass
        except FileNotFoundError as e:
            # If parent directory still doesn't exist, create it and retry
            dest_item.parent.mkdir(parents=True, exist_ok=True)
            if item.is_dir():
                shutil.copytree(item, dest_item)
            else:
                shutil.copy2(item, dest_item)


def _ensure_shared_venv() -> bool:
    """Ensure shared venv exists and dependencies are installed."""
    if not SHARED_VENV.exists():
        logger.info("Creating shared virtual environment...")
        try:
            subprocess.run(
                ["python3", "-m", "venv", str(SHARED_VENV)],
                check=True,
                timeout=60
            )
            logger.info("Shared venv created")
        except Exception as e:
            logger.error(f"Failed to create shared venv: {e}")
            return False
    
    # Find requirements.txt from active version
    active_version = _get_active_version()
    if not active_version:
        # Try v1, then v2
        for version_dir in [PRODUCTION_V1, PRODUCTION_V2]:
            if version_dir.exists():
                active_version = version_dir
                break
    
    if not active_version:
        logger.warning("No active version found, skipping dependency installation")
        return True
    
    requirements_file = active_version / "hardware" / "requirements.txt"
    if not requirements_file.exists():
        logger.info("requirements.txt not found, skipping dependency installation")
        return True
    
    # Install/update dependencies
    venv_pip = SHARED_VENV / "bin" / "pip"
    if not venv_pip.exists():
        logger.error("Shared venv pip not found")
        return False
    
    logger.info("Installing/updating dependencies...")
    try:
        result = subprocess.run(
            [str(venv_pip), "install", "-r", str(requirements_file), "--quiet"],
            timeout=300,
            check=True,
            capture_output=True
        )
        logger.info("Dependencies updated successfully")
        return True
    except subprocess.TimeoutExpired:
        logger.error("Dependency installation timed out")
        return False
    except subprocess.CalledProcessError as e:
        logger.error(f"Dependency installation failed: {e}")
        if e.stderr:
            logger.error(f"Error: {e.stderr.decode()}")
        return False


def _recover_from_interruption() -> bool:
    """Recover from interrupted update."""
    logger.warning("Previous update was interrupted, attempting recovery...")
    
    active_version = _get_active_version()
    
    if active_version:
        # Validate active version
        if _is_version_valid(active_version):
            logger.info(f"Active version {active_version.name} is valid, update likely completed")
            _atomic_write_state("idle")
            return True
        else:
            logger.warning(f"Active version {active_version.name} is invalid, attempting rollback...")
            # Swap to other version
            other_version = PRODUCTION_V2 if active_version == PRODUCTION_V1 else PRODUCTION_V1
            if other_version.exists() and _is_version_valid(other_version):
                logger.info(f"Rolling back to {other_version.name}")
                if _swap_version(other_version):
                    _atomic_write_state("idle")
                    return True
            else:
                logger.error("Other version is also invalid or doesn't exist")
    
    # No valid active version - try to restore from staging
    if STAGING_DIR.exists() and _is_version_valid(STAGING_DIR):
        logger.info("No valid active version, restoring from staging...")
        # Determine which version to use
        target_version = PRODUCTION_V1
        if PRODUCTION_V1.exists() and _is_version_valid(PRODUCTION_V1):
            target_version = PRODUCTION_V2
        
        # Copy staging to target version
        try:
            if target_version.exists():
                shutil.rmtree(target_version)
            _copy_excluding(STAGING_DIR, target_version, ['hardware/venv', 'hardware/.env'])
            
            # Create symlink to shared .env
            hardware_dir = target_version / "hardware"
            env_link = hardware_dir / ".env"
            if env_link.exists() or env_link.is_symlink():
                env_link.unlink()
            try:
                env_link.symlink_to(SHARED_ENV)
                logger.info("Created symlink to shared .env")
            except Exception as e:
                logger.warning(f"Failed to create .env symlink: {e}")
            
            if _is_version_valid(target_version):
                _swap_version(target_version)
                _atomic_write_state("idle")
                return True
        except Exception as e:
            logger.error(f"Failed to restore from staging: {e}")
    
    logger.error("Recovery failed - manual intervention required")
    _atomic_write_state("failed")
    return False


def _apply_update() -> bool:
    """Apply staged update."""
    if not STAGING_DIR.exists():
        logger.error("Staging directory not found")
        _atomic_write_state("failed")
        return False
    
    # Validate staging
    if not _is_version_valid(STAGING_DIR):
        logger.error("Staging directory is invalid")
        _atomic_write_state("failed")
        return False
    
    staging_version = _get_version_commit(STAGING_DIR)
    if not staging_version:
        logger.error("Could not get staging version")
        _atomic_write_state("failed")
        return False
    
    logger.info(f"Applying update: {staging_version[:8]}")
    
    # Determine target version (use the one that's NOT active)
    active_version = _get_active_version()
    if active_version == PRODUCTION_V1:
        target_version = PRODUCTION_V2
    elif active_version == PRODUCTION_V2:
        target_version = PRODUCTION_V1
    else:
        # No active version, use v1
        target_version = PRODUCTION_V1
    
    # Remove target version if exists
    if target_version.exists():
        logger.info(f"Removing old {target_version.name}...")
        try:
            # Fix permissions before removing
            import os
            import pwd
            import stat
            service_user = _detect_service_user()
            try:
                user_info = pwd.getpwnam(service_user)
                # Fix permissions recursively
                for root, dirs, files in os.walk(target_version):
                    try:
                        os.chown(root, user_info.pw_uid, user_info.pw_gid)
                        os.chmod(root, stat.S_IRWXU | stat.S_IRGRP | stat.S_IXGRP | stat.S_IROTH | stat.S_IXOTH)
                    except Exception:
                        pass
                    for d in dirs:
                        try:
                            os.chown(os.path.join(root, d), user_info.pw_uid, user_info.pw_gid)
                            os.chmod(os.path.join(root, d), stat.S_IRWXU | stat.S_IRGRP | stat.S_IXGRP | stat.S_IROTH | stat.S_IXOTH)
                        except Exception:
                            pass
                    for f in files:
                        try:
                            file_path = os.path.join(root, f)
                            os.chown(file_path, user_info.pw_uid, user_info.pw_gid)
                            os.chmod(file_path, stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IROTH)
                        except Exception:
                            pass
            except Exception:
                pass
            shutil.rmtree(target_version)
        except Exception as e:
            logger.warning(f"Error removing old {target_version.name}: {e}, continuing anyway")
    
    # Ensure target version directory exists and is empty
    target_version.mkdir(parents=True, exist_ok=True)
    
    # Copy staging to target version (excluding venv and .env)
    logger.info(f"Copying staging to {target_version.name}...")
    try:
        _copy_excluding(STAGING_DIR, target_version, ['hardware/venv', 'hardware/.env'])
    except Exception as e:
        logger.error(f"Failed to copy staging: {e}", exc_info=True)
        # Clean up partial copy
        if target_version.exists():
            try:
                shutil.rmtree(target_version)
            except Exception:
                pass
        _atomic_write_state("failed")
        return False
    
    # Validate target version
    if not _is_version_valid(target_version):
        logger.error(f"{target_version.name} is invalid after copy")
        if target_version.exists():
            shutil.rmtree(target_version)
        _atomic_write_state("failed")
        return False
    
    target_version_commit = _get_version_commit(target_version)
    if target_version_commit != staging_version:
        logger.error(f"Version mismatch: expected {staging_version[:8]}, got {target_version_commit[:8] if target_version_commit else 'none'}")
        if target_version.exists():
            shutil.rmtree(target_version)
        _atomic_write_state("failed")
        return False
    
    # Create symlink to shared .env
    hardware_dir = target_version / "hardware"
    env_link = hardware_dir / ".env"
    if env_link.exists() or env_link.is_symlink():
        env_link.unlink()
    try:
        env_link.symlink_to(SHARED_ENV)
        logger.info("Created symlink to shared .env")
    except Exception as e:
        logger.warning(f"Failed to create .env symlink: {e}")
        # Continue anyway - app might work without it
    
    # Update shared venv
    if not _ensure_shared_venv():
        logger.error("Failed to update shared venv")
        if target_version.exists():
            shutil.rmtree(target_version)
        _atomic_write_state("failed")
        return False
    
    # Atomic swap
    logger.info(f"Swapping to {target_version.name}...")
    if not _swap_version(target_version):
        logger.error("Failed to swap version")
        if target_version.exists():
            shutil.rmtree(target_version)
        _atomic_write_state("failed")
        return False
    
    # Verify active version
    new_active = _get_active_version()
    if new_active != target_version:
        logger.error("Swap succeeded but active version is wrong, rolling back...")
        if active_version and active_version.exists():
            _swap_version(active_version)
        _atomic_write_state("failed")
        return False
    
    # Update version file
    try:
        VERSION_FILE.write_text(staging_version)
        # Fix ownership
        try:
            import os
            import pwd
            service_user = _detect_service_user()
            try:
                user_info = pwd.getpwnam(service_user)
                os.chown(VERSION_FILE, user_info.pw_uid, user_info.pw_gid)
                os.chmod(VERSION_FILE, 0o644)
            except Exception:
                pass
        except Exception:
            pass
        logger.info(f"Version updated to: {staging_version[:8]}")
    except Exception as e:
        logger.warning(f"Failed to update version file: {e}")
    
    # Success!
    _atomic_write_state("completed")
    logger.info("Update applied successfully")
    
    # Clean up old version (optional - keep for rollback)
    # old_version = PRODUCTION_V2 if target_version == PRODUCTION_V1 else PRODUCTION_V1
    # if old_version.exists():
    #     logger.info(f"Cleaning up old {old_version.name}...")
    #     shutil.rmtree(old_version)
    
    return True


def main():
    """Main orchestrator entry point."""
    logger.info("Orchestrator started")
    
    # Ensure directories exist
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    
    # Ensure state directory has correct ownership (orchestrator runs as root)
    try:
        import os
        import pwd
        service_user = _detect_service_user()
        try:
            user_info = pwd.getpwnam(service_user)
            os.chown(STATE_DIR, user_info.pw_uid, user_info.pw_gid)
            os.chmod(STATE_DIR, 0o755)  # rwxr-xr-x
            # Fix ownership of existing files
            for file in STATE_DIR.iterdir():
                if file.is_file():
                    try:
                        os.chown(file, user_info.pw_uid, user_info.pw_gid)
                        os.chmod(file, 0o644)  # rw-r--r--
                    except Exception:
                        pass
        except Exception:
            pass
    except Exception:
        pass
    
    # Ensure v2 directory exists (needed for hybrid system)
    if not PRODUCTION_V2.exists():
        logger.info("Creating v2 directory...")
        PRODUCTION_V2.mkdir(parents=True, exist_ok=True)
        # Set ownership if possible
        try:
            import os
            import pwd
            service_user = _detect_service_user()
            try:
                user_info = pwd.getpwnam(service_user)
                os.chown(PRODUCTION_V2, user_info.pw_uid, user_info.pw_gid)
            except Exception:
                pass
        except Exception:
            pass
    
    # Log current state for debugging
    current_state = _read_state()
    logger.info(f"Current update state: {current_state}")
    
    # Handle interrupted update
    if current_state == "applying":
        logger.warning("Detected interrupted update, attempting recovery...")
        if not _recover_from_interruption():
            logger.error("Recovery failed")
            sys.exit(1)
        logger.info("Recovery successful")
        return
    
    # Handle failed state - check if staging is valid and can be applied
    if current_state == "failed":
        logger.info("State is 'failed', checking if staging is valid...")
        if STAGING_DIR.exists() and _is_version_valid(STAGING_DIR):
            staging_version = _get_version_commit(STAGING_DIR)
            if staging_version:
                logger.info(f"Staging is valid (version: {staging_version[:8]}), resetting state to ready_to_apply")
                _atomic_write_state("ready_to_apply")
                current_state = "ready_to_apply"
            else:
                logger.warning("Staging exists but version cannot be determined, keeping failed state")
                return
        else:
            logger.info("Staging is invalid or missing, keeping failed state")
            return
    
    # Check if update is ready
    if current_state != "ready_to_apply":
        logger.info(f"Update not ready (state: {current_state}), skipping")
        return
    
    # Apply update
    logger.info("Applying staged update...")
    _atomic_write_state("applying")
    
    try:
        success = _apply_update()
        if not success:
            logger.error("Update failed")
            sys.exit(1)
        logger.info("Update completed successfully")
    except Exception as e:
        logger.error(f"Update failed with exception: {e}", exc_info=True)
        _atomic_write_state("failed")
        sys.exit(1)


if __name__ == "__main__":
    main()


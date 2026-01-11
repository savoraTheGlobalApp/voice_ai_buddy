"""
Update daemon for automatic code updates from GitHub.
Handles checking, downloading, and staging updates for next boot.
"""
import asyncio
import logging
import subprocess
import json
import time
from pathlib import Path
from typing import Optional, Dict, Any
from enum import Enum

logger = logging.getLogger(__name__)


class UpdateState(Enum):
    """Update state enumeration."""
    IDLE = "idle"
    CHECKING = "checking"
    DOWNLOADING = "downloading"
    READY_TO_APPLY = "ready_to_apply"
    APPLYING = "applying"
    COMPLETED = "completed"
    FAILED = "failed"


class UpdateManager:
    """
    Manages automatic updates from GitHub.
    
    Features:
    - Background update checking and downloading
    - Atomic update application on next boot
    - State tracking and recovery
    - Git-based version management
    """
    
    def __init__(
        self,
        production_dir: Path,
        staging_dir: Path,
        state_dir: Path,
        repo_url: str,
        branch: str = "main"
    ):
        """
        Initialize update manager.
        
        Args:
            production_dir: Path to production application directory
            staging_dir: Path to staging directory for updates
            state_dir: Path to state directory for tracking files
            repo_url: GitHub repository URL (SSH or HTTPS)
            branch: Git branch to track (default: main)
        """
        self.production_dir = Path(production_dir)
        self.staging_dir = Path(staging_dir)
        self.state_dir = Path(state_dir)
        self.repo_url = repo_url
        self.branch = branch
        
        # State file paths
        self.state_file = self.state_dir / "update_state.txt"
        self.version_file = self.state_dir / "current_version.txt"
        self.lock_file = self.state_dir / "update_lock"
        self.log_file = self.state_dir / "update.log"
        
        # Ensure directories exist
        self.state_dir.mkdir(parents=True, exist_ok=True)
        
        # Update check interval (seconds)
        self.check_interval = 3600  # 1 hour default
        self.initial_delay = 60  # Wait 60 seconds after boot before first check
        
        self.is_running = False
        self._check_task: Optional[asyncio.Task] = None
    
    def get_current_state(self) -> UpdateState:
        """Get current update state from file."""
        try:
            if self.state_file.exists():
                state_str = self.state_file.read_text().strip()
                return UpdateState(state_str)
        except Exception as e:
            logger.warning(f"Failed to read state file: {e}")
        return UpdateState.IDLE
    
    def set_state(self, state: UpdateState) -> None:
        """Set update state in file."""
        try:
            self.state_file.write_text(state.value)
            self._log(f"State changed to: {state.value}")
        except Exception as e:
            logger.error(f"Failed to write state file: {e}")
    
    def get_current_version(self) -> Optional[str]:
        """Get current version (Git commit hash) from file."""
        try:
            if self.version_file.exists():
                return self.version_file.read_text().strip()
        except Exception as e:
            logger.warning(f"Failed to read version file: {e}")
        return None
    
    def set_version(self, version: str) -> None:
        """Set current version in file."""
        try:
            self.version_file.write_text(version)
            self._log(f"Version updated to: {version}")
        except Exception as e:
            logger.error(f"Failed to write version file: {e}")
    
    def _log(self, message: str) -> None:
        """Log message to file and logger."""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        log_entry = f"[{timestamp}] {message}\n"
        try:
            with open(self.log_file, "a") as f:
                f.write(log_entry)
        except Exception as e:
            logger.warning(f"Failed to write to log file: {e}")
        logger.info(message)
    
    def _acquire_lock(self) -> bool:
        """Acquire update lock to prevent concurrent operations."""
        try:
            if self.lock_file.exists():
                # Check if lock is stale (older than 1 hour)
                lock_age = time.time() - self.lock_file.stat().st_mtime
                if lock_age > 3600:
                    logger.warning(f"Removing stale lock file (age: {lock_age:.0f}s)")
                    self.lock_file.unlink()
                else:
                    return False
            
            self.lock_file.write_text(str(int(time.time())))
            return True
        except Exception as e:
            logger.error(f"Failed to acquire lock: {e}")
            return False
    
    def _release_lock(self) -> None:
        """Release update lock."""
        try:
            if self.lock_file.exists():
                self.lock_file.unlink()
        except Exception as e:
            logger.warning(f"Failed to release lock: {e}")
    
    async def _run_git_command(
        self,
        command: list[str],
        cwd: Path,
        timeout: int = 300
    ) -> tuple[int, str, str]:
        """
        Run git command and return exit code, stdout, stderr.
        
        Args:
            command: Git command as list (e.g., ["git", "pull"])
            cwd: Working directory for command
            timeout: Command timeout in seconds
        
        Returns:
            Tuple of (exit_code, stdout, stderr)
        """
        import os
        
        # Get environment variables, ensuring GIT_SSH_COMMAND is passed through
        env = os.environ.copy()
        git_ssh_command = env.get("GIT_SSH_COMMAND", "")
        if git_ssh_command:
            logger.debug(f"Using GIT_SSH_COMMAND: {git_ssh_command}")
        
        try:
            process = await asyncio.wait_for(
                asyncio.create_subprocess_exec(
                    *command,
                    cwd=str(cwd),
                    env=env,  # Explicitly pass environment
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                ),
                timeout=timeout
            )
            stdout, stderr = await process.communicate()
            return (
                process.returncode,
                stdout.decode("utf-8", errors="ignore"),
                stderr.decode("utf-8", errors="ignore")
            )
        except asyncio.TimeoutError:
            logger.error(f"Git command timed out: {' '.join(command)}")
            return (1, "", "Command timed out")
        except Exception as e:
            logger.error(f"Failed to run git command: {e}")
            return (1, "", str(e))
    
    async def _get_latest_commit_hash(self) -> Optional[str]:
        """Get latest commit hash from GitHub repository."""
        try:
            # Use git ls-remote to get latest commit without cloning
            command = [
                "git",
                "ls-remote",
                self.repo_url,
                f"refs/heads/{self.branch}"
            ]
            
            exit_code, stdout, stderr = await self._run_git_command(
                command,
                cwd=Path("/tmp"),  # Any directory works for ls-remote
                timeout=30
            )
            
            if exit_code == 0 and stdout:
                # Output format: "hash\trefs/heads/branch"
                parts = stdout.strip().split()
                if parts:
                    return parts[0]
            else:
                logger.warning(f"Failed to get latest commit: {stderr}")
        except Exception as e:
            logger.error(f"Error getting latest commit hash: {e}")
        
        return None
    
    async def _clone_or_update_staging(self) -> bool:
        """
        Clone repository to staging or update if exists.
        
        Returns:
            True if successful, False otherwise
        """
        try:
            # Check if staging directory exists and is a valid git repository
            is_valid_git_repo = False
            if self.staging_dir.exists():
                git_dir = self.staging_dir / ".git"
                if git_dir.exists() and git_dir.is_dir():
                    # Verify it's actually a git repo by checking for HEAD or config
                    if (git_dir / "HEAD").exists() or (git_dir / "config").exists():
                        is_valid_git_repo = True
                        self._log("Staging directory exists and is a valid git repository")
                    else:
                        logger.warning("Staging directory exists but .git is invalid, will clone fresh")
                else:
                    logger.warning("Staging directory exists but is not a git repository, will clone fresh")
            
            if is_valid_git_repo:
                # Update existing staging directory
                self._log("Updating staging directory...")
                
                # First, fetch all branches to ensure we have the latest refs
                # This is important when switching branches
                # Use explicit refspec to ensure all remote refs are updated
                exit_code, stdout, stderr = await self._run_git_command(
                    ["git", "fetch", "origin", "+refs/heads/*:refs/remotes/origin/*", "--prune"],
                    cwd=self.staging_dir,
                    timeout=120
                )
                
                if exit_code != 0:
                    logger.warning(f"Git fetch all failed: {stderr}, trying specific branch...")
                    # Fallback to simple fetch
                    exit_code, stdout, stderr = await self._run_git_command(
                        ["git", "fetch", "origin", "--prune"],
                        cwd=self.staging_dir,
                        timeout=120
                    )
                
                # Also fetch the specific branch to ensure it's up to date
                exit_code, stdout, stderr = await self._run_git_command(
                    ["git", "fetch", "origin", self.branch],
                    cwd=self.staging_dir,
                    timeout=120
                )
                
                if exit_code != 0:
                    logger.error(f"Git fetch failed: {stderr}")
                    # If fetch fails, try cloning fresh (clear contents, not directory)
                    logger.info("Attempting to clone fresh due to fetch failure...")
                    is_valid_git_repo = False
                    # Clear contents will be handled below
                
                if is_valid_git_repo:
                    # Check if the branch exists in remote
                    exit_code, stdout, stderr = await self._run_git_command(
                        ["git", "ls-remote", "--heads", "origin", self.branch],
                        cwd=self.staging_dir,
                        timeout=30
                    )
                    
                    if exit_code != 0 or not stdout.strip():
                        logger.error(f"Branch {self.branch} not found in remote repository")
                        return False
                    
                    # Reset to latest commit
                    exit_code, stdout, stderr = await self._run_git_command(
                        ["git", "reset", "--hard", f"origin/{self.branch}"],
                        cwd=self.staging_dir,
                        timeout=60
                    )
                    
                    if exit_code != 0:
                        logger.error(f"Git reset failed: {stderr}")
                        # If reset fails, the branch might have changed - reinitialize
                        logger.info("Reset failed, branch may have changed. Reinitializing staging...")
                        is_valid_git_repo = False
                        # Will fall through to fresh clone
                    else:
                        # Verify the reset worked by checking HEAD matches the remote
                        verify_exit_code, verify_stdout, verify_stderr = await self._run_git_command(
                            ["git", "rev-parse", "HEAD"],
                            cwd=self.staging_dir,
                            timeout=10
                        )
                        if verify_exit_code == 0:
                            head_commit = verify_stdout.strip()
                            # Get the expected commit from remote
                            remote_exit_code, remote_stdout, remote_stderr = await self._run_git_command(
                                ["git", "rev-parse", f"origin/{self.branch}"],
                                cwd=self.staging_dir,
                                timeout=10
                            )
                            if remote_exit_code == 0:
                                remote_commit = remote_stdout.strip()
                                if head_commit == remote_commit:
                                    # Successfully updated and verified
                                    self._log(f"Staging reset to {head_commit[:8]}")
                                    return True
                                else:
                                    logger.warning(f"Reset verification failed: HEAD={head_commit[:8]}, expected={remote_commit[:8]}")
                                    # Try checkout instead
                                    logger.info("Attempting checkout instead...")
                                    checkout_exit_code, checkout_stdout, checkout_stderr = await self._run_git_command(
                                        ["git", "checkout", "-f", f"origin/{self.branch}"],
                                        cwd=self.staging_dir,
                                        timeout=60
                                    )
                                    if checkout_exit_code == 0:
                                        self._log("Staging updated via checkout")
                                        return True
                                    else:
                                        logger.error(f"Checkout also failed: {checkout_stderr}")
                                        is_valid_git_repo = False
                            else:
                                logger.warning(f"Could not verify remote commit: {remote_stderr}")
                                # Assume it worked
                                return True
                        else:
                            logger.warning(f"Could not verify HEAD: {verify_stderr}")
                            # Assume it worked
                            return True
            
            # Clone fresh (either doesn't exist or is invalid)
            # Note: We can't create/delete directories in /opt/, so we work with existing directory
            if not self.staging_dir.exists():
                import os
                import pwd
                try:
                    username = pwd.getpwuid(os.getuid()).pw_name
                except Exception:
                    username = "service_user"
                logger.error(f"Staging directory {self.staging_dir} does not exist")
                logger.error(f"Please create it manually: sudo mkdir -p {self.staging_dir}")
                logger.error(f"Then set ownership: sudo chown -R {username}:{username} {self.staging_dir}")
                return False
            
            # Staging directory exists - remove contents instead of directory itself
            # (we can't delete the directory in /opt/, but we can remove its contents)
            self._log("Clearing staging directory contents for fresh clone...")
            import shutil
            import os
            import stat
            
            # Try to fix permissions and remove contents
            try:
                current_uid = os.getuid()
                current_gid = os.getgid()
                
                # Change ownership of directory itself
                try:
                    os.chown(self.staging_dir, current_uid, current_gid)
                    os.chmod(self.staging_dir, stat.S_IRWXU | stat.S_IRGRP | stat.S_IXGRP | stat.S_IROTH | stat.S_IXOTH)
                except (OSError, PermissionError):
                    pass
                
                # Remove all contents
                for item in self.staging_dir.iterdir():
                    try:
                        if item.is_dir():
                            shutil.rmtree(item)
                        else:
                            item.unlink()
                    except (PermissionError, OSError) as e:
                        # Try to fix permissions first
                        try:
                            if item.is_dir():
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
                            logger.warning(f"Could not remove {item}, will try to clone over it")
            except Exception as e:
                logger.warning(f"Could not clear staging directory contents: {e}")
                # Continue anyway - git clone might work if directory is empty enough
            
            self._log("Cloning repository to staging...")
            # Since we can't create/delete directories in /opt/, we use git init + fetch
            # instead of git clone, working within the existing staging directory
            
            # Clear existing staging directory contents
            try:
                for item in self.staging_dir.iterdir():
                    try:
                        if item.is_dir():
                            shutil.rmtree(item)
                        else:
                            item.unlink()
                    except Exception as e:
                        logger.warning(f"Could not remove {item}: {e}")
            except Exception as e:
                logger.warning(f"Could not clear staging directory: {e}")
            
            # Initialize git repository in staging directory
            exit_code, stdout, stderr = await self._run_git_command(
                ["git", "init"],
                cwd=self.staging_dir,
                timeout=30
            )
            
            if exit_code != 0:
                logger.error(f"Git init failed: {stderr}")
                return False
            
            # Add remote
            exit_code, stdout, stderr = await self._run_git_command(
                ["git", "remote", "add", "origin", self.repo_url],
                cwd=self.staging_dir,
                timeout=10
            )
            
            # If remote already exists, set URL instead
            if exit_code != 0 and "already exists" in stderr.lower():
                exit_code, stdout, stderr = await self._run_git_command(
                    ["git", "remote", "set-url", "origin", self.repo_url],
                    cwd=self.staging_dir,
                    timeout=10
                )
            
            if exit_code != 0:
                logger.error(f"Failed to set remote: {stderr}")
                return False
            
            # Fetch and checkout
            exit_code, stdout, stderr = await self._run_git_command(
                ["git", "fetch", "origin", self.branch, "--depth", "1"],
                cwd=self.staging_dir,
                timeout=120
            )
            
            if exit_code != 0:
                logger.error(f"Git fetch failed: {stderr}")
                return False
            
            # Checkout the branch
            exit_code, stdout, stderr = await self._run_git_command(
                ["git", "checkout", "-f", f"origin/{self.branch}"],
                cwd=self.staging_dir,
                timeout=60
            )
            
            if exit_code != 0:
                logger.error(f"Git checkout failed: {stderr}")
                return False
            
            # Verify staging directory has the hardware/rpi_client structure
            hardware_dir = self.staging_dir / "hardware"
            if not hardware_dir.exists():
                logger.error("Staging directory missing hardware/ directory")
                return False
            
            self._log("Staging directory updated successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error cloning/updating staging: {e}", exc_info=True)
            return False
    
    async def _get_staging_version(self) -> Optional[str]:
        """Get commit hash from staging directory."""
        try:
            if not self.staging_dir.exists():
                return None
            
            exit_code, stdout, stderr = await self._run_git_command(
                ["git", "rev-parse", "HEAD"],
                cwd=self.staging_dir,
                timeout=10
            )
            
            if exit_code == 0 and stdout:
                return stdout.strip()
        except Exception as e:
            logger.error(f"Error getting staging version: {e}")
        
        return None
    
    async def check_for_updates(self) -> bool:
        """
        Check for updates and download if available.
        
        Returns:
            True if update is available and downloaded, False otherwise
        """
        # Check for interrupted states BEFORE acquiring lock
        # This allows us to clean up stale locks from interrupted operations
        current_state = self.get_current_state()
        
        # Handle interrupted checking/downloading states (power loss during update check/download)
        # These states indicate an interrupted operation, so we should remove the lock
        if current_state == UpdateState.CHECKING or current_state == UpdateState.DOWNLOADING:
            if self.lock_file.exists():
                lock_age = time.time() - self.lock_file.stat().st_mtime
                if lock_age > 60:  # Lock is older than 1 minute (definitely stale)
                    logger.info(f"Removing stale lock file from interrupted {current_state.value} state (age: {lock_age:.0f}s)")
                    try:
                        self.lock_file.unlink()
                    except Exception as e:
                        logger.warning(f"Failed to remove stale lock: {e}")
        
        # Now try to acquire lock
        if not self._acquire_lock():
            logger.debug("Update lock already held, skipping check")
            return False
        
        try:
            # Re-read state after acquiring lock (might have changed)
            current_state = self.get_current_state()
            
            # Handle interrupted states
            if current_state == UpdateState.APPLYING:
                logger.warning("Previous update was interrupted during application")
                # Clean up and reset to idle
                self._cleanup_staging()
                self.set_state(UpdateState.IDLE)
            
            # Handle interrupted checking/downloading states (power loss during update check/download)
            if current_state == UpdateState.CHECKING:
                logger.info("Previous update check was interrupted, resetting to idle")
                self.set_state(UpdateState.IDLE)
                current_state = UpdateState.IDLE
            
            if current_state == UpdateState.DOWNLOADING:
                logger.warning("Previous update download was interrupted, resetting to idle")
                # Staging might be in inconsistent state, but git operations are atomic
                # so it should be safe to continue. Reset state and retry.
                self.set_state(UpdateState.IDLE)
                current_state = UpdateState.IDLE
            
            if current_state == UpdateState.READY_TO_APPLY:
                logger.info("Update already staged, waiting for next boot")
                return True
            
            # Get current version
            current_version = self.get_current_version()
            if not current_version:
                # First run - get version from production directory
                if self.production_dir.exists():
                    exit_code, stdout, stderr = await self._run_git_command(
                        ["git", "rev-parse", "HEAD"],
                        cwd=self.production_dir,
                        timeout=10
                    )
                    if exit_code == 0 and stdout:
                        current_version = stdout.strip()
                        self.set_version(current_version)
                        self._log(f"Initialized version: {current_version}")
            
            # Get latest version from GitHub
            self.set_state(UpdateState.CHECKING)
            latest_version = await self._get_latest_commit_hash()
            
            if not latest_version:
                logger.warning("Failed to get latest version from GitHub")
                self.set_state(UpdateState.IDLE)
                return False
            
            # If state is failed, check if staging is valid and reset to idle
            if current_state == UpdateState.FAILED:
                staging_version = await self._get_staging_version()
                if staging_version and staging_version == latest_version:
                    logger.info("Staging is valid, resetting failed state to idle")
                    self.set_state(UpdateState.IDLE)
                    current_state = UpdateState.IDLE
                else:
                    logger.info("Staging is invalid or outdated, will attempt fresh download")
                    # Continue to download logic below
            
            # Compare versions
            if current_version == latest_version:
                logger.debug(f"Already up to date (version: {current_version[:8]})")
                self.set_state(UpdateState.IDLE)
                return False
            
            # Update available - download to staging
            logger.info(f"Update available: {current_version[:8] if current_version else 'unknown'} -> {latest_version[:8]}")
            self.set_state(UpdateState.DOWNLOADING)
            
            success = await self._clone_or_update_staging()
            
            if not success:
                logger.error("Failed to download update")
                self.set_state(UpdateState.FAILED)
                return False
            
            # Verify staging version matches expected
            staging_version = await self._get_staging_version()
            if staging_version != latest_version:
                logger.warning(f"Staging version mismatch: expected {latest_version[:8]}, got {staging_version[:8] if staging_version else 'none'}")
                # Force a complete fresh clone by clearing staging
                logger.info("Forcing fresh clone to fix staging version mismatch...")
                try:
                    # Clear staging directory contents completely
                    import shutil
                    for item in self.staging_dir.iterdir():
                        try:
                            if item.is_dir():
                                shutil.rmtree(item)
                            else:
                                item.unlink()
                        except Exception as e:
                            logger.warning(f"Could not remove {item}: {e}")
                    
                    # Now do a fresh clone
                    success_retry = await self._clone_or_update_staging()
                    if success_retry:
                        staging_version_retry = await self._get_staging_version()
                        if staging_version_retry == latest_version:
                            logger.info("Staging version fixed after fresh clone")
                        else:
                            logger.error(f"Staging version still mismatch after fresh clone: expected {latest_version[:8]}, got {staging_version_retry[:8] if staging_version_retry else 'none'}")
                            self.set_state(UpdateState.FAILED)
                            return False
                    else:
                        logger.error("Failed to do fresh clone")
                        self.set_state(UpdateState.FAILED)
                        return False
                except Exception as e:
                    logger.error(f"Error during fresh clone attempt: {e}", exc_info=True)
                    self.set_state(UpdateState.FAILED)
                    return False
            
            # Mark as ready to apply
            self.set_state(UpdateState.READY_TO_APPLY)
            self._log(f"Update staged successfully: {latest_version[:8]}")
            return True
            
        except Exception as e:
            logger.error(f"Error checking for updates: {e}", exc_info=True)
            self.set_state(UpdateState.FAILED)
            return False
        finally:
            self._release_lock()
    
    def _cleanup_staging(self) -> None:
        """Clean up staging directory on failure."""
        try:
            if self.staging_dir.exists():
                import shutil
                import os
                import stat
                
                # Try to fix permissions before removal
                try:
                    current_uid = os.getuid()
                    current_gid = os.getgid()
                    
                    # Change ownership recursively
                    for root, dirs, files in os.walk(self.staging_dir):
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
                    
                    os.chmod(self.staging_dir, stat.S_IRWXU | stat.S_IRGRP | stat.S_IXGRP | stat.S_IROTH | stat.S_IXOTH)
                except Exception:
                    pass  # Ignore permission fix errors during cleanup
                
                shutil.rmtree(self.staging_dir)
                self._log("Cleaned up staging directory")
        except PermissionError as e:
            logger.warning(f"Permission denied cleaning up staging directory: {e}")
            logger.warning(f"Please manually fix: sudo chown -R $(whoami):$(whoami) {self.staging_dir}")
        except Exception as e:
            logger.warning(f"Failed to cleanup staging: {e}")
    
    async def start(self) -> None:
        """Start the update daemon."""
        if self.is_running:
            logger.warning("Update daemon already running")
            return
        
        self.is_running = True
        self._log("Update daemon started")
        
        # Wait initial delay before first check
        await asyncio.sleep(self.initial_delay)
        
        # Start periodic checking
        self._check_task = asyncio.create_task(self._check_loop())
    
    async def stop(self) -> None:
        """Stop the update daemon."""
        self.is_running = False
        
        if self._check_task:
            self._check_task.cancel()
            try:
                await self._check_task
            except asyncio.CancelledError:
                pass
        
        self._log("Update daemon stopped")
    
    async def _check_loop(self) -> None:
        """Main loop for periodic update checks."""
        while self.is_running:
            try:
                await self.check_for_updates()
            except Exception as e:
                logger.error(f"Error in update check loop: {e}", exc_info=True)
            
            # Wait before next check
            await asyncio.sleep(self.check_interval)
    
    def is_update_ready(self) -> bool:
        """Check if update is ready to be applied."""
        return self.get_current_state() == UpdateState.READY_TO_APPLY


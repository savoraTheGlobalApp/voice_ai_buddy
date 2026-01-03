"""
Update daemon entry point.
Runs as a systemd service to check for updates in the background.
"""
import asyncio
import logging
import sys
from pathlib import Path

from .updater import UpdateManager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def main():
    """Main entry point for update daemon."""
    # Configuration paths
    PRODUCTION_DIR = Path("/opt/voice_ai_buddy")
    STAGING_DIR = Path("/opt/voice_ai_buddy_staging")
    STATE_DIR = Path("/var/lib/voice_ai_buddy")
    
    # Get repository URL from environment or use default
    import os
    repo_url = os.getenv("GITHUB_REPO_URL")
    if not repo_url:
        logger.error("GITHUB_REPO_URL environment variable not set")
        sys.exit(1)
    
    branch = os.getenv("GITHUB_BRANCH", "main")
    
    # Create update manager
    updater = UpdateManager(
        production_dir=PRODUCTION_DIR,
        staging_dir=STAGING_DIR,
        state_dir=STATE_DIR,
        repo_url=repo_url,
        branch=branch
    )
    
    try:
        # Start update daemon
        await updater.start()
        
        # Keep running
        while True:
            await asyncio.sleep(60)
            
    except KeyboardInterrupt:
        logger.info("Update daemon interrupted")
    except Exception as e:
        logger.error(f"Fatal error in update daemon: {e}", exc_info=True)
        sys.exit(1)
    finally:
        await updater.stop()


if __name__ == "__main__":
    asyncio.run(main())


# Migration Plan: Current System → Hybrid Robust System

## Migration Strategy

**Phase 1: Add New System Alongside Old (Safe)**
- Keep old `apply_update.py` as `apply_update_old.py` (backup)
- Add new orchestrator in separate location
- Add new update logic
- Test new system without breaking old one

**Phase 2: Gradual Migration**
- Update service to use new orchestrator
- Test thoroughly
- Keep old code as fallback

**Phase 3: Cleanup**
- Remove old code once new system is proven
- Update documentation

## Implementation Steps

### Step 1: Create Orchestrator Structure
```
/opt/voice_ai_buddy_orchestrator/
  ├── apply_update.py          # Main orchestrator (fixed)
  └── recovery.py              # Emergency recovery
```

### Step 2: Create Version Directory Structure
```
/opt/voice_ai_buddy_v1/        # Current production (migrated)
/opt/voice_ai_buddy_v2/        # New version (for updates)
/opt/voice_ai_buddy → symlink  # Points to active version
```

### Step 3: Move Shared Resources
```
/var/lib/voice_ai_buddy/
  ├── venv/                    # Move from hardware/venv
  ├── .env                     # Move from hardware/.env
  └── state files
```

### Step 4: Update Service Files
- Point to new orchestrator
- Update paths for shared resources

### Step 5: Migration Script
- Script to migrate from current to new structure
- Handles existing installations

## Rollback Plan

If new system has issues:
1. Service file still references old system (kept as backup)
2. Can switch back by changing service file
3. Old code still exists as `apply_update_old.py`


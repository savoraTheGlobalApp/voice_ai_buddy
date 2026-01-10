# Update System Architecture Analysis

## Current Architecture Problems

### Problem 1: Update Script Gets Updated
- `apply_update.py` is in `/opt/voice_ai_buddy/hardware/apply_update.py`
- When we update, we update the update script itself
- If new update script has bugs, we're stuck
- **Chicken-and-egg problem**: We need the update script to update the update script

### Problem 2: Preserved Files Get Overwritten
- We preserve `venv` and `.env` during clear
- But `_copy_directory_contents` removes them before copying from staging
- If power cuts during copy, preserved files are lost
- Recovery restores from backup, but backup might also be corrupted

### Problem 3: No Atomic Operations
- State file writes are not atomic (can be corrupted)
- Directory operations are not atomic
- Copy operations can be interrupted mid-way

### Problem 4: Production Directory Conflict
- We update the same directory we're running from
- If update script is running and gets updated, what happens?
- Race conditions possible

## Architecture Options

### Option 1: Separate Orchestration Script (RECOMMENDED)

**Structure:**
```
/opt/voice_ai_buddy_orchestrator/     # Fixed, never updated
  ├── apply_update.py                  # Minimal, robust orchestrator
  └── recovery.py                      # Emergency recovery logic

/opt/voice_ai_buddy/                   # Application (gets updated)
  ├── hardware/
  │   ├── rpi_client/
  │   └── ...
  └── ...

/opt/voice_ai_buddy_staging/           # Staging area
/var/lib/voice_ai_buddy/               # State files
```

**How It Works:**
1. **Orchestrator** (`/opt/voice_ai_buddy_orchestrator/apply_update.py`):
   - Fixed, minimal script (never updated)
   - Handles orchestration only
   - Calls update logic from production (if exists)
   - Has fallback to previous version's update logic
   - Handles all recovery scenarios

2. **Update Logic** (in production):
   - Actual update implementation
   - Gets updated with application
   - Orchestrator calls it, but has fallback

3. **Power Loss Handling:**
   - Orchestrator is always available (never updated)
   - Can always recover using orchestrator
   - Orchestrator validates everything before proceeding

**Advantages:**
- ✅ Always have a working orchestrator
- ✅ Can update update logic safely
- ✅ Clear separation of concerns
- ✅ Orchestrator can validate before using new update logic

**Disadvantages:**
- ⚠️ Need to install orchestrator separately
- ⚠️ Slightly more complex setup

---

### Option 2: Two-Directory Swap with Symlinks

**Structure:**
```
/opt/voice_ai_buddy -> symlink to /opt/voice_ai_buddy_v1 (or v2)

/opt/voice_ai_buddy_v1/                # Version 1 (active)
/opt/voice_ai_buddy_v2/                # Version 2 (inactive, being updated)
/opt/voice_ai_buddy_staging/           # Staging area
```

**How It Works:**
1. Current production: `/opt/voice_ai_buddy` → `/opt/voice_ai_buddy_v1`
2. Update process:
   - Copy staging to `/opt/voice_ai_buddy_v2`
   - Validate v2
   - Atomic swap: `ln -sf /opt/voice_ai_buddy_v2 /opt/voice_ai_buddy`
   - If fails, swap back: `ln -sf /opt/voice_ai_buddy_v1 /opt/voice_ai_buddy`

3. **Power Loss Handling:**
   - Symlink swap is atomic (single operation)
   - Either old or new version is active, never corrupted
   - Can detect which version is active and validate

**Advantages:**
- ✅ True atomic updates (symlink swap is atomic)
- ✅ Can rollback instantly (just change symlink)
- ✅ No corruption possible (old version always intact)
- ✅ Can keep multiple versions

**Disadvantages:**
- ⚠️ Requires more disk space (2 full copies)
- ⚠️ More complex directory management
- ⚠️ Need to handle venv and .env separately

---

### Option 3: Hybrid Approach (BEST)

**Structure:**
```
/opt/voice_ai_buddy_orchestrator/      # Fixed orchestrator
  └── apply_update.py

/opt/voice_ai_buddy -> symlink to /opt/voice_ai_buddy_v1

/opt/voice_ai_buddy_v1/                # Version 1
/opt/voice_ai_buddy_v2/                # Version 2
/opt/voice_ai_buddy_staging/           # Staging
/var/lib/voice_ai_buddy/               # State (includes venv and .env)
  ├── venv/                            # Shared venv (not versioned)
  ├── .env                             # Shared .env (not versioned)
  └── ...
```

**How It Works:**
1. **Orchestrator** (fixed, never updated):
   - Handles all orchestration
   - Manages symlink swaps
   - Validates versions
   - Handles recovery

2. **Version Directories**:
   - Only application code (no venv, no .env)
   - Symlink points to active version
   - Old version kept for rollback

3. **Shared Resources**:
   - `venv` in `/var/lib/voice_ai_buddy/venv` (shared, updated in place)
   - `.env` in `/var/lib/voice_ai_buddy/.env` (shared, never overwritten)
   - Application code references these via environment or config

4. **Update Process:**
   ```
   1. Orchestrator validates staging
   2. Copy staging to v2 (excluding venv, .env)
   3. Validate v2
   4. Update venv if needed (in shared location)
   5. Atomic swap: ln -sf v2 /opt/voice_ai_buddy
   6. If fails, swap back to v1
   ```

**Advantages:**
- ✅ Best of both worlds
- ✅ Atomic updates (symlink swap)
- ✅ Always have working orchestrator
- ✅ Shared venv and .env (no duplication)
- ✅ Can rollback instantly
- ✅ No corruption possible

**Disadvantages:**
- ⚠️ Most complex to implement
- ⚠️ Need to modify application to use shared venv

---

## Recommended Strategy: Option 3 (Hybrid)

### Detailed Flow

#### Normal Update Flow:
```
1. Update daemon downloads to staging
2. On boot, orchestrator runs:
   a. Check state (ready_to_apply?)
   b. Validate staging
   c. Copy staging → v2 (exclude venv, .env)
   d. Validate v2 (git repo, structure, etc.)
   e. Update shared venv (if requirements.txt changed)
   f. Atomic swap: ln -sf v2 /opt/voice_ai_buddy
   g. Set state to "completed"
   h. Clean up old v1 (optional, keep for rollback)
```

#### Power Loss Scenarios:

**Scenario A: Power loss during copy (staging → v2)**
- v1 still active (symlink unchanged)
- On recovery:
  - Detect incomplete v2
  - Remove v2
  - Set state to "idle"
  - Retry on next boot

**Scenario B: Power loss during venv update**
- v1 still active
- v2 exists but venv might be partially updated
- On recovery:
  - Validate v2
  - Recreate venv if corrupted
  - Complete update or rollback

**Scenario C: Power loss during symlink swap**
- Symlink swap is atomic (single operation)
- Either v1 or v2 is active, never corrupted
- On recovery:
  - Check which version is active
  - Validate it
  - If invalid, swap to other version

**Scenario D: Power loss after swap, before state update**
- v2 is active (symlink points to it)
- State still says "applying"
- On recovery:
  - Detect v2 is active
  - Validate v2
  - If valid, set state to "completed"
  - If invalid, swap back to v1, set state to "failed"

### Key Safety Features:

1. **Atomic Operations:**
   - Symlink swap is atomic (single `ln -sf` command)
   - State file writes: write to temp, then rename (atomic)
   - No partial states possible

2. **Validation at Every Step:**
   - Validate staging before copying
   - Validate v2 after copying
   - Validate active version on recovery
   - Validate backup before restoring

3. **Preserved Resources:**
   - venv in shared location (never overwritten during copy)
   - .env in shared location (never overwritten)
   - Application code in version directories (can be swapped)

4. **Rollback Strategy:**
   - Keep previous version (v1) until new version (v2) is validated
   - Can instantly rollback by changing symlink
   - No data loss (old version intact)

5. **Orchestrator Safety:**
   - Fixed location, never updated
   - Can always recover
   - Has fallback logic for all scenarios

### How to Ensure Production Has Correct Code:

1. **Validation Chain:**
   ```
   Staging → Validate → Copy to v2 → Validate v2 → Swap → Validate active
   ```

2. **Checks at Each Stage:**
   - Staging: Git repo valid? Structure correct? Files present?
   - v2: Same checks after copy
   - Active: Same checks after swap
   - Recovery: Validate active version, swap if invalid

3. **Version Tracking:**
   - Store version in `/var/lib/voice_ai_buddy/current_version.txt`
   - Verify version matches after swap
   - Can compare with staging version

4. **Conflict Prevention:**
   - Update script in orchestrator (never changes)
   - Application code in version directories (swapped atomically)
   - No race conditions (symlink swap is atomic)

### Implementation Considerations:

1. **Application Code Changes:**
   - Need to reference shared venv: `/var/lib/voice_ai_buddy/venv`
   - Need to reference shared .env: `/var/lib/voice_ai_buddy/.env`
   - Or use environment variables

2. **Service File Changes:**
   ```ini
   ExecStartPre=/usr/bin/python3 /opt/voice_ai_buddy_orchestrator/apply_update.py
   ExecStart=/var/lib/voice_ai_buddy/venv/bin/python -m rpi_client.main
   ```

3. **Migration Path:**
   - Can implement gradually
   - Start with orchestrator
   - Move to symlink-based updates
   - Keep old system as fallback

## Comparison Table

| Feature | Current | Option 1 | Option 2 | Option 3 (Hybrid) |
|---------|---------|----------|----------|-------------------|
| Atomic Updates | ❌ | ⚠️ Partial | ✅ Yes | ✅ Yes |
| Power Loss Safe | ⚠️ Partial | ⚠️ Partial | ✅ Yes | ✅ Yes |
| Rollback Speed | ⚠️ Slow | ⚠️ Slow | ✅ Instant | ✅ Instant |
| Update Script Safety | ❌ No | ✅ Yes | ⚠️ Partial | ✅ Yes |
| Complexity | Low | Medium | Medium | High |
| Disk Space | Low | Low | High | Medium |
| Robustness | ⚠️ Medium | ✅ High | ✅ High | ✅✅ Highest |

## Recommendation

**Implement Option 3 (Hybrid Approach)** because:
1. ✅ Maximum robustness (atomic operations, validation, recovery)
2. ✅ No corruption possible (old version always intact)
3. ✅ Instant rollback (symlink swap)
4. ✅ Always have working orchestrator
5. ✅ Handles all power loss scenarios gracefully
6. ✅ Production always has correct code (validated at every step)

The complexity is worth it for a production system that needs to be super robust.


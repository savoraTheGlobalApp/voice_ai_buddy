# Super Robust Update Strategy - Detailed Explanation

## Your Questions Answered

### Q1: How exactly would this handle power cuts properly?

**Current Approach (Problems):**
- Updates same directory we're running from
- Copy operations can be interrupted
- Preserved files get overwritten
- No atomic operations

**Robust Approach (Solution):**

#### Power Loss During Copy:
```
Current: Copy staging → production (interruptible, corrupts production)
Robust:  Copy staging → v2 (production untouched, v2 can be deleted if corrupted)
```

#### Power Loss During Swap:
```
Current: N/A (no swap mechanism)
Robust:  Symlink swap is atomic (single operation, either succeeds or fails, never partial)
```

#### Power Loss After Swap:
```
Current: Production might be corrupted, state might be wrong
Robust:  Active version is validated, if invalid, swap back to previous version
```

**Key Insight:** By using version directories and symlinks:
- Old version (v1) is **never touched** during update
- New version (v2) is built separately
- Swap is **atomic** (single operation)
- If anything goes wrong, we just point symlink back to v1

---

### Q2: Should we have a script outside application directories?

**YES - This is critical!**

**Problem with Current Approach:**
```
/opt/voice_ai_buddy/hardware/apply_update.py  ← Gets updated!
```

If we update `apply_update.py` and it has bugs, we're stuck.

**Solution: Separate Orchestrator**
```
/opt/voice_ai_buddy_orchestrator/apply_update.py  ← NEVER updated, always works
```

**How It Works:**
1. **Orchestrator** (fixed, minimal):
   - Lives outside application directory
   - Never gets updated
   - Handles orchestration only
   - Has emergency recovery logic
   - Always available for recovery

2. **Update Logic** (in application):
   - Can be updated
   - Orchestrator calls it
   - If new version fails, orchestrator has fallback

3. **Recovery:**
   - Orchestrator is always there
   - Can recover even if application is completely corrupted
   - Can restore from backup, staging, or previous version

**Example Orchestrator Structure:**
```python
# /opt/voice_ai_buddy_orchestrator/apply_update.py
def main():
    # 1. Check state
    state = read_state()
    
    # 2. Handle recovery if needed
    if state == "applying":
        recover_from_interruption()
    
    # 3. If update ready, apply it
    if state == "ready_to_apply":
        # Try new update logic from production
        try:
            import sys
            sys.path.insert(0, "/opt/voice_ai_buddy/hardware")
            from apply_update_logic import apply_update
            apply_update()  # New version
        except:
            # Fallback to previous version's logic
            apply_update_fallback()  # Old version
```

---

### Q3: How are we assured production has the correct update code?

**Multi-Layer Validation:**

#### Layer 1: Staging Validation
```python
# Before copying, validate staging:
- Is it a valid git repository?
- Does it have .git directory with content?
- Does it have hardware/rpi_client/?
- Does it have requirements.txt?
- Can we get commit hash?
```

#### Layer 2: Version Validation (After Copy)
```python
# After copying to v2, validate:
- Is v2 a valid git repository?
- Does git log work?
- Does commit hash match expected?
- Does structure match expected?
- Can we import rpi_client?
```

#### Layer 3: Active Version Validation (After Swap)
```python
# After swapping, validate active:
- Is symlink pointing to valid directory?
- Is that directory valid?
- Can we run the application?
- Does version match expected?
```

#### Layer 4: Recovery Validation
```python
# On recovery, validate:
- Which version is active?
- Is it valid?
- If not, swap to other version
- Validate that version
```

**Validation Chain:**
```
Staging → [Validate] → v2 → [Validate] → Swap → [Validate Active] → Done
         ❌ Fail?          ❌ Fail?          ❌ Fail?
         Skip update       Remove v2         Swap back to v1
```

**Version Tracking:**
```python
# Store expected version
expected_version = get_staging_version()

# After swap, verify
actual_version = get_active_version()
if actual_version != expected_version:
    # Something went wrong, rollback
    swap_back_to_v1()
```

---

### Q4: Will updating production directory cause conflicts?

**Current Approach (YES, conflicts possible):**
```
/opt/voice_ai_buddy/  ← We update this while running from it
```

**Problems:**
- Update script updates itself
- Application code updates while running
- Race conditions possible
- Can't rollback easily

**Robust Approach (NO conflicts):**

#### Using Version Directories:
```
/opt/voice_ai_buddy → symlink to /opt/voice_ai_buddy_v1

Update process:
1. Copy staging → /opt/voice_ai_buddy_v2  (new directory, no conflict)
2. Validate v2
3. Atomic swap: ln -sf /opt/voice_ai_buddy_v2 /opt/voice_ai_buddy
4. Application now runs from v2
5. v1 still exists (for rollback)
```

**Why No Conflicts:**
1. **Separate Directories:**
   - v1 and v2 are completely separate
   - Updating v2 doesn't affect v1
   - Application runs from symlink (points to v1 or v2)

2. **Atomic Swap:**
   - Symlink change is atomic (single operation)
   - Either points to v1 or v2, never both
   - No race conditions

3. **Orchestrator Safety:**
   - Orchestrator is in separate location
   - Never conflicts with application updates
   - Always available

4. **Rollback:**
   - If v2 has issues, just change symlink back to v1
   - v1 is untouched, always works
   - Instant rollback

---

## Complete Robust Flow

### Normal Update:
```
1. Update daemon downloads to staging
2. Sets state to "ready_to_apply"
3. On boot, orchestrator runs:
   a. Read state: "ready_to_apply"
   b. Validate staging (git repo, structure, files)
   c. Set state to "applying" (atomic write)
   d. Copy staging → v2 (excluding venv, .env)
   e. Validate v2 (git repo, structure, version)
   f. Update shared venv (if needed)
   g. Atomic swap: ln -sf v2 /opt/voice_ai_buddy
   h. Validate active version
   i. Set state to "completed" (atomic write)
   j. Clean up old v1 (optional)
```

### Power Loss Scenarios:

#### Scenario 1: Power loss during copy (staging → v2)
```
State: "applying"
v1: Active (untouched)
v2: Incomplete/corrupted

Recovery:
1. Detect state = "applying"
2. Check v2: Invalid
3. Remove v2
4. Set state to "idle"
5. v1 still active, application works
6. Retry update on next boot
```

#### Scenario 2: Power loss during venv update
```
State: "applying"
v1: Active
v2: Complete but venv might be corrupted

Recovery:
1. Detect state = "applying"
2. Validate v2: Valid structure
3. Check venv: Corrupted?
4. Recreate venv if needed
5. Complete update or rollback
```

#### Scenario 3: Power loss during symlink swap
```
State: "applying"
Symlink: Either v1 or v2 (atomic operation)

Recovery:
1. Detect state = "applying"
2. Check which version is active
3. Validate active version
4. If valid: Set state to "completed"
5. If invalid: Swap to other version, set state to "failed"
```

#### Scenario 4: Power loss after swap, before state update
```
State: "applying" (stale)
Symlink: Points to v2
v2: Complete and valid

Recovery:
1. Detect state = "applying"
2. Check active version: v2
3. Validate v2: Valid
4. Set state to "completed"
5. Done
```

---

## Key Safety Mechanisms

### 1. Atomic Operations
- **Symlink swap:** Single `ln -sf` command (atomic)
- **State writes:** Write to temp file, then rename (atomic)
- **No partial states:** Either old or new, never corrupted

### 2. Validation at Every Step
- **Before copy:** Validate staging
- **After copy:** Validate v2
- **After swap:** Validate active
- **On recovery:** Validate everything

### 3. Preserved Resources
- **venv:** In `/var/lib/voice_ai_buddy/venv` (shared, not versioned)
- **.env:** In `/var/lib/voice_ai_buddy/.env` (shared, never overwritten)
- **Application code:** In version directories (can be swapped)

### 4. Rollback Strategy
- **Keep previous version:** v1 stays until v2 is validated
- **Instant rollback:** Just change symlink
- **No data loss:** Old version always intact

### 5. Orchestrator Safety
- **Fixed location:** Never updated
- **Always available:** Can always recover
- **Fallback logic:** Handles all scenarios

---

## Implementation Steps

### Phase 1: Add Orchestrator
1. Create `/opt/voice_ai_buddy_orchestrator/`
2. Move core orchestration logic there
3. Keep update logic in application (can be updated)
4. Orchestrator calls update logic with fallback

### Phase 2: Add Version Directories
1. Create v1, v2 directories
2. Move current production to v1
3. Create symlink: `/opt/voice_ai_buddy` → `v1`
4. Update copy logic to use v2

### Phase 3: Add Symlink Swap
1. Implement atomic swap logic
2. Add validation after swap
3. Add rollback mechanism
4. Test all power loss scenarios

### Phase 4: Move Shared Resources
1. Move venv to `/var/lib/voice_ai_buddy/venv`
2. Move .env to `/var/lib/voice_ai_buddy/.env`
3. Update application to reference these
4. Update service files

---

## Why This Is Super Robust

1. **No Single Point of Failure:**
   - Orchestrator always works (never updated)
   - Previous version always available (for rollback)
   - Shared resources preserved (venv, .env)

2. **Atomic Operations:**
   - Symlink swap is atomic
   - State writes are atomic
   - No partial states possible

3. **Comprehensive Validation:**
   - Validate at every step
   - Validate on recovery
   - Multiple fallback options

4. **Instant Recovery:**
   - Can rollback instantly (symlink swap)
   - Can recover from any state
   - Previous version always intact

5. **Handles All Scenarios:**
   - Power loss during copy
   - Power loss during swap
   - Power loss after swap
   - Corrupted updates
   - Invalid staging
   - Network failures

This architecture ensures **maximum robustness** for a production system.


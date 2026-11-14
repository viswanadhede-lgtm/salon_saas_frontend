# Git Snapshot & Restore Cheat Sheet: `v1.0-modules-locked`

This cheat sheet explains how to upload, protect, and restore your verified codebase at any time, anywhere in the world.

---

## 1. Upload Save Point to Cloud (Run this once)

Uploads the `v1.0-modules-locked` snapshot to GitHub/GitLab so it is backed up in the cloud forever:

```bash
git push origin v1.0-modules-locked
```

---

## 2. Restore on Current Computer (Emergency Rewind)

If you made changes, installed conflicting packages, or broke code, and want to **wipe the mess and rewind 100% of files back to this verified state**:

```bash
git reset --hard v1.0-modules-locked
```

> **What it does:** Replaces all project files instantly with the exact files from the verified v1.0 snapshot.

---

## 3. Restore on ANY New Computer / Laptop (Anywhere in the World)

If you are on a new machine, a teammate's computer, or your laptop crashed:

```bash
# Step 1: Clone your repository
git clone <your-repository-url>

# Step 2: Navigate into the project folder
cd salon-saas-frontend

# Step 3: Jump directly to the verified snapshot
git checkout v1.0-modules-locked
```

---

## 4. Useful Inspection Commands

### Check what changed since the lock without breaking anything:
```bash
git diff v1.0-modules-locked
```

### Check if a specific file was modified since the lock:
```bash
git diff v1.0-modules-locked -- scripts/global-payment-modal/gpm-discounts.js
```

### Restore just ONE file back to the locked state:
```bash
git checkout v1.0-modules-locked -- path/to/messed-up-file.js
```


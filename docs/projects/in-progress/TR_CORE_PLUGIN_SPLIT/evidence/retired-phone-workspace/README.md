# Retired host-owned phone draft

Preserved by Codex on 2026-10-12 from the untracked `frontend/src/components/plugins/workspace/phone` draft. These files are evidence, not executable or accepted implementation.

The draft marked a call connected after `logCall` without placing a call, held/muted only local UI state, swallowed service errors and invented default connection/extension values. It also put phone implementation into the generic Total Recall host. Keeping it mounted or shipping it as a workspace would falsely imply a working phone.

The actual extracted dialer belongs to the Phone plugin's `bricks/phone-dialer`, with the original session hook and source provenance. Finish the owner integration and safe host audio capability before declaring Hello Phone ready. The generic host now resolves workspace declarations to owner UI elements and explicitly reports missing interfaces/device support.

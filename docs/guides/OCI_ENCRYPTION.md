# OCI Block Volume Encryption for Total Recall

Total Recall requires a Sovereign Virtual File System (VFS) to function securely. When deploying to Oracle Cloud Infrastructure (OCI) Ampere A1 instances, you must ensure the block volume is fully encrypted at rest using a Customer Managed Key (CMK) via the OCI Vault.

## Configuration Steps

### 1. Create a Master Encryption Key (MEK)
1. Navigate to **Identity & Security** -> **Vault** in the OCI Console.
2. Create a new Vault (or use an existing one).
3. Inside the Vault, click **Master Encryption Keys** -> **Create Key**.
4. Name it `TotalRecall-VFS-Key` and choose the AES-256 algorithm.

### 2. Attach Key to the Compute Instance
1. When provisioning your Ampere A1 Compute Instance (with >=24GB RAM), scroll down to the **Boot Volume** section.
2. Check the box for **Encrypt this volume with a key that you manage**.
3. Select the Vault and the `TotalRecall-VFS-Key` created in Step 1.
4. Complete the instance provisioning.

### 3. Verify Encryption from the OS Daemon
Once the instance is running and the `.agent/` directory is scaffolded, the data is encrypted at the block level natively by OCI. No application-level filesystem encryption is needed for the VFS files themselves, preserving Gemma 4's zero-parser semantic access speed while maintaining strict physical security.

### 4. Handling `secrets.enc`
Even with block-volume encryption, Total Recall uses an application-level `secrets.enc` file secured by Argon2id and AES-256-GCM (see `src/core/crypto.mjs`). This ensures that even if a snapshot of the block volume is taken, the third-party API keys and session secrets cannot be extracted without the master password.

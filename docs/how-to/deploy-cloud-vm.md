# How to Deploy on a Cloud VM

- **Plane**: How-To
- **Last Updated**: 2026-05-12
- **Summary**: A step-by-step guide to deploying the Total Recall Sovereign OS on a cloud provider like Oracle Cloud for free.

---

## Why a Cloud VM?
Total Recall 3.0 acts as a 24/7 Sovereign Operating System. While you can run it perfectly fine locally on your Mac or PC, deploying it to a dedicated Cloud VM provides several major benefits:
- **Always-on Daemon**: The background Dream Cycle and task scheduler can run uninterrupted 24/7.
- **Offloaded Compute**: Running a 26B parameter model requires ~16GB of RAM. A dedicated VM ensures your primary workstation isn't bogged down during inference.
- **Accessible Anywhere**: The web dashboard will be securely accessible from your phone or laptop anywhere in the world.

## The Ideal Host: Oracle Cloud "Always Free" Tier
The PRD for Total Recall 3.0 was designed specifically around the **Oracle Cloud Infrastructure (OCI) Always Free Tier**. Oracle provides a generous Ampere A1 Compute instance (ARM64) that allows you to configure up to **4 OCPUs and 24GB of RAM for absolutely free**. This is more than enough memory to run the Gemma 2 27B kernel locally on the box.

*Note: You can use AWS, Google Cloud, DigitalOcean, or Hetzner, but you will typically have to pay for a 16GB+ RAM instance.*

---

## Step 1: Spin up the VM

**If using Oracle Cloud:**
1. Log into your OCI Dashboard and click **Create Instance**.
2. Under "Image and Shape", select the **Ampere (ARM) Shape** (`VM.Standard.A1.Flex`).
3. Slide the OCPU count to **4** and the Memory to **24GB**. (Ensure it says "Always Free Eligible").
4. Add your SSH keys and provision the instance.

**For any other provider:**
1. Create an Ubuntu 24.04 or Debian 12 instance.
2. Ensure the instance has at least **16GB of RAM** (or 8GB if you plan to use `npx total-recall upgrade` to swap to a smaller model, or plan to use the Frontier API mode).

---

## Step 2: Install Node.js
SSH into your newly provisioned machine:
```bash
ssh ubuntu@<your-server-ip>
```

Install Node.js (v20+ is required). We recommend using `nvm`:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
```

---

## Step 3: Run the Deploy Pipeline
The Total Recall CLI automatically handles installing Ollama, downloading models, configuring Caddy for secure HTTPS, and installing the required systemd background daemons.

Run the deploy command. If you have a custom domain pointing to your server's IP, provide it here. Otherwise, you can skip the domain flag to default to `localhost`.

```bash
npx total-recall deploy --domain my-sovereign-brain.com
```

**What this script does automatically:**
1. Detects your CPU architecture (e.g., `aarch64` for Oracle Ampere).
2. Installs Ollama natively.
3. Pulls `gemma2:27b` and attempts to pull `kokoro:82m`.
4. Scaffolds the `~/.agent/` virtual file system.
5. Installs and configures the Caddy web server.
6. Writes and enables Linux `systemd` processes to keep the HTTP server and Dream Daemon alive forever.

---

## Step 4: Login and Authenticate
Once the deployment finishes:
1. Navigate to your domain (or IP) in a web browser.
2. Check your `~/.agent/config/secrets.enc` or the deploy log for the initial admin password.
3. Login to access the full **Omnichannel Dashboard** (Chat, Sandbox, VFS Explorer).

If you prefer terminal-based access, simply SSH into the box and run:
```bash
npx total-recall chat
```

---

## Troubleshooting

### Error: "Out of capacity for shape VM.Standard.A1.Flex"
The Ampere 24GB free instances are in extremely high demand and Oracle data centers frequently run out of physical capacity. If you receive this error during creation, you have two options:

**1. Upgrade to Pay-As-You-Go (Recommended)**
Upgrading your account to PAYG bumps you to the priority queue. The 4 OCPU / 24GB instance **remains 100% free** (you are never charged as long as you stay within these limits), but Oracle requires a credit card to filter out crypto-mining bots.

**2. Use the Built-In Sniper Script**
Total Recall includes an auto-provisioning script that pings the Oracle API every 60 seconds to grab a server the moment one frees up. 

**Step 1: Install & Authenticate OCI CLI**
Because the sniper script talks directly to the Oracle servers, you must install the Oracle CLI and authenticate it to your account.
1. Open your Mac/Linux terminal and run: `brew install oci-cli`
2. Run the authentication wizard: `oci setup config`
3. The wizard will ask for several things:
   - **User OCID**: Found in the Oracle Dashboard (Top right profile icon -> My Profile -> Copy OCID).
   - **Tenancy OCID**: Found in the Oracle Dashboard (Top right profile icon -> Tenancy -> Copy OCID).
   - **Region**: Type your region (e.g., `us-phoenix-1`).
   - **Generate RSA key pair**: Type `Y`. Press Enter to accept the default paths.
4. **CRITICAL FINAL STEP**: The wizard generated a public API key on your computer. You must upload this to Oracle so your Mac is allowed to make requests.
   - Run `cat ~/.oci/oci_api_key_public.pem` in your terminal and copy the output.
   - Go to the Oracle Dashboard -> Top right profile icon -> My Profile -> API Keys -> Add API Key.
   - Select "Paste Public Keys", paste what you copied, and click Add.

**Step 2: Get Your Unique Oracle IDs (The Easy Way)**
Oracle requires specific IDs (OCIDs) to know where to build the server. The fastest way to get all of them at once is:
1. Go through the normal Oracle UI to create the instance (select the Ampere shape, slide to 4 OCPUs/24GB, select your network).
2. Instead of clicking the blue "Create" button at the bottom, look right next to it and click **"Save as stack"**.
3. On the next page, click **"Download Terraform configuration"**.
4. Unzip the downloaded folder and open the `main.tf` file in a text editor.
5. In that file, you will clearly see your `compartment_id`, `subnet_id`, and `source_id` (this is the Image ID). Copy these strings (they look like `ocid1...`).

**Step 3: Configure and Run the Sniper**
1. Open the file `bin/oci-sniper.sh` in the Total Recall repository.
2. Paste the three OCIDs you just found into the `CONFIGURATION` block at the top of the script.
3. Ensure the `SSH_KEY_FILE` variable points to your public ssh key (e.g., `~/.ssh/id_ed25519.pub`).
4. Run the script from your terminal:
   `./bin/oci-sniper.sh`

You can now minimize the terminal. It will ping Oracle every 60 seconds and trigger a native macOS desktop notification the second it successfully claims your server!

---

### Fallback: DigitalOcean (Paid)
If you are completely blocked by Oracle capacity limits and need a server *immediately* for testing or production, you can bypass Oracle entirely and spin up a droplet on DigitalOcean. 

> [!WARNING]
> DigitalOcean does not have a free tier capable of running Total Recall. The recommended minimum configuration is a 32GB RAM instance (e.g., `s-8vcpu-32gb`), which costs approximately **$160.00/month**.

**Quick Provisioning via API**
If you have a DigitalOcean API Key, you can instantly spin up an identical Ubuntu 24.04 environment using this `curl` command. Replace the `ssh_keys` array with your DigitalOcean SSH Key ID.

```bash
curl -s -X POST "https://api.digitalocean.com/v2/droplets" \
-H "Content-Type: application/json" \
-H "Authorization: Bearer YOUR_DO_API_KEY" \
-d '{
  "name": "total-recall-brain",
  "region": "nyc3",
  "size": "s-8vcpu-32gb-amd",
  "image": "ubuntu-24-04-x64",
  "ssh_keys": [YOUR_KEY_ID],
  "backups": false,
  "monitoring": true,
  "tags": ["total-recall"]
}'
```

Once the Droplet boots and you receive your public IP, simply SSH in as root and run the canonical deploy command:
`npx total-recall deploy`

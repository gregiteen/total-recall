#!/bin/bash

# Oracle Cloud Instance Auto-Provisioning Sniper
# This script will continuously attempt to create an Ampere A1 instance
# until capacity is available in your region.

# --- CONFIGURATION (Replace these with your exact OCIDs from the Oracle Console) ---
COMPARTMENT_ID="ocid1.tenancy.oc1..aaaaaaaabjccfnrjtwyf2shaww62vxpavualyuxr277uhgd66yyxjw2wjg2a"
SUBNET_ID="ocid1.subnet.oc1.phx.aaaaaaaatpvwsqwnxzbmacl4nwfqrqlky4br25iv2muyk36b4oe7vmfzfcia"
IMAGE_ID="ocid1.image.oc1.phx.aaaaaaaaza5inn2bm77iz5yqaobyqi6x5k2w7buo4tbekiijkuluetyr3dkq"
SSH_KEY_FILE="$HOME/.ssh/id_ed25519.pub"
AVAILABILITY_DOMAIN="JJIu:PHX-AD-1" # Switched to AD-1 since AD-2 was out of capacity
SHAPE="VM.Standard.A1.Flex"
OCPUS=4
MEMORY=24
# -----------------------------------------------------------------------------------

if ! command -v ~/bin/oci &> /dev/null && ! command -v oci &> /dev/null; then
    echo "OCI CLI is not installed."
    echo "1. Install it via Homebrew: brew install oci-cli"
    echo "2. Authenticate: ~/bin/oci setup config"
    exit 1
fi

# Determine correct oci binary path
OCI_BIN="oci"
if [ -x "$HOME/bin/oci" ]; then
    OCI_BIN="$HOME/bin/oci"
fi

echo "Starting OCI Sniper... Target: $SHAPE ($OCPUS OCPUs, $MEMORY GB RAM) in $AVAILABILITY_DOMAIN"

while true; do
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Attempting to provision instance..."
    
    # Capture both stdout and stderr, and the exit code
    OUTPUT=$($OCI_BIN compute instance launch \
        --compartment-id "$COMPARTMENT_ID" \
        --availability-domain "$AVAILABILITY_DOMAIN" \
        --shape "$SHAPE" \
        --shape-config "{\"memoryInGBs\": $MEMORY, \"ocpus\": $OCPUS}" \
        --subnet-id "$SUBNET_ID" \
        --image-id "$IMAGE_ID" \
        --ssh-authorized-keys-file "$SSH_KEY_FILE" \
        --display-name "Total-Recall-Brain" \
        --assign-public-ip true 2>&1)
    
    EXIT_CODE=$?

    if [ $EXIT_CODE -eq 0 ]; then
        echo "✅ SUCCESS! Instance provisioned."
        echo "$OUTPUT"
        
        # Trigger macOS Desktop Notification
        osascript -e 'display notification "Your 24GB Oracle instance has been successfully provisioned!" with title "Total Recall Sniper"'
        if [ -f "node .agent/skills/notifications/scripts/notify.mjs" ]; then
            node .agent/skills/notifications/scripts/notify.mjs "Total Recall Sniper" "Your 24GB Oracle instance has been successfully provisioned! Go to your dashboard to get the IP."
        fi

        echo "Sniper terminating. Go check your Oracle Dashboard!"
        exit 0
    else
        # It failed. Let's just print the error and wait 60 seconds to try again.
        echo "❌ Provisioning failed (Oracle API is busy or out of capacity). Retrying in 60 seconds..."
        # If they want to see the error they can check the terminal output:
        echo "$OUTPUT" | grep -E '"message"|"code"|Exception' | head -n 3
        sleep 60
    fi
done
